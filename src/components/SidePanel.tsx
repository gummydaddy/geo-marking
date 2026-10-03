import React, { useState } from 'react';
import {
  LandProject,
  LandParcel,
  LandLine,
  LandMarker,
  LandCategory,
  GeoPoint,
  CATEGORY_PRESETS,
  BasemapId,
  UnitSystem,
  SolarPanelConfig,
  SoilMetricType,
  ClimateMetricType,
} from '../types';
import {
  formatArea,
  formatDistance,
  calculateSegmentLengths,
} from '../utils/geoMath';
import { exportParcelSurveyCSV, downloadFile } from '../utils/exportImport';
import { SolarPanelEstimator } from './SolarPanelEstimator';
import { ElevationProfile } from './ElevationProfile';
import { SOIL_METRIC_CONFIGS } from '../utils/soilDataGenerator';
import { CLIMATE_METRIC_CONFIGS } from '../utils/climateService';
import {
  Compass,
  Layers,
  Settings,
  Edit3,
  Trash2,
  Copy,
  ChevronRight,
  Maximize2,
  FileSpreadsheet,
  Plus,
  Info,
  Sliders,
  FolderOpen,
  Upload,
  Download,
  Check,
  X,
  Sun,
  Sprout,
  Activity,
  Mountain,
  CloudRain,
  Wind,
} from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';

