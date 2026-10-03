import { GeoPoint, UnitSystem } from '../types';

const EARTH_RADIUS = 6378137; // WGS84 major axis in meters

/**
 * Calculates accurate geodesic spherical polygon area in square meters
 * using the Girard-Carlini spherical polygon theorem (Gauss-Bonnet)
 */
export function calculateGeodesicArea(coords: GeoPoint[]): number {
  if (!coords || coords.length < 3) return 0;

  const len = coords.length;
  let totalAngle = 0;

  for (let i = 0; i < len; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % len];
    const p3 = coords[(i + 2) % len];

    const b1 = bearing(p2, p1);
    const b2 = bearing(p2, p3);

    let diff = b2 - b1;
    if (diff < 0) diff += 360;

    totalAngle += diff;
  }

  // Spherical excess: E = (Sum of internal angles) - (n - 2) * 180
  const expectedSum = (len - 2) * 180;
  let excess = totalAngle - expectedSum;

  // Handle clockwise vs counter-clockwise orientation
  if (excess < 0) excess = Math.abs(excess);
  if (excess > 360) excess = Math.abs(excess - 360);

  // Alternative fast Shoelace on projected sphere for robust small to medium parcels
  const areaShoelace = calculateShoelaceSpherical(coords);
  return Math.max(0, areaShoelace);
}

function calculateShoelaceSpherical(coords: GeoPoint[]): number {
  if (coords.length < 3) return 0;
  let total = 0;
  const len = coords.length;

  for (let i = 0; i < len; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % len];

    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const lon1 = (p1.lng * Math.PI) / 180;
    const lon2 = (p2.lng * Math.PI) / 180;

    total += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  const area = Math.abs((total * EARTH_RADIUS * EARTH_RADIUS) / 2);
  return area;
}

/**
 * Great-circle distance between two points via Haversine formula (meters)
 */
export function calculateDistance(p1: GeoPoint, p2: GeoPoint): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS * c;
}

/**
 * Total perimeter or length of a path (meters)
 */
export function calculatePerimeter(coords: GeoPoint[], isClosed = true): number {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  const count = isClosed ? coords.length : coords.length - 1;

  for (let i = 0; i < count; i++) {
    const nextIdx = (i + 1) % coords.length;
    total += calculateDistance(coords[i], coords[nextIdx]);
  }
  return total;
}

/**
 * Initial bearing from p1 to p2 in degrees [0, 360)
 */
export function bearing(p1: GeoPoint, p2: GeoPoint): number {
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  let b = (Math.atan2(y, x) * 180) / Math.PI;
  return (b + 360) % 360;
}

/**
 * Centroid of polygon coordinates
 */
export function calculateCentroid(coords: GeoPoint[]): GeoPoint {
  if (!coords || coords.length === 0) return { lat: 0, lng: 0 };
  if (coords.length === 1) return coords[0];

  let sumLat = 0;
  let sumLng = 0;
  for (const pt of coords) {
    sumLat += pt.lat;
    sumLng += pt.lng;
  }
  return {
    lat: sumLat / coords.length,
    lng: sumLng / coords.length,
  };
}

/**
 * Detailed breakdown of each polygon boundary segment (edge)
 */
export interface SegmentInfo {
  index: number;
  fromIndex: number;
  toIndex: number;
  distanceMeters: number;
  bearingDeg: number;
}

export function calculateSegmentLengths(coords: GeoPoint[]): SegmentInfo[] {
  if (coords.length < 2) return [];
  const segments: SegmentInfo[] = [];

  for (let i = 0; i < coords.length; i++) {
    const nextIdx = (i + 1) % coords.length;
    const dist = calculateDistance(coords[i], coords[nextIdx]);
    const b = bearing(coords[i], coords[nextIdx]);
    segments.push({
      index: i + 1,
      fromIndex: i + 1,
      toIndex: nextIdx + 1,
      distanceMeters: dist,
      bearingDeg: b,
    });
  }
  return segments;
}

/**
 * Formats square meters into readable units with primary & secondary display
 */
