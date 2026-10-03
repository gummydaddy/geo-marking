import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  LandProject,
  LandParcel,
  LandLine,
  LandMarker,
  GeoPoint,
  ToolMode,
  BasemapId,
  CATEGORY_PRESETS,
  SolarPanelConfig,
  SoilMetricType,
  ClimateMetricType,
  UserLocation,
} from '../types';
import {
  calculateGeodesicArea,
  calculatePerimeter,
  calculateCentroid,
  calculateDistance,
  formatArea,
  formatDistance,
  generateSetbackPolygon,
} from '../utils/geoMath';
import { Navigation, Loader2, AlertCircle, Crosshair, Globe, X, Search } from 'lucide-react';
import { generateSolarArrayRows } from '../utils/solarCalculator';
import {
  getSoilProbe,
  SOIL_METRIC_CONFIGS,
} from '../utils/soilDataGenerator';
import {
  fetchRegionalClimateStats,
  getClimateProbe,
  getClimateColorRgba,
  CLIMATE_METRIC_CONFIGS,
  RegionalClimateStats,
} from '../utils/climateService';
import { resolveCartoTileConfig } from '../utils/cartoConfig';

interface MapCanvasProps {
  project: LandProject;
  toolMode: ToolMode;
  selectedParcelId: string | null;
  selectedLineId: string | null;
  selectedMarkerId: string | null;
  onSelectParcel: (id: string | null) => void;
  onSelectLine: (id: string | null) => void;
  onSelectMarker: (id: string | null) => void;
  onUpdateParcelCoords: (parcelId: string, newCoords: GeoPoint[]) => void;
  onUpdateLineCoords: (lineId: string, newCoords: GeoPoint[]) => void;
  onUpdateMarkerPoint: (markerId: string, newPoint: GeoPoint) => void;
  onAddParcel: (newParcel: Omit<LandParcel, 'id'>) => void;
  onAddLine: (newLine: Omit<LandLine, 'id'>) => void;
  onAddMarker: (newMarker: Omit<LandMarker, 'id'>) => void;
  basemapId: BasemapId;
  showLabels: boolean;
  showDimensions: boolean;
  showSetbacks: boolean;
  snappingEnabled: boolean;
  showSoilHeatmap: boolean;
  soilMetric: SoilMetricType;
  soilOpacity: number;
  showClimateHeatmap: boolean;
  climateMetric: ClimateMetricType;
  climateOpacity: number;
  onSelectClimateMetric?: (metric: ClimateMetricType) => void;
  showPvRowsOverlay: boolean;
  solarConfig: SolarPanelConfig;
  onCursorMove: (coords: GeoPoint, zoom: number) => void;
  onMapInstanceReady: (map: L.Map) => void;
  isDrawing: boolean;
  draftPoints: GeoPoint[];
  onDraftPointsChange: (points: GeoPoint[]) => void;
  onFinishDrawing: () => void;
  elevationHoverPoint?: { point: GeoPoint; label?: string } | null;
  elevationTransectCoords?: GeoPoint[];
  userLocation?: UserLocation | null;
  isLocating?: boolean;
  isLocationTracking?: boolean;
  onToggleLocationTracking?: () => void;
  onCenterUserLocation?: () => void;
  locationError?: string | null;
  onUseIpLocation?: () => void;
  onDismissLocationError?: () => void;
  onOpenLocationSearch?: () => void;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  project,
  toolMode,
  selectedParcelId,
  selectedLineId,
  selectedMarkerId,
  onSelectParcel,
  onSelectLine,
  onSelectMarker,
  onUpdateParcelCoords,
  onUpdateLineCoords,
  onUpdateMarkerPoint,
  onAddParcel,
  onAddLine,
  onAddMarker,
  basemapId,
  showLabels,
  showDimensions,
  showSetbacks,
  snappingEnabled,
  showSoilHeatmap,
  soilMetric,
  soilOpacity,
  showClimateHeatmap,
  climateMetric,
  climateOpacity,
  onSelectClimateMetric,
  showPvRowsOverlay,
  solarConfig,
  onCursorMove,
  onMapInstanceReady,
  isDrawing,
  draftPoints,
  onDraftPointsChange,
  onFinishDrawing,
  elevationHoverPoint,
  elevationTransectCoords,
  userLocation,
  isLocating,
  isLocationTracking,
  onToggleLocationTracking,
  onCenterUserLocation,
  locationError,
  onUseIpLocation,
  onDismissLocationError,
  onOpenLocationSearch,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const overlayLabelLayerRef = useRef<L.TileLayer | null>(null);

  // Layers group refs
  const parcelsLayerRef = useRef<L.FeatureGroup | null>(null);
  const linesLayerRef = useRef<L.FeatureGroup | null>(null);
  const markersLayerRef = useRef<L.FeatureGroup | null>(null);
  const editHandlesLayerRef = useRef<L.FeatureGroup | null>(null);
  const draftLayerRef = useRef<L.FeatureGroup | null>(null);
  const snapIndicatorLayerRef = useRef<L.FeatureGroup | null>(null);
  const pvRowsLayerRef = useRef<L.FeatureGroup | null>(null);
  const soilOverlayRef = useRef<L.ImageOverlay | null>(null);
  const climateOverlayRef = useRef<L.ImageOverlay | null>(null);
  const elevationLayerRef = useRef<L.FeatureGroup | null>(null);
  const userLocationLayerRef = useRef<L.FeatureGroup | null>(null);

  // Regional climate statistics state
  const [regionalClimateStats, setRegionalClimateStats] = useState<RegionalClimateStats | null>(null);

  // Live mouse hover preview for drawing & snapping
  const [hoverPoint, setHoverPoint] = useState<GeoPoint | null>(null);
  const [activeSnapTarget, setActiveSnapTarget] = useState<GeoPoint | null>(null);
  const [cartoKeyVersion, setCartoKeyVersion] = useState(0);

  // Listen to manual or dynamic CARTO key changes so map reloads instantly
  useEffect(() => {
    const handleKeyChange = () => setCartoKeyVersion((v) => v + 1);
    window.addEventListener('carto-key-updated', handleKeyChange);
    return () => window.removeEventListener('carto-key-updated', handleKeyChange);
  }, []);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [project.center.lat, project.center.lng],
      zoom: project.zoom || 16,
      zoomControl: false,
      attributionControl: true,
      maxZoom: 24,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Initialize layer groups in order of stacking
    parcelsLayerRef.current = L.featureGroup().addTo(map);
    pvRowsLayerRef.current = L.featureGroup().addTo(map);
    linesLayerRef.current = L.featureGroup().addTo(map);
    markersLayerRef.current = L.featureGroup().addTo(map);
    editHandlesLayerRef.current = L.featureGroup().addTo(map);
    elevationLayerRef.current = L.featureGroup().addTo(map);
    draftLayerRef.current = L.featureGroup().addTo(map);
    snapIndicatorLayerRef.current = L.featureGroup().addTo(map);
    userLocationLayerRef.current = L.featureGroup().addTo(map);

