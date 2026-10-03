import React, { useState } from 'react';
import { GeoPoint, ToolMode, UserLocation } from '../types';
import { formatCoordinates } from '../utils/geoMath';
import { Navigation, Info, Magnet, LocateFixed } from 'lucide-react';

interface StatusBarProps {
  cursorCoords: GeoPoint | null;
  zoomLevel: number;
  toolMode: ToolMode;
  snappingEnabled: boolean;
  parcelCount: number;
  isDrawing: boolean;
  draftPointCount: number;
  userLocation?: UserLocation | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  cursorCoords,
  zoomLevel,
  toolMode,
  snappingEnabled,
  parcelCount,
  isDrawing,
  draftPointCount,
  userLocation,
}) => {
  const [coordFormat, setCoordFormat] = useState<'decimal' | 'dms'>('decimal');

  const getToolGuidance = () => {
    if (isDrawing) {
      if (toolMode === 'polygon') {
        if (draftPointCount === 0) return 'Click anywhere on satellite imagery to place first boundary vertex.';
        if (draftPointCount < 3) return 'Click to add boundary vertices. Need at least 3 points for a land parcel.';
        return 'Click map to add points, or click the first vertex / double-click to close parcel.';
      }
      if (toolMode === 'line') {
        return 'Click map to trace linear boundary (fence, road). Real-time segment lengths displayed as you draw. Double-click to complete.';
      }
      if (toolMode === 'measure') {
        return 'Multi-Segment Ruler: Click points across terrain. Real-time segment lengths & live total distance update at cursor.';
      }
    }

    switch (toolMode) {
      case 'select':
        return 'Click parcel to inspect dimensions, drag corner vertices to modify boundaries, or click midpoints to add vertices.';
      case 'polygon':
        return 'Land Parcel Mode: Click map to trace perimeter layout outline.';
      case 'line':
        return 'Linear Boundary Mode: Click map to trace fences, roads, or easements with live segment distances.';
      case 'marker':
        return 'Survey Pin Mode: Click any location to drop a monument or landmark marker.';
      case 'measure':
        return 'Measurement Tool: Click points to measure multi-segment paths with live distance feedback.';
      default:
        return 'Ready.';
    }
  };

  return (
    <footer className="h-7 bg-slate-950 border-t border-slate-800/80 px-4 flex items-center justify-between text-[11px] text-slate-400 select-none z-30 shrink-0 font-mono">
      {/* Guidance info */}
      <div className="flex items-center gap-2 truncate pr-4">
        <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="truncate text-slate-300 font-sans">{getToolGuidance()}</span>
      </div>

      {/* Coordinate & Zoom metrics */}
      <div className="flex items-center gap-3 shrink-0">
        {snappingEnabled && (
          <span className="hidden sm:flex items-center gap-1 text-cyan-400">
            <Magnet className="w-3 h-3" />
            <span>SNAP ON</span>
          </span>
        )}

        {userLocation && (
          <>
            <span className="hidden lg:inline text-slate-600">|</span>
            <span className="hidden lg:flex items-center gap-1 text-cyan-400">
              <LocateFixed className="w-3 h-3" />
              <span>
                {userLocation.source === 'ip' ? 'IP LOC' : 'GPS'}: ±{Math.round(userLocation.accuracy)}m
              </span>
            </span>
          </>
        )}

        <span className="hidden md:inline text-slate-600">|</span>

        <span className="text-slate-400">
          Zoom: <strong className="text-slate-200">{zoomLevel}</strong>
        </span>

        <span className="text-slate-600">|</span>

        {/* Cursor Coordinates with toggle between Decimal and DMS */}
        <button
          onClick={() => setCoordFormat(coordFormat === 'decimal' ? 'dms' : 'decimal')}
          className="hover:text-cyan-300 transition-colors flex items-center gap-1 cursor-pointer"
          title="Click to toggle between Decimal Degrees and DMS"
        >
          <Navigation className="w-3 h-3 text-emerald-400" />
          <span className="text-slate-200">
            {cursorCoords
              ? formatCoordinates(cursorCoords, coordFormat)
              : 'Hover over satellite map'}
          </span>
        </button>
      </div>
    </footer>
  );
};
