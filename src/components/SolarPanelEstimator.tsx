import React, { useState } from 'react';
import {
  LandParcel,
  SolarPanelConfig,
  UnitSystem,
} from '../types';
import {
  calculateSolarCapacity,
  DEFAULT_SOLAR_CONFIG,
  calculateOrientationFactor,
} from '../utils/solarCalculator';
import { formatArea } from '../utils/geoMath';
import {
  Sun,
  Zap,
  Home,
  Leaf,
  DollarSign,
  Compass,
  Sliders,
  Eye,
  EyeOff,
  Download,
  Info,
} from 'lucide-react';

interface SolarPanelEstimatorProps {
  parcel: LandParcel;
  centerLat: number;
  unitPreference: UnitSystem;
  showPvRowsOverlay: boolean;
  onTogglePvRowsOverlay: () => void;
  solarConfig: SolarPanelConfig;
  onUpdateSolarConfig: (config: SolarPanelConfig) => void;
}

export const SolarPanelEstimator: React.FC<SolarPanelEstimatorProps> = ({
  parcel,
  centerLat,
  unitPreference,
  showPvRowsOverlay,
  onTogglePvRowsOverlay,
  solarConfig,
  onUpdateSolarConfig,
}) => {
  const result = calculateSolarCapacity(parcel, solarConfig, centerLat);
  const areaInfo = formatArea(parcel.areaSqMeters, unitPreference);
  const orientation = calculateOrientationFactor(solarConfig, centerLat);

  // Direction label for azimuth
  const getAzimuthLabel = (deg: number) => {
    if (deg >= 337.5 || deg < 22.5) return 'North (0°)';
    if (deg >= 22.5 && deg < 67.5) return 'Northeast (45°)';
    if (deg >= 67.5 && deg < 112.5) return 'East (90°)';
    if (deg >= 112.5 && deg < 157.5) return 'Southeast (135°)';
    if (deg >= 157.5 && deg < 202.5) return 'South (180° - Optimal)';
    if (deg >= 202.5 && deg < 247.5) return 'Southwest (225°)';
    if (deg >= 247.5 && deg < 292.5) return 'West (270°)';
    return 'Northwest (315°)';
  };

  const handleExportCsv = () => {
    let csv = `Solar PV Feasibility Assessment Report\n`;
    csv += `Parcel Name,${parcel.name}\n`;
    csv += `Total Parcel Area,${areaInfo.primary}\n`;
    csv += `Net Usable PV Surface Area,${result.usableAreaAcres.toFixed(2)} Acres (${Math.round(result.usableAreaSqMeters).toLocaleString()} m²)\n`;
    csv += `Mounting Technology,${solarConfig.mountType}\n`;
    csv += `Racking Azimuth,${solarConfig.azimuthDeg}°\n`;
    csv += `Racking Tilt,${solarConfig.tiltDeg}°\n`;
    csv += `Ground Cover Ratio,${Math.round(solarConfig.groundCoverRatio * 100)}%\n`;
    csv += `Panel Wattage Rating,${solarConfig.panelWattage} W\n`;
    csv += `Estimated Panel Count,${result.estimatedPanelCount.toLocaleString()}\n`;
    csv += `Installed DC Capacity (kWp),${result.dcCapacityKw.toFixed(1)}\n`;
    csv += `Installed DC Capacity (MWp),${result.dcCapacityMw.toFixed(3)}\n`;
    csv += `Estimated Annual Generation (MWh),${result.annualGenerationMwh.toFixed(1)}\n`;
    csv += `Homes Powered Annually,${result.homesPoweredAnnually.toLocaleString()}\n`;
    csv += `Annual CO2 Offset (Metric Tons),${result.co2OffsetMetricTonsYear.toLocaleString()}\n`;
    csv += `Estimated Annual Revenue Value ($),${result.estimatedAnnualRevenue.toLocaleString()}\n`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${parcel.name.toLowerCase().replace(/\s+/g, '_')}_solar_estimate.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pt-3 border-t border-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
          <Sun className="w-4 h-4 text-amber-400" />
          <span>Solar Capacity Estimator</span>
        </div>
        <button
          onClick={onTogglePvRowsOverlay}
          className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-colors ${
            showPvRowsOverlay
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-semibold'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title="Toggle PV string rows visual on map"
        >
          {showPvRowsOverlay ? <Eye className="w-3 h-3 text-amber-400" /> : <EyeOff className="w-3 h-3" />}
          <span>{showPvRowsOverlay ? 'Hide PV Rows' : 'Show PV Rows'}</span>
        </button>
      </div>

      {/* Primary Capacity Metric Cards */}
      <div className="grid grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
        <div>
          <div className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Installed DC Capacity</span>
          </div>
          <div className="text-base font-bold font-mono text-amber-300 mt-0.5">
            {result.dcCapacityMw >= 1
              ? `${result.dcCapacityMw.toFixed(2)} MWp`
              : `${Math.round(result.dcCapacityKw).toLocaleString()} kWp`}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            ~{result.estimatedPanelCount.toLocaleString()} Modules (550W)
          </div>
        </div>

        <div>
          <div className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
            <Sun className="w-3 h-3 text-cyan-400" />
            <span>Annual Clean Energy</span>
          </div>
          <div className="text-base font-bold font-mono text-cyan-300 mt-0.5">
            {Math.round(result.annualGenerationMwh).toLocaleString()} MWh/yr
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {result.peakSunHoursPerDay.toFixed(1)} Peak Sun Hrs/Day
          </div>
        </div>
      </div>

      {/* Secondary Impact Metrics */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-800/40 border border-slate-700/60 p-2 rounded-lg">
          <Home className="w-3.5 h-3.5 mx-auto text-emerald-400" />
          <div className="text-xs font-bold font-mono text-slate-100 mt-1">
            {result.homesPoweredAnnually.toLocaleString()}
          </div>
          <div className="text-[9px] text-slate-400">Homes Powered</div>
        </div>

        <div className="bg-slate-800/40 border border-slate-700/60 p-2 rounded-lg">
          <Leaf className="w-3.5 h-3.5 mx-auto text-emerald-400" />
          <div className="text-xs font-bold font-mono text-slate-100 mt-1">
            {result.co2OffsetMetricTonsYear.toLocaleString()} t
          </div>
          <div className="text-[9px] text-slate-400">CO₂ Offset/Yr</div>
        </div>

        <div className="bg-slate-800/40 border border-slate-700/60 p-2 rounded-lg">
          <DollarSign className="w-3.5 h-3.5 mx-auto text-emerald-400" />
          <div className="text-xs font-bold font-mono text-slate-100 mt-1">
            ${Math.round(result.estimatedAnnualRevenue / 1000).toLocaleString()}k
          </div>
          <div className="text-[9px] text-slate-400">Annual Value</div>
        </div>
      </div>

      {/* Racking & Orientation Controls */}
      <div className="space-y-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
        <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Orientation & System Parameters</span>
          </span>
          <span className="text-[10px] text-emerald-400 font-mono font-medium">
            {orientation.details}
          </span>
        </div>

        {/* Mounting Type */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 uppercase font-semibold">Racking Technology</label>
          <select
            value={solarConfig.mountType}
            onChange={(e) =>
              onUpdateSolarConfig({ ...solarConfig, mountType: e.target.value as SolarPanelConfig['mountType'] })
            }
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="single_axis_tracker">Single-Axis Horizontal Tracker (+22% yield)</option>
            <option value="fixed_ground">Fixed Ground-Mount Racks (Standard)</option>
            <option value="agrivoltaics">Agrivoltaics (Elevated dual farm/solar)</option>
            <option value="dual_axis">Dual-Axis Precision Tracker (+35% yield)</option>
            <option value="rooftop">Commercial Rooftop Ballasted</option>
          </select>
        </div>

        {/* Azimuth Slider (Compass Orientation) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1">
              <Compass className="w-3 h-3 text-amber-400" />
              <span>Azimuth Angle:</span>
            </span>
            <span className="font-mono text-amber-300 font-semibold">{getAzimuthLabel(solarConfig.azimuthDeg)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="355"
            step="5"
            value={solarConfig.azimuthDeg}
            onChange={(e) => onUpdateSolarConfig({ ...solarConfig, azimuthDeg: parseInt(e.target.value) })}
            className="w-full accent-amber-500"
          />
          <div className="flex justify-between text-[9px] font-mono text-slate-500 px-0.5">
            <span>North (0°)</span>
            <span>East (90°)</span>
            <span className="text-amber-400 font-semibold">South (180°)</span>
            <span>West (270°)</span>
            <span>North (360°)</span>
          </div>
        </div>

        {/* Tilt Slider */}
        {solarConfig.mountType !== 'single_axis_tracker' && solarConfig.mountType !== 'dual_axis' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Racking Tilt Angle:</span>
              <span className="font-mono text-slate-200 font-semibold">{solarConfig.tiltDeg}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              step="1"
              value={solarConfig.tiltDeg}
              onChange={(e) => onUpdateSolarConfig({ ...solarConfig, tiltDeg: parseInt(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>
        )}

        {/* Ground Cover Ratio (GCR) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Usable Ground Cover Ratio:</span>
            <span className="font-mono text-slate-200 font-semibold">
              {Math.round(solarConfig.groundCoverRatio * 100)}% coverage
            </span>
          </div>
          <input
            type="range"
            min="0.30"
            max="0.80"
            step="0.05"
            value={solarConfig.groundCoverRatio}
            onChange={(e) => onUpdateSolarConfig({ ...solarConfig, groundCoverRatio: parseFloat(e.target.value) })}
            className="w-full accent-cyan-500"
          />
          <div className="text-[10px] text-slate-400">
            Net usable module area: <strong className="text-slate-200 font-mono">{result.usableAreaAcres.toFixed(1)} Acres</strong> ({Math.round(result.usableAreaSqMeters).toLocaleString()} m²)
          </div>
        </div>
      </div>

      {/* Export Button */}
      <button
        onClick={handleExportCsv}
        className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
      >
        <Download className="w-3.5 h-3.5 text-amber-400" />
        <span>Export Solar Assessment (CSV)</span>
      </button>
    </div>
  );
};
