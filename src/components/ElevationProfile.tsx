import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { GeoPoint, UnitSystem } from '../types';
import {
  ElevationProfileResult,
  fetchElevationProfile,
  generateParcelTransectCoords,
  formatElevationValue,
} from '../utils/elevationService';
import { formatDistance } from '../utils/geoMath';
import { downloadFile } from '../utils/exportImport';
import {
  Mountain,
  TrendingUp,
  ArrowUpDown,
  Download,
  RotateCcw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Compass,
  Layers,
  Info,
} from 'lucide-react';

interface ElevationProfileProps {
  // Coordinates of the selected entity (polygon boundary or polyline)
  coordinates: GeoPoint[];
  isPolygon: boolean;
  title: string;
  unitPreference: UnitSystem;
  onHoverPoint?: (point: GeoPoint | null, elevationLabel?: string) => void;
  onTransectChange?: (coords: GeoPoint[]) => void;
}

export const ElevationProfile: React.FC<ElevationProfileProps> = ({
  coordinates,
  isPolygon,
  title,
  unitPreference,
  onHoverPoint,
  onTransectChange,
}) => {
  const [profileType, setProfileType] = useState<'perimeter' | 'east_west' | 'north_south'>('perimeter');
  const [isReversed, setIsReversed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [profileData, setProfileData] = useState<ElevationProfileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Compute active coordinates based on selection and polygon mode
  const activePathCoordinates = useMemo(() => {
    if (!coordinates || coordinates.length < 2) return [];

    let raw: GeoPoint[];
    if (isPolygon) {
      if (profileType === 'east_west') {
        raw = generateParcelTransectCoords(coordinates, 'east_west');
      } else if (profileType === 'north_south') {
        raw = generateParcelTransectCoords(coordinates, 'north_south');
      } else {
        // Perimeter loop: close the polygon
        raw = [...coordinates, coordinates[0]];
      }
    } else {
      raw = [...coordinates];
    }

    if (isReversed) {
      raw = [...raw].reverse();
    }
    return raw;
  }, [coordinates, isPolygon, profileType, isReversed]);

  // Notify parent of transect line coordinates for rendering on map if requested
  useEffect(() => {
    if (onTransectChange && isPolygon && profileType !== 'perimeter') {
      onTransectChange(activePathCoordinates);
    } else if (onTransectChange && isPolygon && profileType === 'perimeter') {
      onTransectChange([]);
    }
  }, [activePathCoordinates, isPolygon, profileType, onTransectChange]);

  // Load elevation profile whenever active path coordinates change
  const loadProfile = useCallback(async () => {
    if (activePathCoordinates.length < 2) {
      setProfileData(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchElevationProfile(activePathCoordinates, 45);
      setProfileData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to calculate terrain elevation';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [activePathCoordinates]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // SVG Chart Dimensions
  const chartWidth = 340;
  const chartHeight = 140;
  const padding = { top: 18, right: 12, bottom: 26, left: 42 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Compute SVG path & coordinates
  const chartGeometry = useMemo(() => {
    if (!profileData || profileData.points.length === 0) return null;

    const points = profileData.points;
    const totalDist = profileData.totalDistanceMeters || 1;

    let minElev = profileData.minElevationMeters;
    let maxElev = profileData.maxElevationMeters;

    // Add 10% breathing room to elevation Y-axis
    const elevSpan = maxElev - minElev || 5;
    const yMin = Math.max(0, minElev - elevSpan * 0.1);
    const yMax = maxElev + elevSpan * 0.1;
    const yRange = yMax - yMin;

    const coords = points.map((pt) => {
      const x = padding.left + (pt.distanceMeters / totalDist) * innerWidth;
      const y = padding.top + innerHeight - ((pt.elevationMeters - yMin) / yRange) * innerHeight;
      return { x, y, pt };
    });

    // Create SVG path string
    const linePathD = coords.reduce((acc, curr, idx) => {
      return idx === 0 ? `M ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}` : `${acc} L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }, '');

    // Area fill path (closing along bottom)
    const areaPathD = `${linePathD} L ${coords[coords.length - 1].x.toFixed(1)} ${(padding.top + innerHeight).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padding.top + innerHeight).toFixed(1)} Z`;

    return {
      coords,
      linePathD,
      areaPathD,
      yMin,
      yMax,
      yRange,
      totalDist,
    };
  }, [profileData, innerWidth, innerHeight, padding.left, padding.top]);

  // Handle Chart Hover
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!chartGeometry || !svgRef.current || !profileData) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Find closest point by X coordinate
    let closestIdx = 0;
    let closestDist = Infinity;

    chartGeometry.coords.forEach((c, idx) => {
      const dist = Math.abs(c.x - mouseX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = idx;
      }
    });

    setHoverIndex(closestIdx);

    const hovered = profileData.points[closestIdx];
    if (hovered && onHoverPoint) {
      const elevFormatted = formatElevationValue(hovered.elevationMeters, unitPreference).full;
      onHoverPoint({ lat: hovered.lat, lng: hovered.lng }, elevFormatted);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    if (onHoverPoint) {
      onHoverPoint(null);
    }
  };

  // Export CSV handler
  const handleExportCSV = () => {
    if (!profileData) return;

    let csv = `Distance_Meters,Distance_Formatted,Elevation_Meters,Elevation_Feet,Slope_Percent,Latitude,Longitude\n`;
    profileData.points.forEach((p) => {
      const distFormatted = formatDistance(p.distanceMeters, unitPreference);
      const elevFt = (p.elevationMeters * 3.28084).toFixed(1);
      csv += `${p.distanceMeters},"${distFormatted}",${p.elevationMeters},${elevFt},${p.slopePercent},${p.lat.toFixed(6)},${p.lng.toFixed(6)}\n`;
    });

    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    downloadFile(csv, `${safeTitle}_elevation_profile.csv`, 'text/csv');
  };

  const activeHoverPoint = hoverIndex !== null && chartGeometry ? chartGeometry.coords[hoverIndex] : null;

  // Grade categorization
  const getSlopeBadge = (avgSlope: number) => {
    if (avgSlope < 3) return { label: 'Level / Flat (<3%)', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
    if (avgSlope < 8) return { label: 'Gently Rolling (3-8%)', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' };
    if (avgSlope < 15) return { label: 'Moderate Slope (8-15%)', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
    return { label: 'Steep / Mountainous (>15%)', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
  };

  const slopeBadge = profileData ? getSlopeBadge(profileData.avgSlopePercent) : null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg transition-all">
      {/* Header */}
      <div className="p-3 bg-slate-800/40 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30">
            <Mountain className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Terrain Elevation Profile</span>
              {profileData?.source === 'open-meteo' && (
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  DEM 90m
                </span>
              )}
            </h4>
            <div className="text-[10px] text-slate-400">
              Cross-section topography & slope analysis
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={loadProfile}
            disabled={isLoading}
            title="Refresh Elevation Profile"
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3 space-y-3">
          {/* Controls: Mode Selectors */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            {isPolygon ? (
              <div className="flex bg-slate-950/60 p-0.5 rounded-lg border border-slate-800 w-full sm:w-auto">
                <button
                  onClick={() => setProfileType('perimeter')}
                  className={`flex-1 sm:flex-none px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                    profileType === 'perimeter'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Perimeter Loop
                </button>
                <button
                  onClick={() => setProfileType('east_west')}
                  className={`flex-1 sm:flex-none px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                    profileType === 'east_west'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  W → E Transect
                </button>
                <button
                  onClick={() => setProfileType('north_south')}
                  className={`flex-1 sm:flex-none px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                    profileType === 'north_south'
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  S → N Transect
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400">Path Alignment</span>
                <button
                  onClick={() => setIsReversed(!isReversed)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-all ${
                    isReversed
                      ? 'bg-slate-800 text-cyan-300 border-cyan-500/50'
                      : 'bg-slate-800/40 text-slate-400 border-slate-700/60 hover:text-white'
                  }`}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>{isReversed ? 'End → Start' : 'Start → End'}</span>
                </button>
              </div>
            )}

            {/* Export CSV action */}
            {profileData && (
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 text-[11px] text-slate-300 hover:text-white border border-slate-700/80 transition-colors ml-auto"
                title="Download Elevation Data as CSV"
              >
                <Download className="w-3 h-3 text-cyan-400" />
                <span>CSV</span>
              </button>
            )}
          </div>

          {/* Loading or Error State */}
          {isLoading && (
            <div className="h-36 flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800/60">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <span className="text-xs font-mono">Sampling SRTM terrain elevations...</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Elevation Service Notice</div>
                <div className="text-[11px] text-rose-400/90 mt-0.5">{error}</div>
              </div>
            </div>
          )}

          {/* SVG Chart Area */}
          {!isLoading && profileData && chartGeometry && (
            <div className="relative">
              {/* Interactive SVG Chart */}
              <div className="bg-slate-950 rounded-xl p-1 border border-slate-800 relative overflow-hidden">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-auto select-none cursor-crosshair overflow-visible"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                  <defs>
                    {/* Topographic elevation fill gradient */}
                    <linearGradient id="elevationAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
                      <stop offset="60%" stopColor="#0284c7" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#0f172a" stopOpacity="0.02" />
                    </linearGradient>

                    {/* Glowing curve stroke */}
                    <linearGradient id="elevationLineGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="50%" stopColor="#22d3ee" />
                      <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>

                    {/* Filter for glowing cursor point */}
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Horizontal Grid lines */}
                  {[0, 0.5, 1].map((pct) => {
                    const y = padding.top + innerHeight * (1 - pct);
                    const elevVal = chartGeometry.yMin + chartGeometry.yRange * pct;
                    const formatted = formatElevationValue(elevVal, unitPreference);
                    return (
                      <g key={pct}>
                        <line
                          x1={padding.left}
                          y1={y}
                          x2={chartWidth - padding.right}
                          y2={y}
                          stroke="#334155"
                          strokeDasharray="2,3"
                          strokeWidth="0.8"
                        />
                        <text
                          x={padding.left - 5}
                          y={y + 3}
                          textAnchor="end"
                          fontSize="9"
                          fill="#94a3b8"
                          fontFamily="monospace"
                        >
                          {formatted.value}
                        </text>
                      </g>
                    );
                  })}

                  {/* Vertical Distance Grid lines */}
                  {[0, 0.5, 1].map((pct) => {
                    const x = padding.left + innerWidth * pct;
                    const distVal = chartGeometry.totalDist * pct;
                    const formattedDist = formatDistance(distVal, unitPreference);
                    return (
                      <g key={pct}>
                        <line
                          x1={x}
                          y1={padding.top}
                          x2={x}
                          y2={padding.top + innerHeight}
                          stroke="#1e293b"
                          strokeWidth="0.8"
                        />
                        <text
                          x={x}
                          y={padding.top + innerHeight + 14}
                          textAnchor={pct === 0 ? 'start' : pct === 1 ? 'end' : 'middle'}
                          fontSize="8.5"
                          fill="#64748b"
                          fontFamily="monospace"
                        >
                          {formattedDist}
                        </text>
                      </g>
                    );
                  })}

                  {/* Filled elevation area */}
                  <path d={chartGeometry.areaPathD} fill="url(#elevationAreaGrad)" />

                  {/* Main elevation line */}
                  <path
                    d={chartGeometry.linePathD}
                    fill="none"
                    stroke="url(#elevationLineGrad)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Active Hover Scrubber Line & Point */}
                  {activeHoverPoint && (
                    <g>
                      <line
                        x1={activeHoverPoint.x}
                        y1={padding.top}
                        x2={activeHoverPoint.x}
                        y2={padding.top + innerHeight}
                        stroke="#22d3ee"
                        strokeWidth="1.2"
                        strokeDasharray="3,2"
                      />
                      <circle
                        cx={activeHoverPoint.x}
                        cy={activeHoverPoint.y}
                        r="4.5"
                        fill="#06b6d4"
                        stroke="#ffffff"
                        strokeWidth="2"
                        filter="url(#glow)"
                      />
                    </g>
                  )}
                </svg>

                {/* Y-axis Unit Label */}
                <div className="absolute top-2 left-2 text-[8px] font-mono uppercase tracking-wider text-slate-400">
                  Elev ({unitPreference === 'imperial' ? 'ft' : 'm'})
                </div>

                {/* X-axis Unit Label */}
                <div className="absolute bottom-1 right-2 text-[8px] font-mono text-slate-500">
                  Distance →
                </div>
              </div>

              {/* Hover Tooltip Details Badge */}
              {activeHoverPoint && (
                <div className="mt-2 p-2 rounded-lg bg-slate-800/90 border border-cyan-500/40 flex items-center justify-between text-xs animate-in fade-in">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    <span className="font-mono text-slate-300">
                      Dist:{' '}
                      <strong className="text-white">
                        {formatDistance(activeHoverPoint.pt.distanceMeters, unitPreference)}
                      </strong>
                    </span>
                  </div>
                  <div className="font-mono text-cyan-300 font-bold">
                    ▲ {formatElevationValue(activeHoverPoint.pt.elevationMeters, unitPreference).full}
                  </div>
                  <div className="font-mono text-xs text-slate-300">
                    Grade: <strong className="text-emerald-400">{activeHoverPoint.pt.slopePercent}%</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Terrain & Slope Statistics Grid */}
          {profileData && (
            <div className="space-y-2 pt-1 border-t border-slate-800/80">
              {/* Slope Classification Badge */}
              {slopeBadge && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">Terrain Character:</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${slopeBadge.color}`}>
                    {slopeBadge.label}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {/* Min / Max Elevation */}
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 space-y-0.5">
                  <div className="text-[10px] text-slate-400 uppercase font-sans">Min / Max Elevation</div>
                  <div className="text-xs text-white font-bold flex items-center justify-between">
                    <span className="text-slate-300">
                      {formatElevationValue(profileData.minElevationMeters, unitPreference).full}
                    </span>
                    <span className="text-slate-500">→</span>
                    <span className="text-cyan-400">
                      {formatElevationValue(profileData.maxElevationMeters, unitPreference).full}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-400 font-sans">
                    Span: {formatElevationValue(profileData.maxElevationMeters - profileData.minElevationMeters, unitPreference).full}
                  </div>
                </div>

                {/* Ascent / Descent */}
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 space-y-0.5">
                  <div className="text-[10px] text-slate-400 uppercase font-sans">Total Gain / Loss</div>
                  <div className="text-xs text-white font-bold flex items-center justify-between">
                    <span className="text-emerald-400">
                      +{formatElevationValue(profileData.elevationGainMeters, unitPreference).value}
                    </span>
                    <span className="text-rose-400">
                      -{formatElevationValue(profileData.elevationLossMeters, unitPreference).value}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-400 font-sans">
                    Max Grade: <strong className="text-amber-300">{profileData.maxSlopePercent}%</strong>
                  </div>
                </div>
              </div>

              {/* Total Profile Distance */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span>Profile Transect Distance:</span>
                <span className="font-mono font-bold text-white">
                  {formatDistance(profileData.totalDistanceMeters, unitPreference)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
