import React from 'react';
import {
  MousePointer,
  Pentagon,
  Milestone,
  Ruler,
  Magnet,
  Undo2,
  Redo2,
  X,
  Check,
  Spline,
  RotateCcw,
} from 'lucide-react';
import { ToolMode, UnitSystem, GeoPoint } from '../types';
import { formatDistance, calculatePerimeter, calculateDistance } from '../utils/geoMath';

interface DrawingToolbarProps {
  toolMode: ToolMode;
  onSelectTool: (mode: ToolMode) => void;
  snappingEnabled: boolean;
  onToggleSnapping: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isDrawing: boolean;
  draftPoints: GeoPoint[];
  cursorCoords?: GeoPoint | null;
  unitPreference: UnitSystem;
  onFinishDrawing: () => void;
  onCancelDrawing: () => void;
}

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  toolMode,
  onSelectTool,
  snappingEnabled,
  onToggleSnapping,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isDrawing,
  draftPoints,
  cursorCoords,
  unitPreference,
  onFinishDrawing,
  onCancelDrawing,
}) => {
  const drawingPointCount = draftPoints.length;

  // Active points including cursor for live measuring
  const activeMeasurePoints = React.useMemo(() => {
    if (toolMode !== 'measure' || !isDrawing) return draftPoints;
    if (cursorCoords && draftPoints.length > 0) {
      return [...draftPoints, cursorCoords];
    }
    return draftPoints;
  }, [toolMode, isDrawing, draftPoints, cursorCoords]);

  // Compute live multi-segment distances
  const measureSegments = React.useMemo(() => {
    if (toolMode !== 'measure' || activeMeasurePoints.length < 2) return [];
    const segments: { index: number; distance: number; isLive: boolean }[] = [];
    for (let i = 0; i < activeMeasurePoints.length - 1; i++) {
      const p1 = activeMeasurePoints[i];
      const p2 = activeMeasurePoints[i + 1];
      const isLive = Boolean(cursorCoords && i === activeMeasurePoints.length - 2);
      segments.push({
        index: i + 1,
        distance: calculateDistance(p1, p2),
        isLive,
      });
    }
    return segments;
  }, [toolMode, activeMeasurePoints, cursorCoords]);

  // Compute live total measure distance
  const liveTotalDistance = React.useMemo(() => {
    if (toolMode !== 'measure' || activeMeasurePoints.length < 2) return null;
    return formatDistance(calculatePerimeter(activeMeasurePoints, false), unitPreference);
  }, [toolMode, activeMeasurePoints, unitPreference]);

  return (
    <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-auto">
      {/* Primary Tool Palette */}
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1.5 rounded-xl shadow-xl flex flex-col gap-1">
        <button
          onClick={() => onSelectTool('select')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative group ${
            toolMode === 'select'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
          title="Select & Edit Boundaries (V)"
        >
          <MousePointer className="w-5 h-5" />
          <span className="absolute left-12 px-2 py-1 bg-slate-900 text-slate-200 text-xs rounded border border-slate-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-lg">
            Select & Edit (V)
          </span>
        </button>

        <button
          onClick={() => onSelectTool('polygon')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative group ${
            toolMode === 'polygon'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
          title="Draw Land Parcel Outline (P)"
        >
          <Pentagon className="w-5 h-5" />
          <span className="absolute left-12 px-2 py-1 bg-slate-900 text-slate-200 text-xs rounded border border-slate-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-lg">
            Draw Land Parcel (P)
          </span>
        </button>

        <button
          onClick={() => onSelectTool('line')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative group ${
            toolMode === 'line'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
          title="Draw Fence Line or Access Road (L)"
        >
          <Spline className="w-5 h-5" />
          <span className="absolute left-12 px-2 py-1 bg-slate-900 text-slate-200 text-xs rounded border border-slate-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-lg">
            Draw Fence / Road (L)
          </span>
        </button>

        <button
          onClick={() => onSelectTool('marker')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative group ${
            toolMode === 'marker'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
          title="Place Survey Pin or Landmark (M)"
        >
          <Milestone className="w-5 h-5" />
          <span className="absolute left-12 px-2 py-1 bg-slate-900 text-slate-200 text-xs rounded border border-slate-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-lg">
            Survey Pin / Landmark (M)
          </span>
        </button>

        <button
          onClick={() => onSelectTool('measure')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative group ${
            toolMode === 'measure'
              ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
          title="Measure Distance Ruler (R)"
        >
          <Ruler className="w-5 h-5" />
          <span className="absolute left-12 px-2 py-1 bg-slate-900 text-slate-200 text-xs rounded border border-slate-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-lg">
            Measure Distance (R)
          </span>
        </button>

        <div className="h-px bg-slate-800 my-0.5" />

        {/* Snapping to Vertices */}
        <button
          onClick={onToggleSnapping}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative group ${
            snappingEnabled
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
              : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
          }`}
          title={`Snap to Corners / Vertices: ${snappingEnabled ? 'ON' : 'OFF'}`}
        >
          <Magnet className="w-4 h-4" />
          <span className="absolute left-12 px-2 py-1 bg-slate-900 text-slate-200 text-xs rounded border border-slate-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-lg">
            Snap to Vertices ({snappingEnabled ? 'ON' : 'OFF'})
          </span>
        </button>

        {/* Undo / Redo */}
        <div className="flex gap-1 pt-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`w-4.5 h-8 flex-1 rounded flex items-center justify-center transition-colors ${
              canUndo
                ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                : 'text-slate-700 cursor-not-allowed'
            }`}
            title={isDrawing ? 'Undo Last Vertex (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`w-4.5 h-8 flex-1 rounded flex items-center justify-center transition-colors ${
              canRedo
                ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                : 'text-slate-700 cursor-not-allowed'
            }`}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Floating Active Drawing / Measuring Action Box */}
      {isDrawing && (
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-3 rounded-xl shadow-2xl flex flex-col gap-2 min-w-[200px]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-400">
              {toolMode === 'polygon'
                ? 'Drawing Parcel'
                : toolMode === 'line'
                ? 'Drawing Fence / Road'
                : 'Measuring Distance'}
            </span>
            <span className="font-mono text-slate-400">{drawingPointCount} pts</span>
          </div>

          {/* If Measuring Distance, show live measurement and segment list */}
          {toolMode === 'measure' && (
            <div className="flex flex-col gap-2">
              <div className="bg-slate-950/80 border border-cyan-500/30 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Distance</div>
                <div className="text-base font-extrabold font-mono text-cyan-300">
                  {liveTotalDistance || 'Click points to measure'}
                </div>
              </div>

              {measureSegments.length > 0 && (
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-1.5 max-h-36 overflow-y-auto space-y-1">
                  <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold px-1 flex justify-between">
                    <span>Segment</span>
                    <span>Length</span>
                  </div>
                  {measureSegments.map((seg) => (
                    <div
                      key={seg.index}
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex items-center justify-between ${
                        seg.isLive
                          ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 animate-pulse font-bold'
                          : 'text-slate-300 bg-slate-900/50'
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        {seg.isLive && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>}
                        Seg #{seg.index}
                      </span>
                      <span>{formatDistance(seg.distance, unitPreference)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {toolMode === 'measure' ? (
              <>
                <button
                  onClick={onCancelDrawing}
                  className="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={onFinishDrawing}
                  className="flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-slate-950 transition-colors"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onFinishDrawing}
                  disabled={toolMode === 'polygon' ? drawingPointCount < 3 : drawingPointCount < 2}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                    (toolMode === 'polygon' ? drawingPointCount >= 3 : drawingPointCount >= 2)
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm'
                      : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Complete</span>
                </button>
                <button
                  onClick={onCancelDrawing}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                  title="Cancel Drawing (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          <div className="text-[10px] text-slate-400 leading-tight">
            {toolMode === 'polygon'
              ? 'Click map to add corners · Click start or double-click to close'
              : toolMode === 'line'
              ? 'Click map to trace points · Double-click to finish'
              : 'Click points on terrain to measure path'}
          </div>
        </div>
      )}
    </div>
  );
};