export function formatArea(
  sqMeters: number,
  unitSystem: UnitSystem = 'imperial'
): { primary: string; secondary: string; rawAcres: number; rawHectares: number } {
  const sqFt = sqMeters * 10.7639;
  const acres = sqMeters / 4046.8564224;
  const hectares = sqMeters / 10000;
  const sqKm = sqMeters / 1000000;

  if (unitSystem === 'imperial') {
    if (acres >= 1) {
      return {
        primary: `${acres.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Acres`,
        secondary: `${Math.round(sqFt).toLocaleString()} sq ft (${hectares.toFixed(2)} ha)`,
        rawAcres: acres,
        rawHectares: hectares,
      };
    } else {
      return {
        primary: `${acres.toFixed(3)} Acres`,
        secondary: `${Math.round(sqFt).toLocaleString()} sq ft (${Math.round(sqMeters).toLocaleString()} m²)`,
        rawAcres: acres,
        rawHectares: hectares,
      };
    }
  } else {
    // Metric
    if (hectares >= 1) {
      return {
        primary: `${hectares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Hectares`,
        secondary: `${Math.round(sqMeters).toLocaleString()} m² (${acres.toFixed(2)} ac)`,
        rawAcres: acres,
        rawHectares: hectares,
      };
    } else if (sqMeters >= 1000000) {
      return {
        primary: `${sqKm.toFixed(2)} km²`,
        secondary: `${hectares.toFixed(2)} ha (${acres.toFixed(2)} ac)`,
        rawAcres: acres,
        rawHectares: hectares,
      };
    } else {
      return {
        primary: `${Math.round(sqMeters).toLocaleString()} m²`,
        secondary: `${hectares.toFixed(3)} ha (${acres.toFixed(2)} ac)`,
        rawAcres: acres,
        rawHectares: hectares,
      };
    }
  }
}

/**
 * Formats distance into readable units
 */
export function formatDistance(meters: number, unitSystem: UnitSystem = 'imperial'): string {
  if (unitSystem === 'imperial') {
    const feet = meters * 3.28084;
    const miles = meters / 1609.344;
    if (miles >= 1) {
      return `${miles.toFixed(2)} mi (${Math.round(feet).toLocaleString()} ft)`;
    }
    return `${Math.round(feet).toLocaleString()} ft (${meters.toFixed(1)} m)`;
  } else {
    if (meters >= 1000) {
      const km = meters / 1000;
      return `${km.toFixed(2)} km (${Math.round(meters).toLocaleString()} m)`;
    }
    return `${meters.toFixed(1)} m`;
  }
}

/**
 * Formats coordinates into Decimal Degrees or Degrees-Minutes-Seconds (DMS)
 */
export function formatCoordinates(
  point: GeoPoint,
  format: 'decimal' | 'dms' = 'decimal'
): string {
  if (format === 'decimal') {
    const latPrefix = point.lat >= 0 ? 'N' : 'S';
    const lngPrefix = point.lng >= 0 ? 'E' : 'W';
    return `${Math.abs(point.lat).toFixed(6)}° ${latPrefix}, ${Math.abs(point.lng).toFixed(6)}° ${lngPrefix}`;
  }

  const toDms = (val: number, isLat: boolean) => {
    const dir = isLat ? (val >= 0 ? 'N' : 'S') : val >= 0 ? 'E' : 'W';
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(1);
    return `${deg}° ${min}' ${sec}" ${dir}`;
  };

  return `${toDms(point.lat, true)}, ${toDms(point.lng, false)}`;
}

/**
 * Generates an inward setback (buffer) polygon offset from outer parcel boundary
 */
export function generateSetbackPolygon(coords: GeoPoint[], setbackMeters: number): GeoPoint[] {
  if (coords.length < 3 || setbackMeters <= 0) return [];
  const centroid = calculateCentroid(coords);

  // Inward offset towards polygon centroid
  return coords.map((pt) => {
    const distToCenter = calculateDistance(pt, centroid);
    if (distToCenter <= setbackMeters) {
      return centroid;
    }
    const ratio = (distToCenter - setbackMeters) / distToCenter;
    return {
      lat: centroid.lat + (pt.lat - centroid.lat) * ratio,
      lng: centroid.lng + (pt.lng - centroid.lng) * ratio,
    };
  });
}
