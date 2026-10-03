import { LandParcel, SolarPanelConfig, SolarCapacityResult, GeoPoint } from '../types';
import { calculateCentroid } from './geoMath';

export const DEFAULT_SOLAR_CONFIG: SolarPanelConfig = {
  mountType: 'single_axis_tracker',
  azimuthDeg: 180, // True South
  tiltDeg: 25,
  groundCoverRatio: 0.65, // 65% land coverage (35% spacing for row aisles & maintenance)
  panelWattage: 550, // 550W high-efficiency commercial bifacial module
  panelEfficiency: 0.215, // 21.5%
  electricityRatePerKwh: 0.09, // $0.09 / kWh
};

/**
 * Estimates baseline Daily Peak Sun Hours (kWh/m²/day) based on geographic latitude
 */
export function estimatePeakSunHours(lat: number): number {
  const absLat = Math.abs(lat);
  if (absLat < 20) return 5.8;
  if (absLat < 30) return 5.6;
  if (absLat < 36) return 5.4; // e.g. Mojave / SoCal / Texas
  if (absLat < 42) return 4.9; // e.g. Northern CA, Spain, Central US
  if (absLat < 50) return 4.1; // Northern Europe / Pacific Northwest
  return 3.5;
}

/**
 * Calculates orientation efficiency factor based on tilt, azimuth, and tracking type
 */
export function calculateOrientationFactor(
  config: SolarPanelConfig,
  lat: number
): { factor: number; details: string } {
  if (config.mountType === 'dual_axis') {
    return { factor: 1.35, details: '+35% Dual-Axis Solar Tracking' };
  }
  if (config.mountType === 'single_axis_tracker') {
    return { factor: 1.22, details: '+22% Single-Axis Horiz. Tracker' };
  }

  // Fixed tilt model
  const isNorthernHemisphere = lat >= 0;
  const optimalAzimuth = isNorthernHemisphere ? 180 : 0;
  const azimuthDeviation = Math.abs(config.azimuthDeg - optimalAzimuth);
  const azimuthNormalized = Math.min(azimuthDeviation, 360 - azimuthDeviation);

  // Azimuth factor (1.0 at true South, down to 0.75 for East/West)
  const azimuthFactor = Math.max(0.72, Math.cos((azimuthNormalized * Math.PI) / 180 * 0.7));

  // Optimal tilt is roughly latitude * 0.87
  const optimalTilt = Math.max(10, Math.min(45, Math.abs(lat) * 0.87));
  const tiltDeviation = Math.abs(config.tiltDeg - optimalTilt);
  const tiltFactor = Math.max(0.85, 1 - (tiltDeviation / 90) * 0.25);

  const factor = azimuthFactor * tiltFactor;
  return {
    factor,
    details: `${Math.round(factor * 100)}% of optimal orientation`,
  };
}

/**
 * Calculates solar photovoltaic generation capacity and financial/ecological benefits
 */
export function calculateSolarCapacity(
  parcel: LandParcel,
  config: SolarPanelConfig = DEFAULT_SOLAR_CONFIG,
  centerLat = 37.0
): SolarCapacityResult {
  const totalAreaM2 = parcel.areaSqMeters || 0;
  // Exclude setback border if present
  const setbackDeduction = parcel.setbackMeters && parcel.setbackMeters > 0 ? 0.08 : 0;
  const netUsableFactor = Math.max(0.2, (1 - setbackDeduction) * config.groundCoverRatio);
  const usableAreaSqMeters = totalAreaM2 * netUsableFactor;
  const usableAreaAcres = usableAreaSqMeters / 4046.856;

  // Modern 550W utility module dimensions: ~2.28m x 1.13m = ~2.58 m² per panel
  const panelFootprintM2 = 2.58;
  const estimatedPanelCount = Math.floor(usableAreaSqMeters / panelFootprintM2);

  // Total Installed DC Capacity
  const dcCapacityWatts = estimatedPanelCount * config.panelWattage;
  const dcCapacityKw = dcCapacityWatts / 1000;
  const dcCapacityMw = dcCapacityKw / 1000;

  // Insolation and orientation
  const baseSunHours = estimatePeakSunHours(centerLat);
  const { factor: orientationFactor } = calculateOrientationFactor(config, centerLat);
  const effectiveSunHours = baseSunHours * orientationFactor;

  // System Performance Ratio (PR) accounts for inverter clipping, wiring losses, thermal derate (~0.81)
  const performanceRatio = 0.81;

  // Annual energy yield in Megawatt-hours (MWh)
  const annualGenerationKwh = dcCapacityKw * effectiveSunHours * 365 * performanceRatio;
  const annualGenerationMwh = annualGenerationKwh / 1000;

  // Environmental and community impact
  // Average household consumes ~10,500 kWh/year (10.5 MWh)
  const homesPoweredAnnually = Math.round(annualGenerationMwh / 10.5);

  // EPA average: ~0.385 metric tons CO2 offset per MWh clean solar generation
  const co2OffsetMetricTonsYear = Math.round(annualGenerationMwh * 0.385);

  // Financial value
  const estimatedAnnualRevenue = Math.round(annualGenerationKwh * config.electricityRatePerKwh);

  return {
    usableAreaSqMeters,
    usableAreaAcres,
    dcCapacityKw,
    dcCapacityMw,
    annualGenerationMwh,
    estimatedPanelCount,
    homesPoweredAnnually,
    co2OffsetMetricTonsYear,
    estimatedAnnualRevenue,
    peakSunHoursPerDay: effectiveSunHours,
    orientationFactor,
  };
}

