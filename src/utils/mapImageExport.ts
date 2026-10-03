import { LandProject, LandParcel, LandLine, LandMarker, GeoPoint, UnitSystem, CATEGORY_PRESETS } from '../types';
import { calculateCentroid, formatArea, formatDistance } from './geoMath';
import type { Map as LeafletMap } from 'leaflet';

export interface MapExportOptions {
  project: LandProject;
  leafletMap: LeafletMap;
  title?: string;
  subtitle?: string;
  includeLegend?: boolean;
  includeScale?: boolean;
  includeNorthArrow?: boolean;
  includeMetadataTable?: boolean;
  format: 'png' | 'jpeg';
  quality?: number; // 0.1 - 1.0
  resolutionScale?: number; // 1 or 2 (2 for high-DPI retina export)
}

/**
 * Creates and downloads a high-resolution cartographic map sheet file (PNG or JPEG)
 */
export async function exportMapImage(options: MapExportOptions): Promise<string> {
  const {
    project,
    leafletMap,
    title = project.name,
    subtitle = project.locationName || 'Satellite Land Survey & Layout',
    includeLegend = true,
    includeScale = true,
    includeNorthArrow = true,
    includeMetadataTable = true,
    format = 'png',
    quality = 0.95,
    resolutionScale = 2,
  } = options;

  const mapSize = leafletMap.getSize();
  const width = mapSize.x * resolutionScale;
  const height = mapSize.y * resolutionScale;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // High quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Fill dark background first
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, width, height);

  // 1. Draw satellite map tiles from current Leaflet view
  const mapContainer = leafletMap.getContainer();
  const tileImages = Array.from(mapContainer.querySelectorAll<HTMLImageElement>('.leaflet-tile-loaded'));
  const mapRect = mapContainer.getBoundingClientRect();

  for (const img of tileImages) {
    try {
      if (img.complete && img.naturalWidth > 0) {
        const imgRect = img.getBoundingClientRect();
        const dx = (imgRect.left - mapRect.left) * resolutionScale;
        const dy = (imgRect.top - mapRect.top) * resolutionScale;
        const dWidth = imgRect.width * resolutionScale;
        const dHeight = imgRect.height * resolutionScale;

        // Try to draw tile; if tainted by CORS, skip quietly and use vector fallback
        ctx.drawImage(img, dx, dy, dWidth, dHeight);
      }
    } catch {
      // Tile may be CORS restricted, skip image tile
    }
  }

  // 2. Helper to project GeoPoint to Canvas pixel
  const projectPoint = (geo: GeoPoint) => {
    const pt = leafletMap.latLngToContainerPoint([geo.lat, geo.lng]);
    return {
      x: pt.x * resolutionScale,
      y: pt.y * resolutionScale,
    };
  };

  // 3. Draw Parcels (Polygons)
  project.parcels.forEach((parcel) => {
    if (parcel.coordinates.length < 3) return;

    ctx.save();
    ctx.beginPath();
    const first = projectPoint(parcel.coordinates[0]);
    ctx.moveTo(first.x, first.y);

    for (let i = 1; i < parcel.coordinates.length; i++) {
      const p = projectPoint(parcel.coordinates[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();

    // Fill
    ctx.fillStyle = hexToRgba(parcel.color, parcel.fillOpacity || 0.35);
    ctx.fill();

    // Border
    ctx.strokeStyle = parcel.strokeColor || parcel.color;
    ctx.lineWidth = (parcel.strokeWidth || 2) * resolutionScale;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw vertex handles
    ctx.fillStyle = '#ffffff';
    parcel.coordinates.forEach((coord) => {
      const p = projectPoint(coord);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 * resolutionScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = parcel.color;
      ctx.lineWidth = 1.5 * resolutionScale;
      ctx.stroke();
    });

    // Centroid Label Stamp
    const centroid = calculateCentroid(parcel.coordinates);
    const centerPx = projectPoint(centroid);
    const areaInfo = formatArea(parcel.areaSqMeters, project.unitPreference);

    // Label card background
    const labelText = parcel.name;
    const subText = areaInfo.primary;

    ctx.font = `bold ${12 * resolutionScale}px 'Plus Jakarta Sans', sans-serif`;
    const labelWidth = Math.max(ctx.measureText(labelText).width, ctx.measureText(subText).width) + 20 * resolutionScale;
    const boxHeight = 36 * resolutionScale;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = parcel.color;
    ctx.lineWidth = 1.5 * resolutionScale;
    roundRect(ctx, centerPx.x - labelWidth / 2, centerPx.y - boxHeight / 2, labelWidth, boxHeight, 6 * resolutionScale);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, centerPx.x, centerPx.y - 7 * resolutionScale);

    ctx.font = `600 ${10 * resolutionScale}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(subText, centerPx.x, centerPx.y + 8 * resolutionScale);

    ctx.restore();
  });

  // 4. Draw Lines (Fences, Roads, Easements)
  project.lines.forEach((line) => {
    if (line.coordinates.length < 2) return;

    ctx.save();
    ctx.beginPath();
    const first = projectPoint(line.coordinates[0]);
    ctx.moveTo(first.x, first.y);

    for (let i = 1; i < line.coordinates.length; i++) {
      const p = projectPoint(line.coordinates[i]);
      ctx.lineTo(p.x, p.y);
    }

    if (line.dashArray) {
      ctx.setLineDash([8 * resolutionScale, 6 * resolutionScale]);
    }

    ctx.strokeStyle = line.color;
    ctx.lineWidth = (line.strokeWidth || 3) * resolutionScale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  });

  // 5. Draw Markers
  project.markers.forEach((m) => {
    const p = projectPoint(m.point);
    ctx.save();

    // Pin circle
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7 * resolutionScale, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * resolutionScale;
    ctx.stroke();

    // Small label tag
    ctx.font = `500 ${10 * resolutionScale}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    const textWidth = ctx.measureText(m.name).width + 12 * resolutionScale;
    roundRect(ctx, p.x + 10 * resolutionScale, p.y - 12 * resolutionScale, textWidth, 20 * resolutionScale, 4 * resolutionScale);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.name, p.x + 16 * resolutionScale, p.y - 2 * resolutionScale);

    ctx.restore();
  });

  // 6. Cartographic Header & Metadata Stamp (Top Left)
  if (includeMetadataTable) {
    ctx.save();
    const headerWidth = 340 * resolutionScale;
    const headerHeight = 110 * resolutionScale;
    const pad = 16 * resolutionScale;

    // Header panel
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 * resolutionScale;
    roundRect(ctx, pad, pad, headerWidth, headerHeight, 8 * resolutionScale);
    ctx.fill();
    ctx.stroke();

    // Title
    ctx.font = `bold ${15 * resolutionScale}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, pad + 16 * resolutionScale, pad + 14 * resolutionScale);

    // Subtitle / Location
    ctx.font = `500 ${11 * resolutionScale}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(subtitle, pad + 16 * resolutionScale, pad + 38 * resolutionScale);

    // Divider line
    ctx.beginPath();
    ctx.moveTo(pad + 16 * resolutionScale, pad + 60 * resolutionScale);
    ctx.lineTo(pad + headerWidth - 16 * resolutionScale, pad + 60 * resolutionScale);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    // Stats row
    const totalAreaM2 = project.parcels.reduce((acc, p) => acc + p.areaSqMeters, 0);
    const totalAreaInfo = formatArea(totalAreaM2, project.unitPreference);

    ctx.font = `600 ${11 * resolutionScale}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`Total Area: ${totalAreaInfo.primary}`, pad + 16 * resolutionScale, pad + 72 * resolutionScale);

    ctx.font = `500 ${10 * resolutionScale}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      `${project.parcels.length} Parcels · ${project.lines.length} Boundaries · WGS84`,
      pad + 16 * resolutionScale,
      pad + 90 * resolutionScale
    );

    ctx.restore();
  }

  // 7. North Arrow (Top Right)
  if (includeNorthArrow) {
    ctx.save();
    const arrowX = width - 48 * resolutionScale;
    const arrowY = 56 * resolutionScale;
    const arrowRadius = 24 * resolutionScale;

    // Compass circle background
    ctx.beginPath();
    ctx.arc(arrowX, arrowY, arrowRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1 * resolutionScale;
    ctx.fill();
    ctx.stroke();

    // North needle (Dark & Light half)
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY - 18 * resolutionScale);
    ctx.lineTo(arrowX - 6 * resolutionScale, arrowY + 12 * resolutionScale);
    ctx.lineTo(arrowX, arrowY + 6 * resolutionScale);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY - 18 * resolutionScale);
    ctx.lineTo(arrowX + 6 * resolutionScale, arrowY + 12 * resolutionScale);
    ctx.lineTo(arrowX, arrowY + 6 * resolutionScale);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // "N" letter
    ctx.font = `bold ${10 * resolutionScale}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', arrowX, arrowY - 19 * resolutionScale);

    ctx.restore();
  }

  // 8. Scale Bar (Bottom Left)
  if (includeScale) {
    ctx.save();
    const scaleX = 24 * resolutionScale;
    const scaleY = height - 40 * resolutionScale;
    const scaleBarLengthPx = 140 * resolutionScale;

    // Approximate real world distance for scaleBarLengthPx
    const centerLatLng = leafletMap.getCenter();
    const p1 = leafletMap.latLngToContainerPoint(centerLatLng);
    const p2 = leafletMap.containerPointToLatLng([p1.x + scaleBarLengthPx / resolutionScale, p1.y]);
    const distMeters = centerLatLng.distanceTo(p2);

    const scaleText = formatDistance(distMeters, project.unitPreference);

    // Scale panel background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 * resolutionScale;
    roundRect(ctx, scaleX - 8 * resolutionScale, scaleY - 26 * resolutionScale, scaleBarLengthPx + 16 * resolutionScale, 38 * resolutionScale, 6 * resolutionScale);
    ctx.fill();
    ctx.stroke();

    // Scale bar line
    ctx.beginPath();
    ctx.moveTo(scaleX, scaleY);
    ctx.lineTo(scaleX + scaleBarLengthPx, scaleY);
    ctx.moveTo(scaleX, scaleY - 4 * resolutionScale);
    ctx.lineTo(scaleX, scaleY + 4 * resolutionScale);
    ctx.moveTo(scaleX + scaleBarLengthPx, scaleY - 4 * resolutionScale);
    ctx.lineTo(scaleX + scaleBarLengthPx, scaleY + 4 * resolutionScale);
    ctx.moveTo(scaleX + scaleBarLengthPx / 2, scaleY - 3 * resolutionScale);
    ctx.lineTo(scaleX + scaleBarLengthPx / 2, scaleY + 3 * resolutionScale);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * resolutionScale;
    ctx.stroke();

    // Scale text
    ctx.font = `600 ${9 * resolutionScale}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(scaleText, scaleX + scaleBarLengthPx / 2, scaleY - 6 * resolutionScale);

    ctx.restore();
  }

  // 9. Zone Legend (Bottom Right)
  if (includeLegend && project.parcels.length > 0) {
    ctx.save();
    // Unique categories in project
    const categoriesUsed = Array.from(new Set(project.parcels.map((p) => p.category)));
    const legendWidth = 200 * resolutionScale;
    const rowHeight = 20 * resolutionScale;
    const legendHeight = (categoriesUsed.length * rowHeight + 36 * resolutionScale);
    const legendX = width - legendWidth - 24 * resolutionScale;
    const legendY = height - legendHeight - 24 * resolutionScale;

    // Legend panel
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 * resolutionScale;
    roundRect(ctx, legendX, legendY, legendWidth, legendHeight, 8 * resolutionScale);
    ctx.fill();
    ctx.stroke();

    // Legend Header
    ctx.font = `bold ${10 * resolutionScale}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('LAND LAYOUT LEGEND', legendX + 14 * resolutionScale, legendY + 10 * resolutionScale);

    // Legend rows
    categoriesUsed.forEach((catKey, idx) => {
      const preset = CATEGORY_PRESETS[catKey] || CATEGORY_PRESETS.custom;
      const y = legendY + 28 * resolutionScale + idx * rowHeight;

      // Color swatch
      ctx.fillStyle = preset.defaultColor;
      ctx.strokeStyle = preset.defaultStroke;
      ctx.lineWidth = 1 * resolutionScale;
      roundRect(ctx, legendX + 14 * resolutionScale, y + 2 * resolutionScale, 12 * resolutionScale, 12 * resolutionScale, 2 * resolutionScale);
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.font = `500 ${10 * resolutionScale}px 'Plus Jakarta Sans', sans-serif`;
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(preset.label, legendX + 34 * resolutionScale, y + 2 * resolutionScale);
    });

    ctx.restore();
  }

  // Export to Data URL and return
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = canvas.toDataURL(mimeType, quality);
  return dataUrl;
}

// Utility: Convert Hex to RGBA
function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  if (c.length === 6) {
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(56, 189, 248, ${alpha})`;
}

// Utility: Canvas rounded rectangle helper
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