    mapRef.current = map;
    onMapInstanceReady(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Disable Double-Click Zoom during drawing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isDrawing || toolMode === 'polygon' || toolMode === 'line' || toolMode === 'measure') {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }
  }, [isDrawing, toolMode]);

  // 3. Basemap Tile Layer Switching
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
    }
    if (overlayLabelLayerRef.current) {
      map.removeLayer(overlayLabelLayerRef.current);
      overlayLabelLayerRef.current = null;
    }

    let tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    let attribution = 'Tiles &copy; Esri &mdash; Source: Esri, USDA, USGS';
    let maxNativeZoom = 21;
    const maxZoom = 24;
    let subdomains: string[] | string = 'abc';

    if (basemapId === 'esri_clarity') {
      tileUrl = 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      maxNativeZoom = 21;
    } else if (basemapId === 'usgs_topo') {
      tileUrl = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}';
      attribution = 'USGS The National Map';
      maxNativeZoom = 19;
    } else if (basemapId.startsWith('carto_')) {
      const cartoConfig = resolveCartoTileConfig(basemapId);
      tileUrl = cartoConfig.url;
      subdomains = cartoConfig.subdomains;
      attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
      maxNativeZoom = 22;
    } else if (basemapId === 'osm') {
      tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '&copy; OpenStreetMap contributors';
      maxNativeZoom = 22;
    }

    // Transparent pixel fallback to guarantee map tiles never go black if network drops or 404 occurs
    const transparentFallback =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    baseTileLayerRef.current = L.tileLayer(tileUrl, {
      attribution,
      maxZoom,
      maxNativeZoom,
      keepBuffer: 8,
      subdomains,
      errorTileUrl: transparentFallback,
      crossOrigin: 'anonymous',
    }).addTo(map);

    if (showLabels || basemapId === 'esri_hybrid') {
      overlayLabelLayerRef.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 24,
          maxNativeZoom: 22,
          keepBuffer: 8,
          errorTileUrl: transparentFallback,
          crossOrigin: 'anonymous',
          opacity: 0.85,
        }
      ).addTo(map);
    }
  }, [basemapId, showLabels, cartoKeyVersion]);

  // 4. Soil Quality & Agricultural Suitability Heatmap Overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!showSoilHeatmap) {
      if (soilOverlayRef.current) {
        map.removeLayer(soilOverlayRef.current);
        soilOverlayRef.current = null;
      }
      return;
    }

    const renderSoilHeatmap = () => {
      const bounds = map.getBounds();
      const north = bounds.getNorth();
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const east = bounds.getEast();

      const cols = 56;
      const rows = 42;
      const canvas = document.createElement('canvas');
      canvas.width = cols;
      canvas.height = rows;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imgData = ctx.createImageData(cols, rows);

      for (let r = 0; r < rows; r++) {
        const lat = north - (r / (rows - 1)) * (north - south);
        for (let c = 0; c < cols; c++) {
          const lng = west + (c / (cols - 1)) * (east - west);
          const probe = getSoilProbe({ lat, lng }, project.center);

          let metricScore = probe.suitabilityScore;
          if (soilMetric === 'organic_matter') {
            metricScore = Math.min(100, probe.organicMatterPercent * 20);
          } else if (soilMetric === 'ph_level') {
            const dev = Math.abs(probe.phLevel - 6.5);
            metricScore = Math.max(0, 100 - dev * 40);
          } else if (soilMetric === 'drainage_class') {
            metricScore = probe.drainageClass === 'Well Drained' ? 95 : probe.drainageClass === 'Moderately Well Drained' ? 75 : 45;
          } else if (soilMetric === 'erosion_risk') {
            metricScore = probe.erosionRisk === 'Low' ? 90 : probe.erosionRisk === 'Moderate' ? 60 : 30;
          }

          // Smooth multi-stop color grading
          let red = 239, green = 68, blue = 68;
          if (metricScore >= 85) {
            red = 5; green = 150; blue = 105; // Prime emerald
          } else if (metricScore >= 70) {
            red = 16; green = 185; blue = 129; // Green
          } else if (metricScore >= 55) {
            red = 132; green = 204; blue = 22; // Yellow-green
          } else if (metricScore >= 40) {
            red = 245; green = 158; blue = 11; // Amber
          } else if (metricScore >= 25) {
            red = 249; green = 115; blue = 22; // Orange
          }

          const idx = (r * cols + c) * 4;
          imgData.data[idx] = red;
          imgData.data[idx + 1] = green;
          imgData.data[idx + 2] = blue;
          imgData.data[idx + 3] = Math.round(soilOpacity * 255);
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // High-resolution smoothed GIS canvas
      const smoothCanvas = document.createElement('canvas');
      smoothCanvas.width = 448;
      smoothCanvas.height = 336;
      const sCtx = smoothCanvas.getContext('2d');
      if (sCtx) {
        sCtx.imageSmoothingEnabled = true;
        sCtx.imageSmoothingQuality = 'high';
        sCtx.drawImage(canvas, 0, 0, smoothCanvas.width, smoothCanvas.height);
      }

      const dataUrl = smoothCanvas.toDataURL();
      if (soilOverlayRef.current) {
        soilOverlayRef.current.setUrl(dataUrl);
        soilOverlayRef.current.setBounds(bounds);
      } else {
        soilOverlayRef.current = L.imageOverlay(dataUrl, bounds, {
          opacity: 1,
          interactive: false,
          zIndex: 250,
        }).addTo(map);
      }
    };

    renderSoilHeatmap();
    map.on('moveend', renderSoilHeatmap);

    return () => {
      map.off('moveend', renderSoilHeatmap);
      if (soilOverlayRef.current) {
        map.removeLayer(soilOverlayRef.current);
        soilOverlayRef.current = null;
      }
    };
  }, [showSoilHeatmap, soilMetric, soilOpacity, project.center]);

  // 4.5. Fetch Regional Climate Statistics on Project Center Change
  useEffect(() => {
    let isCurrent = true;
    fetchRegionalClimateStats(project.center).then((stats) => {
      if (isCurrent) setRegionalClimateStats(stats);
    });
    return () => {
      isCurrent = false;
    };
  }, [project.center.lat, project.center.lng]);

  // 4.6. Regional Climate Heatmap Overlay (Annual Rainfall / Wind Speed)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!showClimateHeatmap) {
      if (climateOverlayRef.current) {
        map.removeLayer(climateOverlayRef.current);
        climateOverlayRef.current = null;
      }
      return;
    }

    const renderClimateHeatmap = () => {
      const bounds = map.getBounds();
      const north = bounds.getNorth();
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const east = bounds.getEast();

      const cols = 56;
      const rows = 42;
      const canvas = document.createElement('canvas');
      canvas.width = cols;
      canvas.height = rows;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imgData = ctx.createImageData(cols, rows);

      for (let r = 0; r < rows; r++) {
        const lat = north - (r / (rows - 1)) * (north - south);
        for (let c = 0; c < cols; c++) {
          const lng = west + (c / (cols - 1)) * (east - west);
          const probe = getClimateProbe({ lat, lng }, project.center, regionalClimateStats || undefined);

          const metricVal = climateMetric === 'rainfall' ? probe.annualRainfallMm : probe.meanWindSpeedMs;
          const [red, green, blue, alpha] = getClimateColorRgba(climateMetric, metricVal, climateOpacity);

          const idx = (r * cols + c) * 4;
          imgData.data[idx] = red;
          imgData.data[idx + 1] = green;
          imgData.data[idx + 2] = blue;
          imgData.data[idx + 3] = alpha;
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // High-resolution smoothed GIS canvas
      const smoothCanvas = document.createElement('canvas');
      smoothCanvas.width = 448;
      smoothCanvas.height = 336;
      const sCtx = smoothCanvas.getContext('2d');
      if (sCtx) {
        sCtx.imageSmoothingEnabled = true;
        sCtx.imageSmoothingQuality = 'high';
        sCtx.drawImage(canvas, 0, 0, smoothCanvas.width, smoothCanvas.height);
      }

      const dataUrl = smoothCanvas.toDataURL();
      if (climateOverlayRef.current) {
        climateOverlayRef.current.setUrl(dataUrl);
        climateOverlayRef.current.setBounds(bounds);
      } else {
        climateOverlayRef.current = L.imageOverlay(dataUrl, bounds, {
          opacity: 1,
          interactive: false,
          zIndex: 255,
        }).addTo(map);
      }
    };

    renderClimateHeatmap();
    map.on('moveend', renderClimateHeatmap);

    return () => {
      map.off('moveend', renderClimateHeatmap);
      if (climateOverlayRef.current) {
        map.removeLayer(climateOverlayRef.current);
        climateOverlayRef.current = null;
      }
    };
  }, [showClimateHeatmap, climateMetric, climateOpacity, project.center, regionalClimateStats]);

  // 5. Render Solar PV Array Strings / Rows Overlay
  useEffect(() => {
    const pvLayer = pvRowsLayerRef.current;
    if (!pvLayer) return;
    pvLayer.clearLayers();

    if (!showPvRowsOverlay || !selectedParcelId) return;
    const parcel = project.parcels.find((p) => p.id === selectedParcelId);
    if (!parcel || parcel.coordinates.length < 3) return;

    const rows = generateSolarArrayRows(parcel.coordinates, solarConfig.azimuthDeg, 8);
    rows.forEach((row) => {
      const line = L.polyline(
        [
          [row.p1.lat, row.p1.lng],
          [row.p2.lat, row.p2.lng],
        ],
        {
          color: '#facc15',
          weight: 2,
          opacity: 0.9,
          dashArray: '8,2',
          interactive: false,
        }
      );
      pvLayer.addLayer(line);
    });
  }, [showPvRowsOverlay, selectedParcelId, project.parcels, solarConfig.azimuthDeg]);

  // 5.5. Render Elevation Cross-Section Transect & Hover Beacon Pin
  useEffect(() => {
    const layer = elevationLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    // 1. Render Transect Line if active
    if (elevationTransectCoords && elevationTransectCoords.length >= 2) {
      const latlngs = elevationTransectCoords.map((c) => [c.lat, c.lng] as [number, number]);
      const transectLine = L.polyline(latlngs, {
        color: '#22d3ee',
        weight: 3.5,
        dashArray: '6, 6',
        lineCap: 'round',
        opacity: 0.95,
      });

      transectLine.bindTooltip('Elevation Cross-Section Transect Line', {
        direction: 'center',
        className: 'bg-slate-900/95 text-cyan-300 font-mono text-[10px] font-bold border border-cyan-500 rounded px-1.5 shadow-lg',
      });
      layer.addLayer(transectLine);
    }

    // 2. Render Hover Point Pin if scrubbing elevation chart
    if (elevationHoverPoint && elevationHoverPoint.point) {
      const pulseIcon = L.divIcon({
        className: 'elevation-hover-beacon',
        html: `
          <div class="relative flex items-center justify-center pointer-events-none" style="transform: translate(-50%, -50%);">
            <span class="absolute w-8 h-8 rounded-full bg-cyan-400/40 animate-ping"></span>
            <span class="relative w-4 h-4 rounded-full bg-cyan-400 border-2 border-white shadow-xl"></span>
            ${
              elevationHoverPoint.label
                ? `<div class="absolute bottom-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-slate-900/95 border border-cyan-400 text-cyan-300 font-mono text-[10px] font-bold shadow-2xl whitespace-nowrap">
                    ▲ ${elevationHoverPoint.label}
                  </div>`
                : ''
            }
          </div>
        `,
        iconSize: [0, 0],
      });

      const marker = L.marker([elevationHoverPoint.point.lat, elevationHoverPoint.point.lng], {
        icon: pulseIcon,
        interactive: false,
        zIndexOffset: 2000,
      });
      layer.addLayer(marker);
    }
  }, [elevationHoverPoint, elevationTransectCoords]);

  // 5.6. Render Real-Time User Geolocation Pointer
  useEffect(() => {
    const layer = userLocationLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!userLocation) return;

    // 1. Accuracy Circle
    const accuracyRadius = Math.max(5, userLocation.accuracy);
    const circle = L.circle([userLocation.lat, userLocation.lng], {
      radius: accuracyRadius,
      color: '#0284c7',
      fillColor: '#38bdf8',
      fillOpacity: 0.15,
      weight: 1.5,
      dashArray: '3, 4',
      interactive: false,
    });
    layer.addLayer(circle);

    // 2. High-precision GPS pulse marker
    const pulseIcon = L.divIcon({
      className: 'user-location-pulse-marker',
      html: `
        <div class="relative flex items-center justify-center pointer-events-none" style="transform: translate(-50%, -50%);">
          <span class="absolute w-9 h-9 rounded-full bg-blue-500/35 animate-ping"></span>
          <span class="absolute w-6 h-6 rounded-full bg-sky-400/40"></span>
          <span class="relative w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-2xl"></span>
          ${
            userLocation.heading !== null && userLocation.heading !== undefined
              ? `<div class="absolute -top-3 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[9px] border-b-blue-600 drop-shadow" style="transform: rotate(${userLocation.heading}deg); transform-origin: center 18px;"></div>`
              : ''
          }
        </div>
      `,
      iconSize: [0, 0],
    });

    const marker = L.marker([userLocation.lat, userLocation.lng], {
      icon: pulseIcon,
      zIndexOffset: 3000,
    });

    const isIpLocation = userLocation.source === 'ip';
    const locTitle = isIpLocation
      ? `Approximate Location (${userLocation.cityName || 'IP Area'})`
      : 'Real-Time GPS Location';

    const accuracyFormatted =
      project.unitPreference === 'imperial'
        ? `±${Math.round(userLocation.accuracy * 3.28084)} ft`
        : `±${Math.round(userLocation.accuracy)} m`;

    marker.bindTooltip(
      `<div class="font-sans text-xs p-1 select-none pointer-events-none">
        <div class="font-bold text-white flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full ${isIpLocation ? 'bg-cyan-400' : 'bg-blue-500 animate-ping'}"></span>
          <span>${locTitle}</span>
        </div>
        <div class="text-[10px] font-mono text-cyan-300 mt-0.5">
          ${userLocation.lat.toFixed(6)}°, ${userLocation.lng.toFixed(6)}°
        </div>
        <div class="text-[9px] text-slate-400 mt-0.5">
          ${isIpLocation ? 'Method: Network Geocoding' : `Accuracy: <strong class="text-white">${accuracyFormatted}</strong>`}
        </div>
      </div>`,
      {
        direction: 'top',
        offset: [0, -10],
        className: 'bg-slate-900/95 text-white border border-blue-500/80 rounded-xl p-1 shadow-2xl backdrop-blur-md',
      }
    );

    layer.addLayer(marker);
  }, [userLocation, project.unitPreference]);

  // Snapping helper: snaps coordinate to closest existing vertex across parcels, lines, markers, and draft points
  const getSnappedCoordinate = useCallback(
    (pt: GeoPoint, excludeCoords: GeoPoint[] = []): { point: GeoPoint; isSnapped: boolean } => {
      if (!snappingEnabled || !mapRef.current) return { point: pt, isSnapped: false };
      const SNAP_PIXEL_THRESHOLD = 18;
      const map = mapRef.current;
      const mousePx = map.latLngToContainerPoint([pt.lat, pt.lng]);

      let closestPt: GeoPoint = pt;
      let minDistancePx = SNAP_PIXEL_THRESHOLD;
      let didSnap = false;

      const checkCandidate = (cand: GeoPoint) => {
        if (excludeCoords.some((exc) => Math.abs(exc.lat - cand.lat) < 1e-7 && Math.abs(exc.lng - cand.lng) < 1e-7)) {
          return;
        }
        const candPx = map.latLngToContainerPoint([cand.lat, cand.lng]);
        const dist = mousePx.distanceTo(candPx);
        if (dist < minDistancePx) {
          minDistancePx = dist;
          closestPt = cand;
          didSnap = true;
        }
      };

      project.parcels.forEach((parcel) => {
        parcel.coordinates.forEach(checkCandidate);
      });
      project.lines.forEach((line) => {
        line.coordinates.forEach(checkCandidate);
      });
      project.markers.forEach((marker) => {
        checkCandidate(marker.point);
      });
      draftPoints.forEach(checkCandidate);

      return { point: closestPt, isSnapped: didSnap };
    },
    [snappingEnabled, project.parcels, project.lines, project.markers, draftPoints]
  );

  // Mouse move handler for coordinates, snapping detection, and live hover preview
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      const rawPt: GeoPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
      onCursorMove(rawPt, map.getZoom());

      const { point: snappedPt, isSnapped } = getSnappedCoordinate(rawPt);
      setActiveSnapTarget(isSnapped ? snappedPt : null);

      if (isDrawing || toolMode === 'polygon' || toolMode === 'line' || toolMode === 'measure') {
        setHoverPoint(snappedPt);
      } else {
        setHoverPoint(null);
      }
    };

    const handleMouseOut = () => {
      setHoverPoint(null);
      setActiveSnapTarget(null);
    };

    map.on('mousemove', handleMouseMove);
    map.on('mouseout', handleMouseOut);

    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('mouseout', handleMouseOut);
    };
  }, [onCursorMove, isDrawing, toolMode, getSnappedCoordinate]);

  // Render Snapping Reticle Indicator
  useEffect(() => {
    const snapLayer = snapIndicatorLayerRef.current;
    if (!snapLayer) return;
    snapLayer.clearLayers();

    if (snappingEnabled && activeSnapTarget) {
      const snapMarker = L.circleMarker([activeSnapTarget.lat, activeSnapTarget.lng], {
        radius: 9,
        color: '#06b6d4',
        fillColor: '#22d3ee',
        fillOpacity: 0.5,
        weight: 2,
        interactive: false,
        className: 'animate-pulse',
      });
      snapLayer.addLayer(snapMarker);
    }
  }, [snappingEnabled, activeSnapTarget]);

  // 6. Render Parcels, Lines, Markers and Interactive Vertex Handles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !parcelsLayerRef.current || !linesLayerRef.current || !markersLayerRef.current) return;

    parcelsLayerRef.current.clearLayers();
    linesLayerRef.current.clearLayers();
    markersLayerRef.current.clearLayers();
    editHandlesLayerRef.current?.clearLayers();

    // Render Parcels
    project.parcels.forEach((parcel) => {
      if (parcel.coordinates.length < 3) return;
      const isSelected = parcel.id === selectedParcelId;
      const latLngs = parcel.coordinates.map((c) => [c.lat, c.lng] as [number, number]);

      const polygon = L.polygon(latLngs, {
        color: isSelected ? '#38bdf8' : parcel.strokeColor || parcel.color,
        fillColor: parcel.color,
        fillOpacity: isSelected ? Math.min(0.65, (parcel.fillOpacity || 0.35) + 0.15) : parcel.fillOpacity || 0.35,
        weight: isSelected ? 3 : parcel.strokeWidth || 2,
        dashArray: isSelected ? '4,4' : undefined,
      });

      polygon.on('click', (e) => {
        if (toolMode === 'select') {
          L.DomEvent.stop(e);
          onSelectParcel(parcel.id);
          onSelectLine(null);
          onSelectMarker(null);
        }
      });

      const areaInfo = formatArea(parcel.areaSqMeters, project.unitPreference);
      polygon.bindTooltip(
        `<div class="font-sans text-xs">
          <div class="font-bold text-slate-100">${parcel.name}</div>
          <div class="font-mono text-cyan-300 font-semibold">${areaInfo.primary}</div>
          <div class="text-[10px] text-slate-300">${CATEGORY_PRESETS[parcel.category]?.label || parcel.category}</div>
        </div>`,
        {
          permanent: false,
          direction: 'center',
          className: 'bg-slate-900/90 text-white border border-slate-700 rounded-md p-1 shadow-lg backdrop-blur-sm',
        }
      );

      parcelsLayerRef.current?.addLayer(polygon);

      // Automated Parcel Centroid Label Overlay (non-interactive)
      if (showLabels) {
        const centroid = calculateCentroid(parcel.coordinates);
        const labelIcon = L.divIcon({
          className: 'custom-parcel-label',
          html: `
            <div style="transform: translate(-50%, -50%);" class="pointer-events-none select-none text-center bg-slate-950/85 backdrop-blur-md border border-slate-700/80 px-2.5 py-1 rounded-lg shadow-xl whitespace-nowrap">
              <div class="text-[11px] font-bold text-white leading-tight drop-shadow tracking-wide">${parcel.name}</div>
              <div class="text-[9.5px] font-mono font-semibold text-emerald-400 leading-tight mt-0.5">${areaInfo.primary}</div>
            </div>
          `,
          iconSize: [0, 0],
        });
        L.marker([centroid.lat, centroid.lng], { icon: labelIcon, interactive: false }).addTo(parcelsLayerRef.current!);
      }

      // Setback buffer if enabled
      if (showSetbacks && parcel.setbackMeters && parcel.setbackMeters > 0) {
        const setbackCoords = generateSetbackPolygon(parcel.coordinates, parcel.setbackMeters);
        if (setbackCoords.length >= 3) {
          const setbackLatLngs = setbackCoords.map((c) => [c.lat, c.lng] as [number, number]);
          L.polygon(setbackLatLngs, {
            color: '#f59e0b',
            fillColor: '#f59e0b',
            fillOpacity: 0.1,
            weight: 1.5,
            dashArray: '3,3',
          }).addTo(parcelsLayerRef.current!);
        }
      }

      // Edge Dimensions if enabled
      if (showDimensions) {
        for (let i = 0; i < parcel.coordinates.length; i++) {
          const nextIdx = (i + 1) % parcel.coordinates.length;
          const p1 = parcel.coordinates[i];
          const p2 = parcel.coordinates[nextIdx];
          const midLat = (p1.lat + p2.lat) / 2;
          const midLng = (p1.lng + p2.lng) / 2;
          const segDist = L.latLng(p1.lat, p1.lng).distanceTo(L.latLng(p2.lat, p2.lng));
          const distLabel = formatDistance(segDist, project.unitPreference);

          const dimIcon = L.divIcon({
            className: 'custom-dimension-label',
            html: `
              <div style="transform: translate(-50%, -50%);" class="text-[9px] font-mono text-cyan-200 bg-slate-900/90 border border-slate-700 px-1 rounded shadow-xs whitespace-nowrap pointer-events-none">
                ${distLabel}
              </div>
            `,
            iconSize: [0, 0],
          });
          L.marker([midLat, midLng], { icon: dimIcon, interactive: false }).addTo(parcelsLayerRef.current!);
        }
      }

      // Interactive Vertex Editing for Selected Parcel
      if (isSelected && toolMode === 'select' && editHandlesLayerRef.current) {
        const mutableCoords = [...parcel.coordinates];

        parcel.coordinates.forEach((vertex, vIdx) => {
          const handleIcon = L.divIcon({
            className: 'vertex-marker-handle',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });

          const handleMarker = L.marker([vertex.lat, vertex.lng], {
            icon: handleIcon,
            draggable: true,
            zIndexOffset: 1000,
          });

          handleMarker.on('drag', (e) => {
            const rawLatLng = (e as L.LeafletMouseEvent).latlng;
            const { point: snapPt } = getSnappedCoordinate(
              { lat: rawLatLng.lat, lng: rawLatLng.lng },
              [mutableCoords[vIdx]]
            );

            mutableCoords[vIdx] = snapPt;
            polygon.setLatLngs(mutableCoords.map((c) => [c.lat, c.lng] as [number, number]));
          });

          handleMarker.on('dragend', () => {
            onUpdateParcelCoords(parcel.id, [...mutableCoords]);
          });

          handleMarker.on('contextmenu', (e) => {
            L.DomEvent.stop(e);
            if (parcel.coordinates.length > 3) {
              const updatedCoords = parcel.coordinates.filter((_, idx) => idx !== vIdx);
              onUpdateParcelCoords(parcel.id, updatedCoords);
            }
          });

          handleMarker.bindTooltip(
            `Vertex #${vIdx + 1}<br/><span class="text-[10px] text-slate-400">Drag to move · Right-click to delete</span>`,
            {
              direction: 'top',
              offset: [0, -7],
              className: 'bg-slate-900 text-white text-xs border border-slate-700 rounded p-1 shadow',
            }
          );

          editHandlesLayerRef.current?.addLayer(handleMarker);

          // Clickable midpoint handle between vertices to split/add new vertex
          const nextIdx = (vIdx + 1) % parcel.coordinates.length;
          const nextVertex = parcel.coordinates[nextIdx];
          const midLat = (vertex.lat + nextVertex.lat) / 2;
          const midLng = (vertex.lng + nextVertex.lng) / 2;

          const midpointIcon = L.divIcon({
            className: 'midpoint-marker-handle',
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });

          const midpointMarker = L.marker([midLat, midLng], {
            icon: midpointIcon,
            zIndexOffset: 900,
          });

          midpointMarker.on('click', (e) => {
            L.DomEvent.stop(e);
            const updatedCoords = [...parcel.coordinates];
            updatedCoords.splice(vIdx + 1, 0, { lat: midLat, lng: midLng });
            onUpdateParcelCoords(parcel.id, updatedCoords);
          });

          midpointMarker.bindTooltip('Click to add vertex', {
            direction: 'top',
            offset: [0, -5],
            className: 'bg-slate-900 text-cyan-300 text-[10px] border border-slate-700 rounded px-1',
          });

          editHandlesLayerRef.current?.addLayer(midpointMarker);
        });
      }
    });

    // Render Boundary Lines
    project.lines.forEach((line) => {
      if (line.coordinates.length < 2) return;
      const isSelected = line.id === selectedLineId;
      const latLngs = line.coordinates.map((c) => [c.lat, c.lng] as [number, number]);

      const polyline = L.polyline(latLngs, {
        color: isSelected ? '#38bdf8' : line.color,
        weight: (line.strokeWidth || 3) + (isSelected ? 2 : 0),
        dashArray: line.dashArray || undefined,
        lineCap: 'round',
        lineJoin: 'round',
      });

      polyline.on('click', (e) => {
        if (toolMode === 'select') {
          L.DomEvent.stop(e);
          onSelectLine(line.id);
          onSelectParcel(null);
          onSelectMarker(null);
        }
      });

      const distLabel = formatDistance(line.lengthMeters, project.unitPreference);
      polyline.bindTooltip(
        `<div class="font-sans text-xs">
          <div class="font-bold text-white">${line.name}</div>
          <div class="font-mono text-cyan-300">${distLabel}</div>
        </div>`,
        {
          direction: 'center',
          className: 'bg-slate-900/90 text-white border border-slate-700 rounded p-1 shadow',
        }
      );

      linesLayerRef.current?.addLayer(polyline);

      // Interactive Vertex Editing for Selected Line
      if (isSelected && toolMode === 'select' && editHandlesLayerRef.current) {
        const mutableLineCoords = [...line.coordinates];

        line.coordinates.forEach((vertex, vIdx) => {
          const handleIcon = L.divIcon({
            className: 'vertex-marker-handle',
            iconSize: [13, 13],
            iconAnchor: [6.5, 6.5],
          });

          const handleMarker = L.marker([vertex.lat, vertex.lng], {
            icon: handleIcon,
            draggable: true,
            zIndexOffset: 1000,
          });

          handleMarker.on('drag', (e) => {
            const rawLatLng = (e as L.LeafletMouseEvent).latlng;
            const { point: snapPt } = getSnappedCoordinate(
              { lat: rawLatLng.lat, lng: rawLatLng.lng },
              [mutableLineCoords[vIdx]]
            );

            mutableLineCoords[vIdx] = snapPt;
            polyline.setLatLngs(mutableLineCoords.map((c) => [c.lat, c.lng] as [number, number]));
          });

          handleMarker.on('dragend', () => {
            onUpdateLineCoords(line.id, [...mutableLineCoords]);
          });

          handleMarker.on('contextmenu', (e) => {
            L.DomEvent.stop(e);
            if (line.coordinates.length > 2) {
              const updated = line.coordinates.filter((_, idx) => idx !== vIdx);
              onUpdateLineCoords(line.id, updated);
            }
          });

          handleMarker.bindTooltip(
            `Line Vertex #${vIdx + 1}<br/><span class="text-[10px] text-slate-400">Drag to move · Right-click to delete</span>`,
            {
              direction: 'top',
              offset: [0, -6],
              className: 'bg-slate-900 text-white text-xs border border-slate-700 rounded p-1',
            }
          );

          editHandlesLayerRef.current?.addLayer(handleMarker);

          if (vIdx < line.coordinates.length - 1) {
            const nextVertex = line.coordinates[vIdx + 1];
            const midLat = (vertex.lat + nextVertex.lat) / 2;
            const midLng = (vertex.lng + nextVertex.lng) / 2;

            const midpointIcon = L.divIcon({
              className: 'midpoint-marker-handle',
              iconSize: [9, 9],
              iconAnchor: [4.5, 4.5],
            });

            const midpointMarker = L.marker([midLat, midLng], {
              icon: midpointIcon,
              zIndexOffset: 900,
            });

            midpointMarker.on('click', (e) => {
              L.DomEvent.stop(e);
              const updated = [...line.coordinates];
              updated.splice(vIdx + 1, 0, { lat: midLat, lng: midLng });
              onUpdateLineCoords(line.id, updated);
            });

            midpointMarker.bindTooltip('Click to add line point', {
              direction: 'top',
              offset: [0, -4],
              className: 'bg-slate-900 text-cyan-300 text-[10px] border border-slate-700 rounded px-1',
            });

            editHandlesLayerRef.current?.addLayer(midpointMarker);
          }
        });
      }
    });

    // Render Markers
    project.markers.forEach((marker) => {
      const isSelected = marker.id === selectedMarkerId;

      const markerPin = L.divIcon({
        className: 'custom-survey-marker',
        html: `
          <div style="transform: translate(-50%, -100%);" class="flex flex-col items-center group cursor-pointer">
            <div class="px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-slate-900/90 border ${
              isSelected ? 'border-cyan-400 text-cyan-300 scale-110' : 'border-slate-700'
            } shadow-md whitespace-nowrap mb-1">
              ${marker.name}
            </div>
            <div class="w-4 h-4 rounded-full ${
              isSelected ? 'bg-cyan-400 ring-4 ring-cyan-400/40' : 'bg-rose-500 ring-2 ring-white'
            } shadow-lg flex items-center justify-center">
              <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
            </div>
          </div>
        `,
        iconSize: [0, 0],
      });

      const m = L.marker([marker.point.lat, marker.point.lng], {
        icon: markerPin,
        draggable: isSelected && toolMode === 'select',
      });

      m.on('click', (e) => {
        if (toolMode === 'select') {
          L.DomEvent.stop(e);
          onSelectMarker(marker.id);
          onSelectParcel(null);
          onSelectLine(null);
        }
      });

      if (isSelected && toolMode === 'select') {
        m.on('dragend', () => {
          const latlng = m.getLatLng();
          const { point: snapPt } = getSnappedCoordinate({ lat: latlng.lat, lng: latlng.lng });
          onUpdateMarkerPoint(marker.id, snapPt);
        });
      }

      markersLayerRef.current?.addLayer(m);
    });
  }, [
    project,
    selectedParcelId,
    selectedLineId,
    selectedMarkerId,
    toolMode,
    showSetbacks,
    showDimensions,
    showLabels,
    getSnappedCoordinate,
  ]);

  // 7. Interactive Drawing on Map Click & Soil/Climate Probe on Click
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const { point: snappedPt } = getSnappedCoordinate({ lat: e.latlng.lat, lng: e.latlng.lng });

      if (toolMode === 'polygon') {
        if (draftPoints.length >= 3) {
          const firstPx = map.latLngToContainerPoint([draftPoints[0].lat, draftPoints[0].lng]);
          const clickPx = map.latLngToContainerPoint([snappedPt.lat, snappedPt.lng]);
          if (firstPx.distanceTo(clickPx) < 20) {
            onFinishDrawing();
            return;
          }
        }
        onDraftPointsChange([...draftPoints, snappedPt]);
      } else if (toolMode === 'line') {
        onDraftPointsChange([...draftPoints, snappedPt]);
      } else if (toolMode === 'measure') {
        onDraftPointsChange([...draftPoints, snappedPt]);
      } else if (toolMode === 'marker') {
        const markerCount = project.markers.length + 1;
        onAddMarker({
          name: `Survey Pin #${markerCount}`,
          category: 'survey_pin',
          point: snappedPt,
          elevationMeters: 100,
        });
      } else if (toolMode === 'select') {
        // If climate heatmap is enabled, clicking on map provides climate probe analysis popup
        if (showClimateHeatmap) {
          const probe = getClimateProbe(snappedPt, project.center, regionalClimateStats || undefined);
          const isRain = climateMetric === 'rainfall';
          L.popup({
            className: 'custom-climate-probe-popup',
            offset: [0, -8],
          })
            .setLatLng([snappedPt.lat, snappedPt.lng])
            .setContent(`
              <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 235px;" class="p-1 text-slate-100">
                <div class="text-[10px] font-bold ${isRain ? 'text-cyan-400' : 'text-amber-400'} uppercase tracking-wider flex items-center gap-1">
                  <span>${isRain ? '🌧️ Annual Rainfall Analysis' : '💨 Wind Speed & Power Index'}</span>
                </div>
                <div class="text-sm font-bold text-white mt-1">
                  ${
                    isRain
                      ? `Rainfall: <span class="font-mono text-cyan-300">${probe.annualRainfallMm} mm</span> <span class="text-xs text-slate-400 font-mono">(${probe.annualRainfallInches} in/yr)</span>`
                      : `Wind Speed: <span class="font-mono text-amber-300">${probe.meanWindSpeedMs} m/s</span> <span class="text-xs text-slate-400 font-mono">(${probe.meanWindSpeedMph} mph)</span>`
                  }
                </div>
                <div class="text-[11px] font-semibold text-slate-200 mt-0.5">
                  ${isRain ? probe.climateCategory : probe.windPowerClass}
                </div>
                <div class="mt-2 pt-1.5 border-t border-slate-700/80 grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-300">
                  <div>Prevailing: <strong class="text-white">${probe.prevailingWindDirection.split(' ')[0]}</strong></div>
                  <div>Rainfall: <strong class="text-white">${probe.annualRainfallMm}mm</strong></div>
                  <div>Wind: <strong class="text-white">${probe.meanWindSpeedMs}m/s</strong></div>
                  <div>Turbine: <strong class="text-white">${probe.windPowerClass.split(' ')[1] || 'Good'}</strong></div>
                </div>
                <div class="mt-1.5 text-[9.5px] text-slate-400 leading-tight">
                  ${probe.siteSuitabilityNotes}
                </div>
              </div>
            `)
            .openOn(map);
          return;
        }

        // If soil heatmap is enabled, clicking on the map provides an in-depth soil probe popup!
        if (showSoilHeatmap) {
          const probe = getSoilProbe(snappedPt, project.center);
          L.popup({
            className: 'custom-soil-probe-popup',
            offset: [0, -8],
          })
            .setLatLng([snappedPt.lat, snappedPt.lng])
            .setContent(`
              <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 220px;" class="p-1 text-slate-100">
                <div class="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  🌱 Soil Quality Probe
                </div>
                <div class="text-sm font-bold text-white mt-0.5">
                  Suitability: <span class="font-mono text-emerald-300">${probe.suitabilityScore}/100</span>
                </div>
                <div class="text-[11px] font-semibold text-slate-200 mt-0.5">${probe.primeFarmlandStatus}</div>
                <div class="text-[10px] text-slate-300 mt-0.5">${probe.soilSeriesName} (${probe.texture})</div>
                <div class="mt-2 pt-1 border-t border-slate-700/80 grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-300">
                  <div>pH: <strong class="text-white">${probe.phLevel}</strong></div>
                  <div>OM: <strong class="text-white">${probe.organicMatterPercent}%</strong></div>
                  <div>Drainage: <strong class="text-white">${probe.drainageClass.split(' ')[0]}</strong></div>
                  <div>Erosion: <strong class="text-white">${probe.erosionRisk}</strong></div>
                </div>
                <div class="mt-1.5 text-[9px] text-slate-400 leading-tight">
                  Prime Crops: ${probe.recommendedCrops.slice(0, 3).join(', ')}
                </div>
              </div>
            `)
            .openOn(map);
          return;
        }

        onSelectParcel(null);
        onSelectLine(null);
        onSelectMarker(null);
      }
    };

    const handleDblClick = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e);
      if (isDrawing && draftPoints.length >= 2) {
        onFinishDrawing();
      }
    };

    map.on('click', handleMapClick);
    map.on('dblclick', handleDblClick);

    return () => {
      map.off('click', handleMapClick);
      map.off('dblclick', handleDblClick);
    };
  }, [
    toolMode,
    draftPoints,
    isDrawing,
    getSnappedCoordinate,
    onFinishDrawing,
    onDraftPointsChange,
    onAddMarker,
    showSoilHeatmap,
    showClimateHeatmap,
    climateMetric,
    regionalClimateStats,
    project.center,
  ]);

  // 8. Render Live Draft Drawing Geometry & Measurement Details
  useEffect(() => {
    const draftLayer = draftLayerRef.current;
    if (!draftLayer) return;

    draftLayer.clearLayers();

    if (draftPoints.length === 0) return;

    const pointsToRender = [...draftPoints];
    if (hoverPoint && isDrawing) {
      pointsToRender.push(hoverPoint);
    }

    const latLngs = pointsToRender.map((p) => [p.lat, p.lng] as [number, number]);

    if (toolMode === 'polygon') {
      const draftPoly = L.polygon(latLngs, {
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.25,
        weight: 2,
        dashArray: '4,4',
      });
      draftLayer.addLayer(draftPoly);

      if (pointsToRender.length >= 3 && hoverPoint) {
        const liveArea = calculateGeodesicArea(pointsToRender);
        const areaInfo = formatArea(liveArea, project.unitPreference);
        const livePerim = calculatePerimeter(pointsToRender);
        const perimInfo = formatDistance(livePerim, project.unitPreference);

        const tooltipIcon = L.divIcon({
          className: 'live-draft-tooltip',
          html: `
            <div style="transform: translate(14px, -14px);" class="bg-slate-900/95 border border-emerald-500 px-2 py-1 rounded-lg shadow-xl text-left pointer-events-none whitespace-nowrap">
              <div class="text-[10px] text-emerald-400 font-mono font-bold">${areaInfo.primary}</div>
              <div class="text-[9px] text-slate-300 font-mono">Perimeter: ${perimInfo}</div>
            </div>
          `,
          iconSize: [0, 0],
        });
        L.marker([hoverPoint.lat, hoverPoint.lng], { icon: tooltipIcon, interactive: false }).addTo(draftLayer);
      }
    } else if (toolMode === 'line' || toolMode === 'measure') {
      const isMeasure = toolMode === 'measure';
      const draftLine = L.polyline(latLngs, {
        color: isMeasure ? '#38bdf8' : '#f59e0b',
        weight: 3.5,
        dashArray: isMeasure ? undefined : '6,4',
        lineCap: 'round',
        lineJoin: 'round',
      });
      draftLayer.addLayer(draftLine);

      // Real-time segment lengths along each segment of the multi-segment line
      if (pointsToRender.length >= 2) {
        let cumulativeDist = 0;

        for (let s = 0; s < pointsToRender.length - 1; s++) {
          const pA = pointsToRender[s];
          const pB = pointsToRender[s + 1];
          const segDist = calculateDistance(pA, pB);
          cumulativeDist += segDist;

          const isLiveSegment = Boolean(hoverPoint && s === pointsToRender.length - 2);
          const midLat = (pA.lat + pB.lat) / 2;
          const midLng = (pA.lng + pB.lng) / 2;

          const segIcon = L.divIcon({
            className: 'live-segment-badge',
            html: `
              <div class="pointer-events-none select-none" style="transform: translate(-50%, -50%);">
                <span class="${
                  isLiveSegment
                    ? 'bg-cyan-950/95 border border-cyan-400 text-white shadow-xl animate-pulse ring-2 ring-cyan-500/30'
                    : 'bg-slate-900/95 border border-cyan-500/80 text-cyan-300 shadow-md'
                } font-mono font-bold text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1">
                  ${isLiveSegment ? '<span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0"></span>' : ''}
                  <span>Seg ${s + 1}: ${formatDistance(segDist, project.unitPreference)}</span>
                </span>
              </div>
            `,
            iconSize: [0, 0],
          });
          L.marker([midLat, midLng], { icon: segIcon, interactive: false }).addTo(draftLayer);
        }

        // Floating visual feedback on total distance at cursor before finishing drawing
        if (hoverPoint) {
          const totalDist = cumulativeDist;
          const totalFormatted = formatDistance(totalDist, project.unitPreference);
          const lastSegDist = calculateDistance(
            pointsToRender[pointsToRender.length - 2],
            pointsToRender[pointsToRender.length - 1]
          );

          const hudIcon = L.divIcon({
            className: 'live-measure-hud-tooltip',
            html: `
              <div style="transform: translate(16px, -18px);" class="bg-slate-900/95 backdrop-blur-md border border-cyan-400 p-2.5 rounded-xl shadow-2xl text-left pointer-events-none whitespace-nowrap min-w-[190px]">
                <div class="flex items-center justify-between text-[9px] uppercase tracking-wider text-cyan-400 font-bold border-b border-slate-700/80 pb-1 mb-1">
                  <span class="flex items-center gap-1">
                    <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    <span>${isMeasure ? '📏 Measure Distance' : 'Boundary Line'}</span>
                  </span>
                  <span class="font-mono text-slate-300">${pointsToRender.length - 1} ${pointsToRender.length - 1 === 1 ? 'seg' : 'segs'}</span>
                </div>
                <div class="text-xs font-bold font-mono text-slate-300">
                  Total: <span class="text-cyan-300 text-sm font-extrabold">${totalFormatted}</span>
                </div>
                <div class="text-[10px] font-mono text-slate-300 mt-0.5 flex justify-between">
                  <span>Current Segment:</span>
                  <strong class="text-emerald-400">${formatDistance(lastSegDist, project.unitPreference)}</strong>
                </div>
                <div class="text-[9px] text-slate-400 mt-1.5 pt-1 border-t border-slate-800 flex items-center justify-between">
                  <span>Click: set point</span>
                  <span class="font-mono text-cyan-400 font-semibold">Dbl-click: finish</span>
                </div>
              </div>
            `,
            iconSize: [0, 0],
          });
          L.marker([hoverPoint.lat, hoverPoint.lng], { icon: hudIcon, interactive: false }).addTo(draftLayer);
        }
      }
    }

    draftPoints.forEach((pt, idx) => {
      const isStart = idx === 0 && toolMode === 'polygon' && draftPoints.length >= 3;
      const isMeasure = toolMode === 'measure';

      if (isMeasure) {
        const vtxIcon = L.divIcon({
          className: 'measure-vertex-node',
          html: `
            <div style="transform: translate(-50%, -50%);" class="w-5 h-5 rounded-full bg-slate-900 border-2 border-cyan-400 flex items-center justify-center text-[9px] font-mono font-bold text-cyan-300 shadow-lg pointer-events-none">
              ${idx + 1}
            </div>
          `,
          iconSize: [0, 0],
        });
        L.marker([pt.lat, pt.lng], { icon: vtxIcon, interactive: false }).addTo(draftLayer);
      } else {
        const circle = L.circleMarker([pt.lat, pt.lng], {
          radius: isStart ? 8 : 5,
          color: isStart ? '#10b981' : '#ffffff',
          fillColor: isStart ? '#34d399' : '#0284c7',
          fillOpacity: 1,
          weight: isStart ? 3 : 2,
        });

        if (isStart) {
          circle.on('click', (e) => {
            L.DomEvent.stop(e);
            onFinishDrawing();
          });

          circle.bindTooltip('Click to close parcel boundary', {
            direction: 'top',
            className: 'bg-emerald-950 text-emerald-200 border border-emerald-500 text-[10px] rounded px-1',
          });
        }

        draftLayer.addLayer(circle);
      }
    });
  }, [draftPoints, hoverPoint, isDrawing, toolMode, project.unitPreference, onFinishDrawing]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-slate-950">
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Floating Soil Suitability Legend on Map */}
      {showSoilHeatmap && (
        <div className="absolute top-4 right-16 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-2.5 rounded-xl shadow-xl pointer-events-auto max-w-[210px]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            {SOIL_METRIC_CONFIGS[soilMetric]?.label || 'Soil Suitability'}
          </div>
          <div className="h-2 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 via-lime-500 to-emerald-600 shadow-inner mt-1.5" />
          <div className="flex justify-between text-[8px] font-mono text-slate-400 mt-1">
            <span>Low / Marginal</span>
            <span>Moderate</span>
            <span className="text-emerald-400 font-semibold">Prime</span>
          </div>
          <div className="text-[9px] text-slate-400 mt-1 leading-tight">
            Click map terrain to inspect soil probe at coordinate.
          </div>
        </div>
      )}

      {/* Floating Climate & Environmental Heatmap Legend on Map */}
      {showClimateHeatmap && (
        <div className="absolute top-4 right-16 z-20 bg-slate-900/95 backdrop-blur-md border border-cyan-500/60 p-2.5 rounded-xl shadow-xl pointer-events-auto max-w-[230px]">
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1">
              <span>{climateMetric === 'rainfall' ? '🌧️ Rainfall' : '💨 Wind Speed'}</span>
            </div>
            {onSelectClimateMetric && (
              <div className="flex bg-slate-800 rounded p-0.5 border border-slate-700">
                <button
                  onClick={() => onSelectClimateMetric('rainfall')}
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    climateMetric === 'rainfall'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Rain
                </button>
                <button
                  onClick={() => onSelectClimateMetric('wind')}
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    climateMetric === 'wind'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Wind
                </button>
              </div>
            )}
          </div>

          <div
            className={`h-2 rounded-full shadow-inner mt-1 ${
              climateMetric === 'rainfall'
                ? 'bg-gradient-to-r from-amber-600 via-yellow-400 via-cyan-400 via-blue-600 to-indigo-700'
                : 'bg-gradient-to-r from-cyan-300 via-emerald-500 via-yellow-400 via-orange-500 to-red-600'
            }`}
          />

          <div className="flex justify-between text-[8px] font-mono text-slate-400 mt-1">
            <span>{climateMetric === 'rainfall' ? '<250 mm' : '<3.5 m/s'}</span>
            <span>{climateMetric === 'rainfall' ? '750 mm' : '5.8 m/s'}</span>
            <span className="text-cyan-400 font-semibold">{climateMetric === 'rainfall' ? '>1500 mm' : '>8.5 m/s'}</span>
          </div>

          <div className="text-[9px] text-slate-400 mt-1 leading-tight">
            Click map terrain to inspect regional {climateMetric === 'rainfall' ? 'precipitation' : 'wind'} probe.
          </div>
        </div>
      )}

      {/* Floating PV Rows Active Badge on Map */}
      {showPvRowsOverlay && selectedParcelId && (
        <div className="absolute top-4 left-20 z-20 bg-slate-900/95 backdrop-blur-md border border-amber-500/60 p-2 rounded-xl shadow-xl pointer-events-auto flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <div className="text-[10px] font-bold text-amber-300">
            PV Array Strings Active · Azimuth {solarConfig.azimuthDeg}°
          </div>
        </div>
      )}

      {/* Floating GPS Real-Time Location Button & Recovery Controls */}
      <div className="absolute bottom-20 right-4 z-20 flex flex-col items-end gap-2 pointer-events-auto">
        {locationError && (
          <div className="bg-slate-900/95 border border-amber-500/70 text-slate-200 text-xs p-3 rounded-2xl shadow-2xl flex flex-col gap-2.5 animate-in fade-in max-w-[280px] backdrop-blur-md">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-amber-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Location Access Notice</span>
              </div>
              {onDismissLocationError && (
                <button
                  onClick={onDismissLocationError}
                  className="text-slate-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                  title="Dismiss notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-300 leading-snug">{locationError}</p>

            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-slate-800">
              {onUseIpLocation && (
                <button
                  onClick={onUseIpLocation}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Use Approximate Location (IP)</span>
                </button>
              )}

              {onOpenLocationSearch && (
                <button
                  onClick={onOpenLocationSearch}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                  <span>Search City or Address</span>
                </button>
              )}
            </div>
          </div>
        )}

        {userLocation?.source === 'ip' && (
          <div className="bg-slate-900/90 border border-cyan-500/40 px-2.5 py-1 rounded-full text-[10px] text-cyan-300 font-mono shadow-lg flex items-center gap-1.5 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Approx: {userLocation.cityName || 'Network IP'}</span>
          </div>
        )}

        {userLocation && onCenterUserLocation && (
          <button
            onClick={onCenterUserLocation}
            className="w-10 h-10 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-blue-500/60 text-blue-400 hover:text-white flex items-center justify-center transition-all shadow-xl backdrop-blur-md group cursor-pointer"
            title="Center Map on Current Location"
          >
            <Crosshair className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
        )}

        <button
          onClick={onToggleLocationTracking}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-xl backdrop-blur-md border cursor-pointer ${
            isLocationTracking
              ? 'bg-blue-600/30 border-blue-400 text-blue-300 shadow-blue-500/30 ring-2 ring-blue-500/40'
              : isLocating
              ? 'bg-slate-900/95 border-cyan-400 text-cyan-300 animate-pulse'
              : 'bg-slate-900/90 border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title={
            isLocationTracking
              ? 'GPS Tracking Active (Click to toggle)'
              : 'Locate Me · Real-Time GPS Pointer'
          }
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
          ) : (
            <Navigation
              className={`w-5 h-5 transition-transform ${
                isLocationTracking ? 'fill-blue-400 text-blue-400 rotate-45' : ''
              }`}
            />
          )}
        </button>
      </div>
    </div>
  );
};
