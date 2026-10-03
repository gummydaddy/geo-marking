import React, { useState, useEffect } from 'react';
import {
  LandProject,
} from '../types';
import { exportMapImage } from '../utils/mapImageExport';
import { exportToGeoJSON, exportToKML, downloadFile } from '../utils/exportImport';
import {
  Download,
  Image as ImageIcon,
  FileCode,
  Globe,
  Printer,
  X,
  Check,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { Map as LeafletMap } from 'leaflet';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: LandProject;
  leafletMap: LeafletMap | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project,
  leafletMap,
}) => {
  const [activeTab, setActiveTab] = useState<'image' | 'gis' | 'print'>('image');
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [resolutionScale, setResolutionScale] = useState<number>(2);
  const [includeLegend, setIncludeLegend] = useState(true);
  const [includeScale, setIncludeScale] = useState(true);
  const [includeNorthArrow, setIncludeNorthArrow] = useState(true);
  const [includeMetadataTable, setIncludeMetadataTable] = useState(true);
  const [customTitle, setCustomTitle] = useState(project.name);
  const [customSubtitle, setCustomSubtitle] = useState(project.locationName || 'Satellite Land Survey Map');

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Generate preview when modal opens or options change
  useEffect(() => {
    if (!isOpen || !leafletMap) return;

    let isMounted = true;
    setIsGenerating(true);

    exportMapImage({
      project,
      leafletMap,
      title: customTitle,
      subtitle: customSubtitle,
      includeLegend,
      includeScale,
      includeNorthArrow,
      includeMetadataTable,
      format: 'png',
      resolutionScale: 1, // 1x for preview speed
    })
      .then((url) => {
        if (isMounted) {
          setPreviewUrl(url);
          setIsGenerating(false);
        }
      })
      .catch((err) => {
        console.error('Error generating map preview:', err);
        if (isMounted) setIsGenerating(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    isOpen,
    project,
    leafletMap,
    customTitle,
    customSubtitle,
    includeLegend,
    includeScale,
    includeNorthArrow,
    includeMetadataTable,
  ]);

  if (!isOpen) return null;

  const handleDownloadImage = async () => {
    if (!leafletMap) return;
    setIsGenerating(true);
    try {
      const dataUrl = await exportMapImage({
        project,
        leafletMap,
        title: customTitle,
        subtitle: customSubtitle,
        includeLegend,
        includeScale,
        includeNorthArrow,
        includeMetadataTable,
        format,
        resolutionScale,
      });

      const cleanName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const filename = `${cleanName}_satellite_map.${format}`;

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadGeoJSON = () => {
    const geojson = exportToGeoJSON(project);
    const cleanName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    downloadFile(geojson, `${cleanName}_layout.geojson`, 'application/geo+json');
  };

  const handleDownloadKML = () => {
    const kml = exportToKML(project);
    const cleanName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    downloadFile(kml, `${cleanName}_google_earth.kml`, 'application/vnd.google-earth.kml+xml');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Save Map File & Export</h2>
              <p className="text-xs text-slate-400">
                Download cartographic satellite map images, GIS datasets, or KML boundaries
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 gap-2">
          <button
            onClick={() => setActiveTab('image')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'image'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Map Sheet Image (PNG / JPEG)</span>
          </button>

          <button
            onClick={() => setActiveTab('gis')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'gis'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>GIS Formats (GeoJSON & KML)</span>
          </button>

          <button
            onClick={() => setActiveTab('print')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'print'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>Print Survey Sheet</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'image' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Preview Window */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold uppercase tracking-wider text-slate-400">Map Sheet Preview</span>
                  {isGenerating && (
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Rendering...</span>
                    </span>
                  )}
                </div>

                <div className="aspect-[4/3] bg-slate-950 border border-slate-800 rounded-xl overflow-hidden relative flex items-center justify-center shadow-inner">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Map sheet preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Compositing satellite map sheet...</span>
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 leading-relaxed">
                  Generated map file includes satellite imagery background, marked parcel boundaries, zone legend, North arrow, graphic scale bar, and project summary box.
                </div>
              </div>

              {/* Options & Controls */}
              <div className="space-y-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Map Title</label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Location / Subtitle</label>
                  <input
                    type="text"
                    value={customSubtitle}
                    onChange={(e) => setCustomSubtitle(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Image Format</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFormat('png')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                          format === 'png'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        PNG (Crisp)
                      </button>
                      <button
                        onClick={() => setFormat('jpeg')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                          format === 'jpeg'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        JPEG
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Export DPI</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setResolutionScale(1)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                          resolutionScale === 1
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        1x Web
                      </button>
                      <button
                        onClick={() => setResolutionScale(2)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                          resolutionScale === 2
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        2x Ultra HD
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Cartographic Stamp Elements
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeLegend}
                        onChange={(e) => setIncludeLegend(e.target.checked)}
                        className="accent-emerald-500 rounded"
                      />
                      <span>Land Zone Legend</span>
                    </label>

                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeScale}
                        onChange={(e) => setIncludeScale(e.target.checked)}
                        className="accent-emerald-500 rounded"
                      />
                      <span>Graphic Scale Bar</span>
                    </label>

                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeNorthArrow}
                        onChange={(e) => setIncludeNorthArrow(e.target.checked)}
                        className="accent-emerald-500 rounded"
                      />
                      <span>North Arrow</span>
                    </label>

                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeMetadataTable}
                        onChange={(e) => setIncludeMetadataTable(e.target.checked)}
                        className="accent-emerald-500 rounded"
                      />
                      <span>Title & Area Stamp</span>
                    </label>
                  </div>
                </div>

                {/* Download Button */}
                <div className="pt-2">
                  <button
                    onClick={handleDownloadImage}
                    disabled={isGenerating}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    {downloadSuccess ? (
                      <>
                        <Check className="w-4 h-4 text-slate-950" />
                        <span>Map File Saved!</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>Download Map File ({format.toUpperCase()})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gis' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <FileCode className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">GeoJSON FeatureCollection</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Open standard GIS format containing all polygon vertices, perimeter dimensions, land zoning attributes, and linear boundaries. Fully compatible with QGIS, ArcGIS, Mapbox, and AutoCAD Civil 3D.
                </p>
                <button
                  onClick={handleDownloadGeoJSON}
                  className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition-colors"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Download .geojson</span>
                </button>
              </div>

              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Globe className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">Google Earth KML</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Keyhole Markup Language formatted specifically for Google Earth Pro and Google Earth Web. Includes 3D polygon extrusions, fill colors, and parcel survey descriptions.
                </p>
                <button
                  onClick={handleDownloadKML}
                  className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700 transition-colors"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span>Download .kml</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'print' && (
            <div className="text-center max-w-md mx-auto py-6 space-y-4">
              <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 mx-auto">
                <Printer className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Print Survey Sheet</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Format the current land marking layout and dimensional tables for physical presentation or PDF printout.
                </p>
              </div>
              <button
                onClick={handlePrint}
                className="py-2.5 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>Open Print Dialog</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