interface SidePanelProps {
  project: LandProject;
  activeTab: 'parcels' | 'details' | 'layers' | 'projects';
  onSelectTab: (tab: 'parcels' | 'details' | 'layers' | 'projects') => void;
  selectedParcelId: string | null;
  selectedLineId: string | null;
  selectedMarkerId: string | null;
  onSelectParcel: (id: string | null) => void;
  onSelectLine: (id: string | null) => void;
  onSelectMarker: (id: string | null) => void;
  onUpdateParcel: (updated: LandParcel) => void;
  onDeleteParcel: (id: string) => void;
  onDuplicateParcel: (parcel: LandParcel) => void;
  onUpdateLine: (updated: LandLine) => void;
  onDeleteLine: (id: string) => void;
  onUpdateMarker: (updated: LandMarker) => void;
  onDeleteMarker: (id: string) => void;
  basemapId: BasemapId;
  onSelectBasemap: (id: BasemapId) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  showDimensions: boolean;
  onToggleDimensions: () => void;
  showSetbacks: boolean;
  onToggleSetbacks: () => void;
  snappingEnabled: boolean;
  onToggleSnapping: () => void;
  solarConfig: SolarPanelConfig;
  onUpdateSolarConfig: (config: SolarPanelConfig) => void;
  showPvRowsOverlay: boolean;
  onTogglePvRowsOverlay: () => void;
  showSoilHeatmap: boolean;
  onToggleSoilHeatmap: () => void;
  soilMetric: SoilMetricType;
  onSelectSoilMetric: (metric: SoilMetricType) => void;
  soilOpacity: number;
  onUpdateSoilOpacity: (opacity: number) => void;
  showClimateHeatmap: boolean;
  onToggleClimateHeatmap: () => void;
  climateMetric: ClimateMetricType;
  onSelectClimateMetric: (metric: ClimateMetricType) => void;
  climateOpacity: number;
  onUpdateClimateOpacity: (opacity: number) => void;
  projects: LandProject[];
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onUpdateProjectMeta: (name: string, client?: string, location?: string, desc?: string) => void;
  onExportProjectJSON: () => void;
  onImportProjectFile: (file: File) => void;
  leafletMap: LeafletMap | null;
  isOpen: boolean;
  onToggleOpen: () => void;
  onStartDrawingParcel: () => void;
  onElevationHoverPoint?: (point: GeoPoint | null, elevationLabel?: string) => void;
  onTransectCoordsChange?: (coords: GeoPoint[]) => void;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  project,
  activeTab,
  onSelectTab,
  selectedParcelId,
  selectedLineId,
  selectedMarkerId,
  onSelectParcel,
  onSelectLine,
  onSelectMarker,
  onUpdateParcel,
  onDeleteParcel,
  onDuplicateParcel,
  onUpdateLine,
  onDeleteLine,
  onUpdateMarker,
  onDeleteMarker,
  basemapId,
  onSelectBasemap,
  showLabels,
  onToggleLabels,
  showDimensions,
  onToggleDimensions,
  showSetbacks,
  onToggleSetbacks,
  snappingEnabled,
  onToggleSnapping,
  solarConfig,
  onUpdateSolarConfig,
  showPvRowsOverlay,
  onTogglePvRowsOverlay,
  showSoilHeatmap,
  onToggleSoilHeatmap,
  soilMetric,
  onSelectSoilMetric,
  soilOpacity,
  onUpdateSoilOpacity,
  showClimateHeatmap,
  onToggleClimateHeatmap,
  climateMetric,
  onSelectClimateMetric,
  climateOpacity,
  onUpdateClimateOpacity,
  projects,
  onSelectProject,
  onNewProject,
  onUpdateProjectMeta,
  onExportProjectJSON,
  onImportProjectFile,
  leafletMap,
  isOpen,
  onToggleOpen,
  onStartDrawingParcel,
  onElevationHoverPoint,
  onTransectCoordsChange,
}) => {
  const [projNameInput, setProjNameInput] = useState(project.name);
  const [clientInput, setClientInput] = useState(project.clientOrOwner || '');
  const [locInput, setLocInput] = useState(project.locationName || '');
  const [descInput, setDescInput] = useState(project.description || '');
  const [basemapStatus, setBasemapStatus] = useState<{ hasCarto: boolean; message: string }>({
    hasCarto: false,
    message: '',
  });
  const [cacheStats, setCacheStats] = useState<{
    cachedTilesCount: number;
    hitRatio: string;
    memoryMB: string;
  } | null>(null);

  // Query backend basemaps configuration, API key connection status, and universal cache
  React.useEffect(() => {
    const checkConfig = () => {
      fetch('/api/basemaps/config')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.keysDetected) {
            setBasemapStatus({
              hasCarto: Boolean(data.keysDetected.carto || data.keysDetected.generic),
              message: data.message || '',
            });
          }
          if (data?.cacheStats) {
            setCacheStats(data.cacheStats);
          }
        })
        .catch(() => {});
    };
    checkConfig();
    const interval = setInterval(checkConfig, 10000);
    return () => clearInterval(interval);
  }, []);

  // Keep project meta inputs updated
  React.useEffect(() => {
    setProjNameInput(project.name);
    setClientInput(project.clientOrOwner || '');
    setLocInput(project.locationName || '');
    setDescInput(project.description || '');
  }, [project.id]);

  const selectedParcel = project.parcels.find((p) => p.id === selectedParcelId);
  const selectedLine = project.lines.find((l) => l.id === selectedLineId);
  const selectedMarker = project.markers.find((m) => m.id === selectedMarkerId);

  // Zoom to parcel
  const handleZoomToParcel = (parcel: LandParcel) => {
    if (!leafletMap || parcel.coordinates.length === 0) return;
    const bounds = parcel.coordinates.map((c) => [c.lat, c.lng] as [number, number]);
    leafletMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 });
    onSelectParcel(parcel.id);
  };

  const handleZoomToLine = (line: LandLine) => {
    if (!leafletMap || line.coordinates.length === 0) return;
    const bounds = line.coordinates.map((c) => [c.lat, c.lng] as [number, number]);
    leafletMap.fitBounds(bounds, { padding: [60, 60] });
    onSelectLine(line.id);
  };

  const handleZoomToMarker = (marker: LandMarker) => {
    if (!leafletMap) return;
    leafletMap.setView([marker.point.lat, marker.point.lng], 18, { animate: true });
    onSelectMarker(marker.id);
  };

  const totalAreaM2 = project.parcels.reduce((sum, p) => sum + p.areaSqMeters, 0);
  const totalAreaFormatted = formatArea(totalAreaM2, project.unitPreference);

  return (
    <>
      {/* Toggle button on the edge of the panel */}
      <button
        onClick={onToggleOpen}
        className={`absolute top-20 right-0 z-20 w-7 h-12 bg-slate-900 border-l border-y border-slate-700 rounded-l-md flex items-center justify-center text-slate-400 hover:text-white transition-transform ${
          isOpen ? 'translate-x-0' : '-translate-x-0'
        }`}
        title={isOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
      >
        <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-0' : 'rotate-180'}`} />
      </button>

      <aside
        className={`w-96 bg-slate-900/95 backdrop-blur-md border-l border-slate-800 flex flex-col h-[calc(100vh-3.5rem)] z-20 shrink-0 transition-all duration-200 select-none ${
          isOpen ? 'translate-x-0' : 'translate-x-full absolute right-0'
        }`}
      >
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1 gap-1 shrink-0">
          <button
            onClick={() => onSelectTab('parcels')}
            className={`flex-1 py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'parcels'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span>Layout</span>
          </button>

          <button
            onClick={() => onSelectTab('details')}
            className={`flex-1 py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'details'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Survey</span>
          </button>

          <button
            onClick={() => onSelectTab('layers')}
            className={`flex-1 py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'layers'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Layers</span>
          </button>

          <button
            onClick={() => onSelectTab('projects')}
            className={`flex-1 py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'projects'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
            <span>Projects</span>
          </button>
        </div>

        {/* Tab 1: Layout & Parcels List */}
        {activeTab === 'parcels' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Total Area Summary Banner */}
            <div className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Total Layout Area</span>
                <span className="font-mono text-emerald-400 font-semibold">{project.parcels.length} Zones</span>
              </div>
              <div className="text-xl font-bold font-mono text-slate-100">
                {totalAreaFormatted.primary}
              </div>
              <div className="text-xs text-slate-400 font-mono">
                {totalAreaFormatted.secondary}
              </div>
            </div>

            {/* Parcels Header */}
            <div className="flex items-center justify-between pt-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Parcels & Zones ({project.parcels.length})
              </h3>
              <button
                onClick={onStartDrawingParcel}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/50 hover:bg-emerald-950/80 transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Add Parcel</span>
              </button>
            </div>

            {/* Parcels Cards */}
            {project.parcels.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                No parcels marked yet. Click "Add Parcel" or select the polygon tool on the map.
              </div>
            ) : (
              <div className="space-y-2">
                {project.parcels.map((parcel) => {
                  const isSelected = parcel.id === selectedParcelId;
                  const areaInfo = formatArea(parcel.areaSqMeters, project.unitPreference);

                  return (
                    <div
                      key={parcel.id}
                      onClick={() => onSelectParcel(parcel.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800/90 border-cyan-500/80 ring-1 ring-cyan-500/30 shadow-md'
                          : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20"
                            style={{ backgroundColor: parcel.color }}
                          />
                          <span className="text-xs font-semibold text-slate-200 truncate">
                            {parcel.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectParcel(parcel.id);
                              onSelectTab('details');
                            }}
                            className="p-1 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-700"
                            title="Inspect Terrain Elevation Profile"
                          >
                            <Mountain className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleZoomToParcel(parcel);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-700"
                            title="Zoom to parcel"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicateParcel(parcel);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-700"
                            title="Duplicate parcel"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteParcel(parcel.id);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-700"
                            title="Delete parcel"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Unboxed clean metadata */}
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-400 font-mono">
                        <span className="text-emerald-400 font-medium">{areaInfo.primary}</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span>{formatDistance(parcel.perimeterMeters, project.unitPreference)} perim</span>
                      </div>

                      {parcel.zoningCode && (
                        <div className="mt-1 text-[11px] text-slate-400 truncate">
                          Zone: {parcel.zoningCode}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Boundary Lines Section */}
            {project.lines.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Fences & Roads ({project.lines.length})
                </h4>
                <div className="space-y-1.5">
                  {project.lines.map((line) => {
                    const isSelected = line.id === selectedLineId;
                    return (
                      <div
                        key={line.id}
                        onClick={() => onSelectLine(line.id)}
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-slate-800 border-cyan-500/80 text-white'
                            : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/80'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-3 h-1 rounded-full shrink-0"
                            style={{ backgroundColor: line.color }}
                          />
                          <span className="truncate">{line.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-cyan-300">
                            {formatDistance(line.lengthMeters, project.unitPreference)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectLine(line.id);
                              onSelectTab('details');
                            }}
                            className="p-1 hover:text-cyan-300"
                            title="Inspect Terrain Elevation Profile"
                          >
                            <Mountain className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleZoomToLine(line);
                            }}
                            className="p-1 hover:text-white"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteLine(line.id);
                            }}
                            className="p-1 hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Survey Markers Section */}
            {project.markers.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Survey Pins & Points ({project.markers.length})
                </h4>
                <div className="space-y-1.5">
                  {project.markers.map((marker) => {
                    const isSelected = marker.id === selectedMarkerId;
                    return (
                      <div
                        key={marker.id}
                        onClick={() => onSelectMarker(marker.id)}
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-slate-800 border-cyan-500/80 text-white'
                            : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/80'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                          <span className="truncate">{marker.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleZoomToMarker(marker);
                            }}
                            className="p-1 hover:text-white"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteMarker(marker.id);
                            }}
                            className="p-1 hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Survey & Inspector Details */}
        {activeTab === 'details' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {selectedParcel ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                    Parcel Inspector
                  </h3>
                  <button
                    onClick={() => handleZoomToParcel(selectedParcel)}
                    className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Focus</span>
                  </button>
                </div>

                {/* Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Parcel Label / Title</label>
                  <input
                    type="text"
                    value={selectedParcel.name}
                    onChange={(e) => onUpdateParcel({ ...selectedParcel, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Category Preset */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Land Zoning / Category</label>
                  <select
                    value={selectedParcel.category}
                    onChange={(e) => {
                      const newCat = e.target.value as LandCategory;
                      const preset = CATEGORY_PRESETS[newCat];
                      onUpdateParcel({
                        ...selectedParcel,
                        category: newCat,
                        color: preset.defaultColor,
                        strokeColor: preset.defaultStroke,
                        fillOpacity: preset.fillOpacity,
                      });
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    {Object.values(CATEGORY_PRESETS).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Color & Opacity */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">Fill Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedParcel.color}
                        onChange={(e) => onUpdateParcel({ ...selectedParcel, color: e.target.value })}
                        className="w-8 h-8 rounded border border-slate-700 bg-slate-800 cursor-pointer p-0"
                      />
                      <span className="text-xs font-mono text-slate-300">{selectedParcel.color}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">
                      Opacity: {Math.round((selectedParcel.fillOpacity || 0.35) * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0.05"
                      max="0.8"
                      step="0.05"
                      value={selectedParcel.fillOpacity || 0.35}
                      onChange={(e) => onUpdateParcel({ ...selectedParcel, fillOpacity: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-500"
                    />
                  </div>
                </div>

                {/* Calculated Area & Perimeter Metric Cards */}
                <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Calculated Area</div>
                    <div className="text-sm font-bold font-mono text-emerald-400">
                      {formatArea(selectedParcel.areaSqMeters, project.unitPreference).primary}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {Math.round(selectedParcel.areaSqMeters).toLocaleString()} m²
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Perimeter</div>
                    <div className="text-sm font-bold font-mono text-cyan-300">
                      {formatDistance(selectedParcel.perimeterMeters, project.unitPreference)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {selectedParcel.coordinates.length} Vertices
                    </div>
                  </div>
                </div>

                {/* Setback Buffer Tool */}
                <div className="space-y-1.5 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
                  <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                    <span>Inward Setback Buffer</span>
                    <span className="font-mono text-amber-400 text-xs">
                      {selectedParcel.setbackMeters || 0} m ({((selectedParcel.setbackMeters || 0) * 3.28084).toFixed(0)} ft)
                    </span>
                  </label>
                  <div className="flex gap-2">
                    {[0, 5, 10, 15, 25].map((m) => (
                      <button
                        key={m}
                        onClick={() => onUpdateParcel({ ...selectedParcel, setbackMeters: m })}
                        className={`flex-1 py-1 text-xs rounded border transition-colors ${
                          selectedParcel.setbackMeters === m
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        {m === 0 ? 'None' : `${m}m`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Zoning & Tax Lot */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">Zoning Code</label>
                    <input
                      type="text"
                      placeholder="e.g. AP-40, R-1"
                      value={selectedParcel.zoningCode || ''}
                      onChange={(e) => onUpdateParcel({ ...selectedParcel, zoningCode: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">Tax Lot / APN</label>
                    <input
                      type="text"
                      placeholder="e.g. TL-042-180"
                      value={selectedParcel.taxLotNumber || ''}
                      onChange={(e) => onUpdateParcel({ ...selectedParcel, taxLotNumber: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Surveyor Notes & Observations</label>
                  <textarea
                    rows={2}
                    value={selectedParcel.notes || ''}
                    onChange={(e) => onUpdateParcel({ ...selectedParcel, notes: e.target.value })}
                    placeholder="Terrain notes, soil condition, easements, access points..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none"
                  />
                </div>

                {/* Boundary Segments Table */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Boundary Edge Dimensions
                    </h4>
                    <button
                      onClick={() => {
                        const csv = exportParcelSurveyCSV(selectedParcel, project.name);
                        downloadFile(csv, `${selectedParcel.name.toLowerCase().replace(/\s+/g, '_')}_survey.csv`, 'text/csv');
                      }}
                      className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                    >
                      <FileSpreadsheet className="w-3 h-3" />
                      <span>Export CSV</span>
                    </button>
                  </div>

                  <div className="border border-slate-800 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 sticky top-0">
                        <tr>
                          <th className="py-1 px-2">Side</th>
                          <th className="py-1 px-2">Distance</th>
                          <th className="py-1 px-2">Bearing</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {calculateSegmentLengths(selectedParcel.coordinates).map((seg) => (
                          <tr key={seg.index} className="hover:bg-slate-800/40">
                            <td className="py-1 px-2 text-slate-400">#{seg.fromIndex} → #{seg.toIndex}</td>
                            <td className="py-1 px-2 text-emerald-400">
                              {formatDistance(seg.distanceMeters, project.unitPreference)}
                            </td>
                            <td className="py-1 px-2 text-slate-400">{seg.bearingDeg.toFixed(1)}°</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Solar Panel Capacity Estimator Section */}
                <SolarPanelEstimator
                  parcel={selectedParcel}
                  centerLat={project.center.lat}
                  unitPreference={project.unitPreference}
                  showPvRowsOverlay={showPvRowsOverlay}
                  onTogglePvRowsOverlay={onTogglePvRowsOverlay}
                  solarConfig={solarConfig}
                  onUpdateSolarConfig={onUpdateSolarConfig}
                />

                {/* Terrain Elevation Cross-Section Profile Tool */}
                <ElevationProfile
                  coordinates={selectedParcel.coordinates}
                  isPolygon={true}
                  title={selectedParcel.name}
                  unitPreference={project.unitPreference}
                  onHoverPoint={onElevationHoverPoint}
                  onTransectChange={onTransectCoordsChange}
                />

                {/* Actions */}
                <div className="pt-2 flex gap-2">
                  <button
                    onClick={() => onDeleteParcel(selectedParcel.id)}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Parcel</span>
                  </button>
                </div>
              </div>
            ) : selectedLine ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                    Linear Boundary Inspector
                  </h3>
                  <button
                    onClick={() => handleZoomToLine(selectedLine)}
                    className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Focus</span>
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Line Name</label>
                  <input
                    type="text"
                    value={selectedLine.name}
                    onChange={(e) => onUpdateLine({ ...selectedLine, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Total Length</label>
                  <div className="text-sm font-bold font-mono text-cyan-300">
                    {formatDistance(selectedLine.lengthMeters, project.unitPreference)}
                  </div>
                </div>

                {/* Terrain Elevation Cross-Section Profile Tool along Line */}
                <ElevationProfile
                  coordinates={selectedLine.coordinates}
                  isPolygon={false}
                  title={selectedLine.name}
                  unitPreference={project.unitPreference}
                  onHoverPoint={onElevationHoverPoint}
                />

                <button
                  onClick={() => onDeleteLine(selectedLine.id)}
                  className="w-full py-1.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs font-semibold"
                >
                  Delete Line
                </button>
              </div>
            ) : selectedMarker ? (
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400">
                  Survey Marker Inspector
                </h3>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Pin Name</label>
                  <input
                    type="text"
                    value={selectedMarker.name}
                    onChange={(e) => onUpdateMarker({ ...selectedMarker, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                  />
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Lat: {selectedMarker.point.lat.toFixed(6)}° · Lng: {selectedMarker.point.lng.toFixed(6)}°
                </div>
                <button
                  onClick={() => onDeleteMarker(selectedMarker.id)}
                  className="w-full py-1.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs font-semibold"
                >
                  Delete Pin
                </button>
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-400 text-xs space-y-2">
                <Info className="w-6 h-6 mx-auto text-slate-600" />
                <div>Click any parcel, line, or pin on the map to inspect survey details, dimension tables, and setbacks.</div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Layers & Basemaps */}
        {activeTab === 'layers' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Satellite & Map Basemaps
                </h3>
                {basemapStatus.hasCarto ? (
                  <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    CARTO Key Connected
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-mono" title="Connect CARTO_API_KEY in backend environment">
                    Backend Proxy Ready
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'esri_satellite', name: 'ESRI Satellite HD', desc: 'Real-time high-res orthophoto (native z21)' },
                  { id: 'esri_clarity', name: 'ESRI Clarity', desc: 'Minimal clouds & distortion (native z21)' },
                  { id: 'esri_hybrid', name: 'Satellite + Labels', desc: 'Roads, towns, and borders (native z21)' },
                  { id: 'usgs_topo', name: 'USGS Topo', desc: 'Contour lines & terrain (native z19)' },
                  { id: 'carto_voyager', name: 'CARTO Voyager', desc: 'Full roads, terrain & place labels' },
                  { id: 'carto_voyager_clean', name: 'CARTO Voyager Clean', desc: 'No labels: clean terrain & boundaries' },
                  { id: 'carto_voyager_hd', name: 'CARTO Voyager HD (2x)', desc: 'Ultra-sharp Retina close-up' },
                  { id: 'carto_dark', name: 'CARTO Dark Matter', desc: 'High contrast vector & night cadastre' },
                  { id: 'carto_dark_clean', name: 'CARTO Dark Clean', desc: 'No labels: dark blueprint design mode' },
                  { id: 'carto_positron', name: 'CARTO Positron', desc: 'Clean minimal white survey cadastre' },
                  { id: 'carto_positron_clean', name: 'CARTO Positron Clean', desc: 'No labels: architectural white canvas' },
                  { id: 'osm', name: 'OpenStreetMap', desc: 'Standard street cadastre (native z22)' },
                ].map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onSelectBasemap(b.id as BasemapId)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      basemapId === b.id
                        ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-xs'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold">{b.name}</div>
                      {b.id.startsWith('carto_') && basemapStatus.hasCarto && (
                        <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-1 py-0.2 rounded font-mono font-semibold">
                          PROXY
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{b.desc}</div>
                  </button>
                ))}
              </div>

              {/* Universal Shared Cache Telemetry Banner */}
              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/60 flex items-center justify-between text-[11px] mt-2">
                <div className="flex items-center gap-1.5 text-cyan-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span>
                    Shared Cache:{' '}
                    {cacheStats
                      ? `${cacheStats.cachedTilesCount} tiles (${cacheStats.memoryMB} MB) • ${cacheStats.hitRatio} hits`
                      : 'Active (Instant re-visit for all users)'}
                  </span>
                </div>
                <div className="text-emerald-400 font-mono text-[10px] font-semibold">
                  Max Zoom: 24 (Buf 8)
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Overlay Toggles
              </h3>

              <div className="space-y-2">
                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-700/60 cursor-pointer">
                  <div>
                    <div className="text-xs text-slate-200 font-medium">Automated Parcel Centroid Labels</div>
                    <div className="text-[10px] text-slate-400">Renders parcel names at polygon center points</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showLabels}
                    onChange={onToggleLabels}
                    className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-700/60 cursor-pointer">
                  <span className="text-xs text-slate-300">Boundary Edge Dimensions</span>
                  <input
                    type="checkbox"
                    checked={showDimensions}
                    onChange={onToggleDimensions}
                    className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-700/60 cursor-pointer">
                  <span className="text-xs text-slate-300">Setback Buffer Boundaries</span>
                  <input
                    type="checkbox"
                    checked={showSetbacks}
                    onChange={onToggleSetbacks}
                    className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-700/60 cursor-pointer">
                  <span className="text-xs text-slate-300">Corner Snapping Magnet</span>
                  <input
                    type="checkbox"
                    checked={snappingEnabled}
                    onChange={onToggleSnapping}
                    className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Soil Quality & Agricultural Suitability Heatmap Section */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <Sprout className="w-4 h-4 text-emerald-400" />
                  <span>Soil Quality & Suitability Heatmap</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSoilHeatmap}
                    onChange={onToggleSoilHeatmap}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {showSoilHeatmap ? (
                <div className="space-y-3 bg-slate-950/60 p-3 rounded-xl border border-emerald-950/80">
                  <div className="text-[11px] text-slate-300">
                    Real-time interpolated agricultural suitability raster overlaid on satellite imagery.
                  </div>

                  {/* Metric Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Active Soil Metric</label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {(
                        [
                          'suitability_index',
                          'organic_matter',
                          'drainage_class',
                          'ph_level',
                          'erosion_risk',
                        ] as SoilMetricType[]
                      ).map((m) => {
                        const conf = SOIL_METRIC_CONFIGS[m];
                        const isSelected = soilMetric === m;
                        return (
                          <button
                            key={m}
                            onClick={() => onSelectSoilMetric(m)}
                            className={`p-2 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-xs'
                                : 'bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold">{conf.label}</span>
                              <span className="text-[10px] font-mono text-emerald-400">{conf.unit}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{conf.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Heatmap Opacity Slider */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Heatmap Layer Opacity:</span>
                      <span className="font-mono text-emerald-400 font-semibold">{Math.round(soilOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="0.9"
                      step="0.05"
                      value={soilOpacity}
                      onChange={(e) => onUpdateSoilOpacity(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  {/* Heatmap Color Scale Bar */}
                  <div className="space-y-1 pt-1 border-t border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Suitability Color Scale</div>
                    <div className="h-3 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 via-lime-500 to-emerald-600 shadow-inner" />
                    <div className="flex justify-between text-[9px] font-mono text-slate-400 px-0.5">
                      <span>Marginal / Non-Arable</span>
                      <span>Moderate</span>
                      <span className="text-emerald-400 font-semibold">Prime Farmland</span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-800 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <span>Click anywhere on the satellite map to probe soil characteristics, drainage, and prime farmland status.</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 bg-slate-800/30 p-2.5 rounded-lg border border-slate-800">
                  Enable the heatmap overlay to visualize USDA agricultural capability classes, organic fertility, drainage percolation, and erosion vulnerability across your project land.
                </div>
              )}
            </div>

            {/* Regional Climate & Meteorological Heatmap Section */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-400">
                  <CloudRain className="w-4 h-4 text-cyan-400" />
                  <span>Annual Rainfall & Wind Heatmap</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showClimateHeatmap}
                    onChange={onToggleClimateHeatmap}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              {showClimateHeatmap ? (
                <div className="space-y-3 bg-slate-950/60 p-3 rounded-xl border border-cyan-950/80">
                  <div className="text-[11px] text-slate-300">
                    Regional historical meteorological data interpolated across terrain for site feasibility analysis.
                  </div>

                  {/* Metric Selector: Rainfall vs Wind Speed */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold">Active Climate Metric</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => onSelectClimateMetric('rainfall')}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          climateMetric === 'rainfall'
                            ? 'bg-cyan-950/50 border-cyan-500 text-white shadow-sm'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Annual Rainfall</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">
                          {project.unitPreference === 'imperial' ? 'Inches / Year' : 'Millimeters / Year'}
                        </div>
                      </button>

                      <button
                        onClick={() => onSelectClimateMetric('wind')}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          climateMetric === 'wind'
                            ? 'bg-cyan-950/50 border-cyan-500 text-white shadow-sm'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          <Wind className="w-3.5 h-3.5 text-amber-400" />
                          <span>Mean Wind Speed</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">
                          {project.unitPreference === 'imperial' ? 'MPH at 10m' : 'Meters/Sec at 10m'}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Opacity Slider */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Heatmap Raster Opacity</span>
                      <span className="font-mono text-cyan-300 font-semibold">{Math.round(climateOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.15}
                      max={0.9}
                      step={0.05}
                      value={climateOpacity}
                      onChange={(e) => onUpdateClimateOpacity(parseFloat(e.target.value))}
                      className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Legend Stops */}
                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {CLIMATE_METRIC_CONFIGS[climateMetric].label} Scale
                    </div>
                    <div
                      className={`h-2.5 rounded-full shadow-inner ${
                        climateMetric === 'rainfall'
                          ? 'bg-gradient-to-r from-amber-600 via-yellow-400 via-cyan-400 via-blue-600 to-indigo-700'
                          : 'bg-gradient-to-r from-cyan-300 via-emerald-500 via-yellow-400 via-orange-500 to-red-600'
                      }`}
                    />
                    <div className="flex justify-between text-[9px] font-mono text-slate-400">
                      {CLIMATE_METRIC_CONFIGS[climateMetric].legendStops.map((stop, i) => (
                        <span key={i}>{stop.label.split(' ')[0]}</span>
                      ))}
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-800 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <span>Click anywhere on the satellite canvas to probe exact annual rainfall, wind speeds, and wind power density.</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 bg-slate-800/30 p-2.5 rounded-lg border border-slate-800">
                  Toggle on to display regional average annual precipitation and atmospheric wind speed raster heatmaps directly over the satellite canvas.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Project Management & Backups */}
        {activeTab === 'projects' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                Active Project Settings
              </h3>
              <button
                onClick={onNewProject}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/50"
              >
                <Plus className="w-3 h-3" />
                <span>New Project</span>
              </button>
            </div>

            <div className="space-y-2 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Project Title</label>
                <input
                  type="text"
                  value={projNameInput}
                  onChange={(e) => {
                    setProjNameInput(e.target.value);
                    onUpdateProjectMeta(e.target.value, clientInput, locInput, descInput);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Client / Property Owner</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe, Ag Land Corp"
                  value={clientInput}
                  onChange={(e) => {
                    setClientInput(e.target.value);
                    onUpdateProjectMeta(projNameInput, e.target.value, locInput, descInput);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Geographic Location</label>
                <input
                  type="text"
                  placeholder="e.g. Napa County, CA"
                  value={locInput}
                  onChange={(e) => {
                    setLocInput(e.target.value);
                    onUpdateProjectMeta(projNameInput, clientInput, e.target.value, descInput);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Project Description</label>
                <textarea
                  rows={2}
                  value={descInput}
                  onChange={(e) => {
                    setDescInput(e.target.value);
                    onUpdateProjectMeta(projNameInput, clientInput, locInput, e.target.value);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white resize-none"
                />
              </div>
            </div>

            {/* Saved Projects Switcher */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                All Saved Projects ({projects.length})
              </h4>
              <div className="space-y-1.5">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => onSelectProject(p.id)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      p.id === project.id
                        ? 'bg-slate-800 border-purple-500/80 text-white font-semibold'
                        : 'bg-slate-800/30 border-slate-700/50 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{p.name}</span>
                      {p.id === project.id && (
                        <span className="text-[10px] text-purple-400 font-mono">ACTIVE</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {p.parcels.length} Parcels · {p.locationName || 'Unspecified location'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Backup & Import/Export */}
            <div className="space-y-2 pt-3 border-t border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Backups & Data Portability
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onExportProjectJSON}
                  className="py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Backup JSON</span>
                </button>

                <label className="py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Import File</span>
                  <input
                    type="file"
                    accept=".json,.geojson"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        onImportProjectFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
