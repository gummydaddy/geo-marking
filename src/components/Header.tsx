import React from 'react';
import {
  Satellite,
  FolderOpen,
  Save,
  Download,
  Plus,
  Compass,
  Layers,
  Settings,
  MapPin,
  Check,
} from 'lucide-react';
import { LandProject, UnitSystem } from '../types';
import { formatArea } from '../utils/geoMath';

interface HeaderProps {
  currentProject: LandProject;
  projects: LandProject[];
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onSaveProject: () => void;
  onOpenExportModal: () => void;
  onToggleUnit: () => void;
  onOpenLocationSearch: () => void;
  activePanelTab: string;
  onSelectPanelTab: (tab: 'parcels' | 'details' | 'layers' | 'projects') => void;
  isSaving?: boolean;
  saveMessage?: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  currentProject,
  projects,
  onSelectProject,
  onNewProject,
  onSaveProject,
  onOpenExportModal,
  onToggleUnit,
  onOpenLocationSearch,
  activePanelTab,
  onSelectPanelTab,
  isSaving,
  saveMessage,
}) => {
  const totalAreaM2 = currentProject.parcels.reduce((sum, p) => sum + p.areaSqMeters, 0);
  const areaFormatted = formatArea(totalAreaM2, currentProject.unitPreference);

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between select-none z-30 shrink-0">
      {/* Zone 1: Single text element wordmark with satellite icon */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <Satellite className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight text-slate-100 flex items-center gap-1.5">
            GeoMark Studio
          </span>
        </div>
      </div>

      {/* Zone 2: Project selector & clean unboxed metadata + location search button */}
      <div className="hidden md:flex items-center gap-4">
        {/* Project Selector Dropdown */}
        <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs">
          <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={currentProject.id}
            onChange={(e) => onSelectProject(e.target.value)}
            className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer max-w-[200px] truncate"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Clean unboxed metadata with typographic separators */}
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span>{currentProject.parcels.length} {currentProject.parcels.length === 1 ? 'Parcel' : 'Parcels'}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="text-emerald-400 font-semibold">{areaFormatted.primary}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span>WGS84</span>
        </div>

        {/* Quick Search Location Button */}
        <button
          onClick={onOpenLocationSearch}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 text-xs transition-colors"
          title="Search satellite imagery location or coordinates"
        >
          <MapPin className="w-3 h-3 text-cyan-400" />
          <span>Find Location</span>
        </button>
      </div>

      {/* Zone 3: 1-2 primary actions & toggles */}
      <div className="flex items-center gap-2">
        {/* Unit preference toggle */}
        <button
          onClick={onToggleUnit}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs font-mono transition-colors"
          title={`Switch to ${currentProject.unitPreference === 'imperial' ? 'Metric (ha / m²)' : 'Imperial (acres / sq ft)'}`}
        >
          {currentProject.unitPreference === 'imperial' ? 'ACRES / FT' : 'HA / METRIC'}
        </button>

        {/* Tab Shortcuts for mobile/desktop */}
        <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700">
          <button
            onClick={() => onSelectPanelTab('parcels')}
            className={`p-1.5 rounded transition-colors ${activePanelTab === 'parcels' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            title="Parcels & Zones"
          >
            <Compass className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectPanelTab('layers')}
            className={`p-1.5 rounded transition-colors ${activePanelTab === 'layers' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            title="Satellite Basemaps & Layers"
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectPanelTab('projects')}
            className={`p-1.5 rounded transition-colors ${activePanelTab === 'projects' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            title="Project Settings & Backups"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Save Project Button */}
        <button
          onClick={onSaveProject}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shadow-sm"
          title="Save project changes to browser storage"
        >
          {saveMessage ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-300 font-semibold">{saveMessage}</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5 text-slate-400" />
              <span>Save Project</span>
            </>
          )}
        </button>

        {/* Primary Action: Export Map File */}
        <button
          onClick={onOpenExportModal}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shadow-sm shadow-emerald-500/20"
          title="Export high-resolution map file, GeoJSON, or KML"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Save Map File</span>
        </button>
      </div>
    </header>
  );
};
