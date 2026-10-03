import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LandProject,
  LandParcel,
  LandLine,
  LandMarker,
  GeoPoint,
  ToolMode,
  BasemapId,
  UnitSystem,
  CATEGORY_PRESETS,
  SolarPanelConfig,
  SoilMetricType,
  ClimateMetricType,
  UserLocation,
} from './types';
import { SAMPLE_PROJECTS } from './data/sampleProjects';
import { calculateGeodesicArea, calculatePerimeter } from './utils/geoMath';
import { DEFAULT_SOLAR_CONFIG } from './utils/solarCalculator';
import {
  exportToGeoJSON,
  importGeoJSONToProject,
  downloadFile,
} from './utils/exportImport';

import { Header } from './components/Header';
import { DrawingToolbar } from './components/DrawingToolbar';
import { MapCanvas } from './components/MapCanvas';
import { SidePanel } from './components/SidePanel';
import { ExportModal } from './components/ExportModal';
import { LocationSearch } from './components/LocationSearch';
import { StatusBar } from './components/StatusBar';

import type { Map as LeafletMap } from 'leaflet';

const STORAGE_KEY = 'geomark_satellite_projects_v1';
const ACTIVE_PROJ_KEY = 'geomark_active_project_id';

export default function App() {
  // Load saved projects or fallback to initial samples
  const [projects, setProjects] = useState<LandProject[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load projects from storage:', e);
    }
    return SAMPLE_PROJECTS;
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    try {
      const storedId = localStorage.getItem(ACTIVE_PROJ_KEY);
      if (storedId && projects.some((p) => p.id === storedId)) {
        return storedId;
      }
    } catch {}
    return projects[0]?.id || SAMPLE_PROJECTS[0].id;
  });

  // Current active project
  const currentProject = projects.find((p) => p.id === activeProjectId) || projects[0] || SAMPLE_PROJECTS[0];

  // Tool & drawing states
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const [draftPoints, setDraftPoints] = useState<GeoPoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // Basemap & layers
  const [basemapId, setBasemapId] = useState<BasemapId>('esri_satellite');
  const [showLabels, setShowLabels] = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);
  const [showSetbacks, setShowSetbacks] = useState(true);
  const [snappingEnabled, setSnappingEnabled] = useState(true);

  // Soil Quality Heatmap & Solar Estimator states
  const [showSoilHeatmap, setShowSoilHeatmap] = useState(false);
  const [soilMetric, setSoilMetric] = useState<SoilMetricType>('suitability_index');
  const [soilOpacity, setSoilOpacity] = useState(0.55);
  const [showPvRowsOverlay, setShowPvRowsOverlay] = useState(false);
  const [solarConfig, setSolarConfig] = useState<SolarPanelConfig>(DEFAULT_SOLAR_CONFIG);

  // Regional Climate & Meteorological Heatmap states
  const [showClimateHeatmap, setShowClimateHeatmap] = useState(false);
  const [climateMetric, setClimateMetric] = useState<ClimateMetricType>('rainfall');
  const [climateOpacity, setClimateOpacity] = useState(0.55);

  // Elevation Profile interactive states
  const [elevationHoverPoint, setElevationHoverPoint] = useState<{ point: GeoPoint; label?: string } | null>(null);
  const [elevationTransectCoords, setElevationTransectCoords] = useState<GeoPoint[]>([]);

  // User Real-Time Geolocation Tracking states
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isLocationTracking, setIsLocationTracking] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const hasAutoCenteredToUserRef = useRef(false);

  // Sidebar & modal states
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);
  const [activePanelTab, setActivePanelTab] = useState<'parcels' | 'details' | 'layers' | 'projects'>('parcels');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isLocationSearchOpen, setIsLocationSearchOpen] = useState(false);

  // Status and feedback
  const [cursorCoords, setCursorCoords] = useState<GeoPoint | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(currentProject.zoom || 16);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Leaflet map instance reference
  const leafletMapRef = useRef<LeafletMap | null>(null);

  // Robust Undo / Redo history stack: initialized with the active project
  const [history, setHistory] = useState<LandProject[]>([currentProject]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Push project state into history
  const pushHistory = useCallback(
    (newProjectState: LandProject) => {
      setHistory((prev) => {
        const nextHistory = prev.slice(0, historyIndex + 1);
        return [...nextHistory, newProjectState];
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [historyIndex]
  );

  // Update current project
  const updateProject = useCallback(
    (updated: LandProject, recordHistory = true) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : p))
      );
      if (recordHistory) {
        pushHistory(updated);
      }
    },
    [pushHistory]
  );

  // Auto-save projects to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      localStorage.setItem(ACTIVE_PROJ_KEY, activeProjectId);
    } catch (e) {
      console.error('Failed to persist projects:', e);
    }
  }, [projects, activeProjectId]);

  // Handle explicit save button
  const handleSaveProject = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      localStorage.setItem(ACTIVE_PROJ_KEY, activeProjectId);
      setSaveMessage('Saved!');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch {
      setSaveMessage('Error saving');
      setTimeout(() => setSaveMessage(null), 2000);
    }
  };

  // Undo / Redo handlers (Supports both in-drawing vertex undo and project state undo)
  const handleUndo = () => {
    if (isDrawing && draftPoints.length > 0) {
      // Undo last vertex while drawing
      setDraftPoints((prev) => prev.slice(0, -1));
    } else if (historyIndex > 0) {
      const prevProject = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      updateProject(prevProject, false);
    }
  };

  const handleRedo = () => {
    if (!isDrawing && historyIndex < history.length - 1) {
      const nextProject = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      updateProject(nextProject, false);
    }
  };

  const canUndo = (isDrawing && draftPoints.length > 0) || historyIndex > 0;
  const canRedo = !isDrawing && historyIndex < history.length - 1;

  // Switch active project
  const handleSelectProject = (id: string) => {
    setActiveProjectId(id);
    setSelectedParcelId(null);
    setSelectedLineId(null);
    setSelectedMarkerId(null);
    setDraftPoints([]);
    setIsDrawing(false);

    const targetProj = projects.find((p) => p.id === id);
    if (targetProj) {
      setHistory([targetProj]);
      setHistoryIndex(0);
      if (leafletMapRef.current) {
        leafletMapRef.current.setView([targetProj.center.lat, targetProj.center.lng], targetProj.zoom || 16, {
          animate: true,
        });
      }
    }
  };

  // Create new blank project
  const handleNewProject = () => {
    const newId = `proj_${Date.now()}`;
    const newProj: LandProject = {
      id: newId,
      name: `Land Layout Project ${projects.length + 1}`,
      description: 'Satellite parcel boundary layout and zone survey.',
      clientOrOwner: 'Client / Land Owner',
      locationName: 'Property Site Location',
      center: currentProject.center,
      zoom: 16,
      unitPreference: currentProject.unitPreference,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parcels: [],
      lines: [],
      markers: [],
    };

    setProjects((prev) => [...prev, newProj]);
    setActiveProjectId(newId);
    setHistory([newProj]);
    setHistoryIndex(0);
    setSelectedParcelId(null);
    setSelectedLineId(null);
    setSelectedMarkerId(null);
    setActivePanelTab('parcels');
  };

  // Update project metadata
  const handleUpdateProjectMeta = (name: string, client?: string, location?: string, desc?: string) => {
    const updated = {
      ...currentProject,
      name,
      clientOrOwner: client,
      locationName: location,
      description: desc,
    };
    updateProject(updated);
  };

  // Toggle unit preference
  const handleToggleUnit = () => {
    const newUnit: UnitSystem = currentProject.unitPreference === 'imperial' ? 'metric' : 'imperial';
    updateProject({ ...currentProject, unitPreference: newUnit });
  };

  // Tool change
  const handleSelectTool = (mode: ToolMode) => {
    setToolMode(mode);
    if (mode === 'polygon' || mode === 'line' || mode === 'measure') {
      setIsDrawing(true);
      setDraftPoints([]);
      setSelectedParcelId(null);
      setSelectedLineId(null);
      setSelectedMarkerId(null);
    } else {
      setIsDrawing(false);
      setDraftPoints([]);
    }
  };

  // Complete drawing polygon, line, or measure
  const handleFinishDrawing = () => {
    // Deduplicate adjacent identical points (e.g. from double-clicks)
    const sanitizedPoints = draftPoints.filter(
      (pt, i, arr) => i === 0 || Math.abs(pt.lat - arr[i - 1].lat) > 1e-7 || Math.abs(pt.lng - arr[i - 1].lng) > 1e-7
    );

    if (toolMode === 'polygon' && sanitizedPoints.length >= 3) {
      const area = calculateGeodesicArea(sanitizedPoints);
      const perim = calculatePerimeter(sanitizedPoints);
      const parcelNum = currentProject.parcels.length + 1;
      const defaultCat = 'agricultural';
      const preset = CATEGORY_PRESETS[defaultCat];

      const newParcel: LandParcel = {
        id: `parcel_${Date.now()}`,
        name: `Parcel #${parcelNum} - Zone`,
        category: defaultCat,
        color: preset.defaultColor,
        strokeColor: preset.defaultStroke,
        fillOpacity: preset.fillOpacity,
        strokeWidth: 2,
        coordinates: sanitizedPoints,
        areaSqMeters: area,
        perimeterMeters: perim,
        zoningCode: 'AP-1',
        setbackMeters: 0,
      };

      const updatedProject = {
        ...currentProject,
        parcels: [...currentProject.parcels, newParcel],
      };
      updateProject(updatedProject);
      setSelectedParcelId(newParcel.id);
      setActivePanelTab('details');
      setIsSidePanelOpen(true);
    } else if (toolMode === 'line' && sanitizedPoints.length >= 2) {
      const lineLen = calculatePerimeter(sanitizedPoints, false);
      const lineNum = currentProject.lines.length + 1;

      const newLine: LandLine = {
        id: `line_${Date.now()}`,
        name: `Fence / Road Boundary #${lineNum}`,
        type: 'fence',
        color: '#f59e0b',
        strokeWidth: 3,
        coordinates: sanitizedPoints,
        lengthMeters: lineLen,
      };

      const updatedProject = {
        ...currentProject,
        lines: [...currentProject.lines, newLine],
      };
      updateProject(updatedProject);
      setSelectedLineId(newLine.id);
      setActivePanelTab('details');
      setIsSidePanelOpen(true);
    }

    setDraftPoints([]);
    setIsDrawing(false);
    setToolMode('select');
  };

  const handleCancelDrawing = () => {
    setDraftPoints([]);
    setIsDrawing(false);
    setToolMode('select');
  };

  // Parcel operations
  const handleUpdateParcelCoords = (parcelId: string, newCoords: GeoPoint[]) => {
    const area = calculateGeodesicArea(newCoords);
    const perim = calculatePerimeter(newCoords);

    const updatedParcels = currentProject.parcels.map((p) =>
      p.id === parcelId
        ? {
            ...p,
            coordinates: newCoords,
            areaSqMeters: area,
            perimeterMeters: perim,
          }
        : p
    );

    updateProject({ ...currentProject, parcels: updatedParcels });
  };

  const handleUpdateParcel = (updated: LandParcel) => {
    const updatedParcels = currentProject.parcels.map((p) => (p.id === updated.id ? updated : p));
    updateProject({ ...currentProject, parcels: updatedParcels });
  };

  const handleDeleteParcel = (id: string) => {
    const updatedParcels = currentProject.parcels.filter((p) => p.id !== id);
    updateProject({ ...currentProject, parcels: updatedParcels });
    if (selectedParcelId === id) {
      setSelectedParcelId(null);
      setActivePanelTab('parcels');
    }
  };

  const handleDuplicateParcel = (parcel: LandParcel) => {
    const offsetCoords = parcel.coordinates.map((c) => ({
      lat: c.lat + 0.0003,
      lng: c.lng + 0.0003,
    }));

    const dupe: LandParcel = {
      ...parcel,
      id: `parcel_${Date.now()}`,
      name: `${parcel.name} (Copy)`,
      coordinates: offsetCoords,
      areaSqMeters: calculateGeodesicArea(offsetCoords),
      perimeterMeters: calculatePerimeter(offsetCoords),
    };

    updateProject({ ...currentProject, parcels: [...currentProject.parcels, dupe] });
    setSelectedParcelId(dupe.id);
  };

  // Line operations
  const handleUpdateLineCoords = (lineId: string, newCoords: GeoPoint[]) => {
    const len = calculatePerimeter(newCoords, false);
    const updatedLines = currentProject.lines.map((l) =>
      l.id === lineId ? { ...l, coordinates: newCoords, lengthMeters: len } : l
    );
    updateProject({ ...currentProject, lines: updatedLines });
  };

  const handleUpdateLine = (updated: LandLine) => {
    const updatedLines = currentProject.lines.map((l) => (l.id === updated.id ? updated : l));
    updateProject({ ...currentProject, lines: updatedLines });
  };

  const handleDeleteLine = (id: string) => {
    const updatedLines = currentProject.lines.filter((l) => l.id !== id);
    updateProject({ ...currentProject, lines: updatedLines });
    if (selectedLineId === id) setSelectedLineId(null);
  };

  // Marker operations
  const handleAddMarker = (newMarker: Omit<LandMarker, 'id'>) => {
    const markerWithId: LandMarker = {
      ...newMarker,
      id: `marker_${Date.now()}`,
    };
    updateProject({ ...currentProject, markers: [...currentProject.markers, markerWithId] });
    setSelectedMarkerId(markerWithId.id);
    setSelectedParcelId(null);
    setSelectedLineId(null);
    setActivePanelTab('details');
    setIsSidePanelOpen(true);
    // Switch back to select mode so user doesn't accidentally drop pins on every subsequent click
    setToolMode('select');
  };

  const handleUpdateMarkerPoint = (markerId: string, newPoint: GeoPoint) => {
    const updatedMarkers = currentProject.markers.map((m) =>
      m.id === markerId ? { ...m, point: newPoint } : m
    );
    updateProject({ ...currentProject, markers: updatedMarkers });
  };

  const handleUpdateMarker = (updated: LandMarker) => {
    const updatedMarkers = currentProject.markers.map((m) => (m.id === updated.id ? updated : m));
    updateProject({ ...currentProject, markers: updatedMarkers });
  };

  const handleDeleteMarker = (id: string) => {
    const updatedMarkers = currentProject.markers.filter((m) => m.id !== id);
    updateProject({ ...currentProject, markers: updatedMarkers });
    if (selectedMarkerId === id) setSelectedMarkerId(null);
  };

  // Backup & Import
  const handleExportProjectJSON = () => {
    const jsonStr = JSON.stringify(currentProject, null, 2);
    const cleanName = currentProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    downloadFile(jsonStr, `${cleanName}_backup.json`, 'application/json');
  };

  const handleImportProjectFile = async (file: File) => {
    try {
      const text = await file.text();
      if (file.name.endsWith('.geojson') || text.includes('"FeatureCollection"')) {
        const updated = importGeoJSONToProject(text, currentProject);
        updateProject(updated);
        setSaveMessage('GeoJSON Imported!');
      } else {
        const parsed = JSON.parse(text);
        if (parsed.parcels && Array.isArray(parsed.parcels)) {
          const importedProj: LandProject = {
            ...parsed,
            id: `proj_${Date.now()}`,
            name: parsed.name ? `${parsed.name} (Imported)` : 'Imported Project',
          };
          setProjects((prev) => [...prev, importedProj]);
          setActiveProjectId(importedProj.id);
          setHistory([importedProj]);
          setHistoryIndex(0);
          setSaveMessage('Project Imported!');
        }
      }
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (err) {
      console.error('Import error:', err);
      alert('Unable to import file. Please verify it is valid GeoJSON or GeoMark JSON backup.');
    }
  };

  // Selection auto-tab switch
  const handleSelectParcel = (id: string | null) => {
    setSelectedParcelId(id);
    setElevationHoverPoint(null);
    setElevationTransectCoords([]);
    if (id) {
      setActivePanelTab('details');
      setIsSidePanelOpen(true);
    }
  };

  // Location search selected
  const handleLocationSelected = (coords: GeoPoint, name: string) => {
    const updated = {
      ...currentProject,
      center: coords,
      locationName: name,
    };
    updateProject(updated);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === 'v' || e.key === 'V') handleSelectTool('select');
      if (e.key === 'p' || e.key === 'P') handleSelectTool('polygon');
      if (e.key === 'l' || e.key === 'L') handleSelectTool('line');
      if (e.key === 'm' || e.key === 'M') handleSelectTool('marker');
      if (e.key === 'r' || e.key === 'R') handleSelectTool('measure');

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }

      if (e.key === 'Escape') {
        if (isDrawing) handleCancelDrawing();
        else {
          setSelectedParcelId(null);
          setSelectedLineId(null);
          setSelectedMarkerId(null);
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedParcelId) handleDeleteParcel(selectedParcelId);
        else if (selectedLineId) handleDeleteLine(selectedLineId);
        else if (selectedMarkerId) handleDeleteMarker(selectedMarkerId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isDrawing,
    draftPoints.length,
    selectedParcelId,
    selectedLineId,
    selectedMarkerId,
    historyIndex,
    history.length,
  ]);

  // Geolocation position handlers & real-time tracking
  const handlePositionSuccess = useCallback((pos: GeolocationPosition, autoCenter = false) => {
    const newLoc: UserLocation = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      altitude: pos.coords.altitude,
      timestamp: pos.timestamp,
    };
    setUserLocation(newLoc);
    setIsLocating(false);
    setLocationError(null);
    setIsLocationTracking(true);

    if (autoCenter || !hasAutoCenteredToUserRef.current) {
      hasAutoCenteredToUserRef.current = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.setView([newLoc.lat, newLoc.lng], 16, { animate: true });
      }
    }
  }, []);

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    setIsLocating(false);
    let msg = 'Unable to acquire location';
    if (err.code === err.PERMISSION_DENIED) {
      msg = 'Location permission denied by browser.';
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      msg = 'Location signal unavailable.';
    } else if (err.code === err.TIMEOUT) {
      msg = 'Location request timed out.';
    }
    setLocationError(msg);
  }, []);

  // Start real-time GPS location tracking
  const startLocationTracking = useCallback((autoCenter = false) => {
    if (!('geolocation' in navigator)) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => handlePositionSuccess(pos, autoCenter),
      (err) => handlePositionError(err),
      geoOptions
    );

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    try {
      const id = navigator.geolocation.watchPosition(
        (pos) => handlePositionSuccess(pos, false),
        (err) => {
          if (!userLocation) {
            handlePositionError(err);
          }
        },
        geoOptions
      );
      watchIdRef.current = id;
    } catch (e) {
      console.error('Failed to setup watchPosition:', e);
    }
  }, [handlePositionSuccess, handlePositionError, userLocation]);

  // Stop real-time GPS location tracking
  const stopLocationTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsLocationTracking(false);
    setIsLocating(false);
  }, []);

  // Toggle location tracking on/off
  const handleToggleLocationTracking = useCallback(() => {
    if (isLocationTracking) {
      stopLocationTracking();
    } else {
      startLocationTracking(true);
    }
  }, [isLocationTracking, stopLocationTracking, startLocationTracking]);

  // Center map on user location
  const handleCenterUserLocation = useCallback(() => {
    if (userLocation && leafletMapRef.current) {
      leafletMapRef.current.setView([userLocation.lat, userLocation.lng], 16, { animate: true });
    } else {
      startLocationTracking(true);
    }
  }, [userLocation, startLocationTracking]);

  // Automatically start geolocation tracking and point setup to user location when started
  useEffect(() => {
    startLocationTracking(true);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Top Bar Contract (Wordmark, Nav/Metadata, Actions) */}
      <Header
        currentProject={currentProject}
        projects={projects}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onSaveProject={handleSaveProject}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onToggleUnit={handleToggleUnit}
        onOpenLocationSearch={() => setIsLocationSearchOpen(true)}
        activePanelTab={activePanelTab}
        onSelectPanelTab={(tab) => {
          setActivePanelTab(tab);
          setIsSidePanelOpen(true);
        }}
        saveMessage={saveMessage}
      />

      {/* Main Workspace (Map Canvas + Drawing Toolbar + Side Panel) */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Left Floating Drawing Toolbar */}
        <DrawingToolbar
          toolMode={toolMode}
          onSelectTool={handleSelectTool}
          snappingEnabled={snappingEnabled}
          onToggleSnapping={() => setSnappingEnabled(!snappingEnabled)}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          isDrawing={isDrawing}
          draftPoints={draftPoints}
          cursorCoords={cursorCoords}
          unitPreference={currentProject.unitPreference}
          onFinishDrawing={handleFinishDrawing}
          onCancelDrawing={handleCancelDrawing}
        />

        {/* Center Satellite Map Viewport */}
        <main className="flex-1 relative h-full">
          <MapCanvas
            project={currentProject}
            toolMode={toolMode}
            selectedParcelId={selectedParcelId}
            selectedLineId={selectedLineId}
            selectedMarkerId={selectedMarkerId}
            onSelectParcel={handleSelectParcel}
            onSelectLine={(id) => {
              setSelectedLineId(id);
              setElevationHoverPoint(null);
              setElevationTransectCoords([]);
              if (id) {
                setActivePanelTab('details');
                setIsSidePanelOpen(true);
              }
            }}
            onSelectMarker={(id) => {
              setSelectedMarkerId(id);
              setElevationHoverPoint(null);
              setElevationTransectCoords([]);
              if (id) {
                setActivePanelTab('details');
                setIsSidePanelOpen(true);
              }
            }}
            onUpdateParcelCoords={handleUpdateParcelCoords}
            onUpdateLineCoords={handleUpdateLineCoords}
            onUpdateMarkerPoint={handleUpdateMarkerPoint}
            onAddParcel={(newParcel) => {
              const parcelWithId: LandParcel = {
                ...newParcel,
                id: `parcel_${Date.now()}`,
              };
              updateProject({ ...currentProject, parcels: [...currentProject.parcels, parcelWithId] });
            }}
            onAddLine={(newLine) => {
              const lineWithId: LandLine = {
                ...newLine,
                id: `line_${Date.now()}`,
              };
              updateProject({ ...currentProject, lines: [...currentProject.lines, lineWithId] });
            }}
            onAddMarker={handleAddMarker}
            basemapId={basemapId}
            showLabels={showLabels}
            showDimensions={showDimensions}
            showSetbacks={showSetbacks}
            snappingEnabled={snappingEnabled}
            showSoilHeatmap={showSoilHeatmap}
            soilMetric={soilMetric}
            soilOpacity={soilOpacity}
            showClimateHeatmap={showClimateHeatmap}
            climateMetric={climateMetric}
            climateOpacity={climateOpacity}
            onSelectClimateMetric={setClimateMetric}
            showPvRowsOverlay={showPvRowsOverlay}
            solarConfig={solarConfig}
            onCursorMove={(coords, zoom) => {
              setCursorCoords(coords);
              setZoomLevel(zoom);
            }}
            onMapInstanceReady={(map) => {
              leafletMapRef.current = map;
              if (userLocation && !hasAutoCenteredToUserRef.current) {
                hasAutoCenteredToUserRef.current = true;
                map.setView([userLocation.lat, userLocation.lng], 16, { animate: true });
              }
            }}
            isDrawing={isDrawing}
            draftPoints={draftPoints}
            onDraftPointsChange={setDraftPoints}
            onFinishDrawing={handleFinishDrawing}
            elevationHoverPoint={elevationHoverPoint}
            elevationTransectCoords={elevationTransectCoords}
            userLocation={userLocation}
            isLocating={isLocating}
            isLocationTracking={isLocationTracking}
            onToggleLocationTracking={handleToggleLocationTracking}
            onCenterUserLocation={handleCenterUserLocation}
            locationError={locationError}
          />
        </main>

        {/* Right Collapsible Side Panel */}
        <SidePanel
          project={currentProject}
          activeTab={activePanelTab}
          onSelectTab={setActivePanelTab}
          selectedParcelId={selectedParcelId}
          selectedLineId={selectedLineId}
          selectedMarkerId={selectedMarkerId}
          onSelectParcel={handleSelectParcel}
          onSelectLine={setSelectedLineId}
          onSelectMarker={setSelectedMarkerId}
          onUpdateParcel={handleUpdateParcel}
          onDeleteParcel={handleDeleteParcel}
          onDuplicateParcel={handleDuplicateParcel}
          onUpdateLine={handleUpdateLine}
          onDeleteLine={handleDeleteLine}
          onUpdateMarker={handleUpdateMarker}
          onDeleteMarker={handleDeleteMarker}
          basemapId={basemapId}
          onSelectBasemap={setBasemapId}
          showLabels={showLabels}
          onToggleLabels={() => setShowLabels(!showLabels)}
          showDimensions={showDimensions}
          onToggleDimensions={() => setShowDimensions(!showDimensions)}
          showSetbacks={showSetbacks}
          onToggleSetbacks={() => setShowSetbacks(!showSetbacks)}
          snappingEnabled={snappingEnabled}
          onToggleSnapping={() => setSnappingEnabled(!snappingEnabled)}
          solarConfig={solarConfig}
          onUpdateSolarConfig={setSolarConfig}
          showPvRowsOverlay={showPvRowsOverlay}
          onTogglePvRowsOverlay={() => setShowPvRowsOverlay(!showPvRowsOverlay)}
          showSoilHeatmap={showSoilHeatmap}
          onToggleSoilHeatmap={() => setShowSoilHeatmap(!showSoilHeatmap)}
          soilMetric={soilMetric}
          onSelectSoilMetric={setSoilMetric}
          soilOpacity={soilOpacity}
          onUpdateSoilOpacity={setSoilOpacity}
          showClimateHeatmap={showClimateHeatmap}
          onToggleClimateHeatmap={() => setShowClimateHeatmap(!showClimateHeatmap)}
          climateMetric={climateMetric}
          onSelectClimateMetric={setClimateMetric}
          climateOpacity={climateOpacity}
          onUpdateClimateOpacity={setClimateOpacity}
          projects={projects}
          onSelectProject={handleSelectProject}
          onNewProject={handleNewProject}
          onUpdateProjectMeta={handleUpdateProjectMeta}
          onExportProjectJSON={handleExportProjectJSON}
          onImportProjectFile={handleImportProjectFile}
          leafletMap={leafletMapRef.current}
          isOpen={isSidePanelOpen}
          onToggleOpen={() => setIsSidePanelOpen(!isSidePanelOpen)}
          onStartDrawingParcel={() => handleSelectTool('polygon')}
          onElevationHoverPoint={(point, label) => setElevationHoverPoint(point ? { point, label } : null)}
          onTransectCoordsChange={setElevationTransectCoords}
        />
      </div>

      {/* Bottom Status & Coordinate Bar */}
      <StatusBar
        cursorCoords={cursorCoords}
        zoomLevel={zoomLevel}
        toolMode={toolMode}
        snappingEnabled={snappingEnabled}
        parcelCount={currentProject.parcels.length}
        isDrawing={isDrawing}
        draftPointCount={draftPoints.length}
        userLocation={userLocation}
      />

      {/* Export Map File Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        project={currentProject}
        leafletMap={leafletMapRef.current}
      />

      {/* Satellite Location Search Modal */}
      <LocationSearch
        isOpen={isLocationSearchOpen}
        onClose={() => setIsLocationSearchOpen(false)}
        leafletMap={leafletMapRef.current}
        onLocationSelected={handleLocationSelected}
        onAddMarker={handleAddMarker}
        currentCenter={currentProject.center}
        unitPreference={currentProject.unitPreference}
      />
    </div>
  );
}