/**
 * Generates parallel PV module rack row lines inside a parcel polygon,
 * oriented according to the chosen solar azimuth.
 */
export function generateSolarArrayRows(
  coords: GeoPoint[],
  azimuthDeg: number,
  spacingMeters = 7
): Array<{ p1: GeoPoint; p2: GeoPoint }> {
  if (coords.length < 3) return [];

  // Find bounding box
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  coords.forEach((pt) => {
    minLat = Math.min(minLat, pt.lat);
    maxLat = Math.max(maxLat, pt.lat);
    minLng = Math.min(minLng, pt.lng);
    maxLng = Math.max(maxLng, pt.lng);
  });

  const center = calculateCentroid(coords);
  // Row angle is perpendicular to azimuth (e.g. South facing 180° has East-West rows 90°-270°)
  const rowAngleRad = ((azimuthDeg + 90) * Math.PI) / 180;
  const dirX = Math.cos(rowAngleRad);
  const dirY = Math.sin(rowAngleRad);

  // Normal step direction
  const normX = -Math.sin(rowAngleRad);
  const normY = Math.cos(rowAngleRad);

  // Meter to lat/lng degrees conversion approx
  const latStepPerMeter = 1 / 111320;
  const lngStepPerMeter = 1 / (111320 * Math.cos((center.lat * Math.PI) / 180));

  const latSpanMeters = (maxLat - minLat) * 111320;
  const lngSpanMeters = (maxLng - minLng) * (111320 * Math.cos((center.lat * Math.PI) / 180));
  const diagonalMeters = Math.sqrt(latSpanMeters * latSpanMeters + lngSpanMeters * lngSpanMeters);

  const numRows = Math.min(60, Math.floor(diagonalMeters / spacingMeters));
  const rows: Array<{ p1: GeoPoint; p2: GeoPoint }> = [];

  // Helper: point in polygon check (ray casting)
  const isInside = (pt: GeoPoint) => {
    let inside = false;
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      const xi = coords[i].lng,
        yi = coords[i].lat;
      const xj = coords[j].lng,
        yj = coords[j].lat;
      const intersect = yi > pt.lat !== yj > pt.lat && pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Generate clipped row segments
  for (let r = -numRows / 2; r <= numRows / 2; r++) {
    const offsetMeters = r * spacingMeters;
    const rowCenterLat = center.lat + offsetMeters * normY * latStepPerMeter;
    const rowCenterLng = center.lng + offsetMeters * normX * lngStepPerMeter;

    const halfLength = diagonalMeters * 0.6;
    const sampleSteps = 24;
    let segStart: GeoPoint | null = null;

    for (let s = -sampleSteps; s <= sampleSteps; s++) {
      const stepDist = (s / sampleSteps) * halfLength;
      const testPt: GeoPoint = {
        lat: rowCenterLat + stepDist * dirY * latStepPerMeter,
        lng: rowCenterLng + stepDist * dirX * lngStepPerMeter,
      };

      const inside = isInside(testPt);
      if (inside && !segStart) {
        segStart = testPt;
      } else if (!inside && segStart) {
        rows.push({ p1: segStart, p2: testPt });
        segStart = null;
      }
    }
    if (segStart) {
      const endPt: GeoPoint = {
        lat: rowCenterLat + halfLength * dirY * latStepPerMeter,
        lng: rowCenterLng + halfLength * dirX * lngStepPerMeter,
      };
      rows.push({ p1: segStart, p2: endPt });
    }
  }

  return rows;
}
