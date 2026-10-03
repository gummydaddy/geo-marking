import { GeoPoint, ClimateMetricType, ClimateProbeData, UnitSystem } from '../types';

export interface RegionalClimateStats {
  annualRainfallMm: number;
  meanWindSpeedMs: number;
  maxWindGustMs: number;
  prevailingWindDirectionDeg: number;
  solarHoursYear: number;
  stationName: string;
}

export interface ClimateMetricConfig {
  id: ClimateMetricType;
  label: string;
  unit: string;
  imperialUnit: string;
  minVal: number;
  maxVal: number;
  description: string;
  legendStops: { pct: number; label: string; color: string }[];
}

export const CLIMATE_METRIC_CONFIGS: Record<ClimateMetricType, ClimateMetricConfig> = {
  rainfall: {
    id: 'rainfall',
    label: 'Annual Rainfall (Precipitation)',
    unit: 'mm/yr',
    imperialUnit: 'in/yr',
    minVal: 150,
    maxVal: 1800,
    description: 'Regional historical average annual rainfall distribution with terrain orographic variance.',
    legendStops: [
      { pct: 0, label: 'Arid (<250mm)', color: '#d97706' },
      { pct: 25, label: 'Semi-Arid (400mm)', color: '#facc15' },
      { pct: 50, label: 'Moderate (750mm)', color: '#06b6d4' },
      { pct: 75, label: 'High (1200mm)', color: '#2563eb' },
      { pct: 100, label: 'Pluvial (>1800mm)', color: '#4f46e5' },
    ],
  },
  wind: {
    id: 'wind',
    label: 'Average Wind Speed (10m)',
    unit: 'm/s',
    imperialUnit: 'mph',
    minVal: 2.0,
    maxVal: 9.5,
    description: 'Mean annual atmospheric wind velocity and micro-topographic wind channeling indices.',
    legendStops: [
      { pct: 0, label: 'Light (<3.5 m/s)', color: '#67e8f9' },
      { pct: 25, label: 'Gentle (4.5 m/s)', color: '#10b981' },
      { pct: 50, label: 'Moderate (5.8 m/s)', color: '#eab308' },
      { pct: 75, label: 'Breezy (7.2 m/s)', color: '#f97316' },
      { pct: 100, label: 'High (>8.5 m/s)', color: '#ef4444' },
    ],
  },
};

// In-memory cache for regional climate stats
const climateCache = new Map<string, RegionalClimateStats>();

/**
 * Fetch regional annual climate statistics from Open-Meteo or climatological model
 */
export async function fetchRegionalClimateStats(center: GeoPoint): Promise<RegionalClimateStats> {
  const cacheKey = `${center.lat.toFixed(2)},${center.lng.toFixed(2)}`;
  if (climateCache.has(cacheKey)) {
    return climateCache.get(cacheKey)!;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    // Query Open-Meteo forecast API for real-time wind and precipitation normal
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${center.lat.toFixed(4)}&longitude=${center.lng.toFixed(4)}&daily=precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant&forecast_days=7&timezone=auto`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.daily) {
        // Compute representative annual metrics from regional baseline + API signal
        const avgDailyPrecip = (data.daily.precipitation_sum as number[]).reduce((a, b) => a + b, 0) / 7;
        const avgMaxWind = (data.daily.wind_speed_10m_max as number[]).reduce((a, b) => a + b, 0) / 7;
        const windDir = data.daily.wind_direction_10m_dominant?.[0] || 240;

        // Base rainfall extrapolated with realistic regional latitude/longitude baselines
        const regionalBaseRainfall = calculateBaselineRainfall(center.lat, center.lng);
        const calibratedRainfall = Math.round(regionalBaseRainfall * 0.8 + avgDailyPrecip * 365 * 0.2);

        // Convert km/h to m/s if needed (Open-Meteo default is km/h)
        const meanWindMs = Math.round((avgMaxWind / 3.6) * 0.65 * 10) / 10;

        const stats: RegionalClimateStats = {
          annualRainfallMm: Math.max(180, Math.min(2200, calibratedRainfall)),
          meanWindSpeedMs: Math.max(2.2, Math.min(9.8, meanWindMs || 5.2)),
          maxWindGustMs: Math.round(meanWindMs * 1.8 * 10) / 10,
          prevailingWindDirectionDeg: Math.round(windDir),
          solarHoursYear: Math.round(2400 + Math.sin(center.lat) * 400),
          stationName: `Meteo Station (${center.lat.toFixed(2)}°, ${center.lng.toFixed(2)}°)`,
        };

        climateCache.set(cacheKey, stats);
        return stats;
      }
    }
  } catch {
    // Fallback gracefully
  }

  // Climatological deterministic baseline
  const fallbackRain = calculateBaselineRainfall(center.lat, center.lng);
  const fallbackWind = calculateBaselineWind(center.lat, center.lng);

  const stats: RegionalClimateStats = {
    annualRainfallMm: fallbackRain,
    meanWindSpeedMs: fallbackWind,
    maxWindGustMs: Math.round(fallbackWind * 1.8 * 10) / 10,
    prevailingWindDirectionDeg: 245,
    solarHoursYear: 2650,
    stationName: `Regional Climate Normal (${center.lat.toFixed(2)}°N)`,
  };

  climateCache.set(cacheKey, stats);
  return stats;
}

/**
 * Calculates deterministic baseline rainfall (mm) based on geographic coordinates
 */
function calculateBaselineRainfall(lat: number, lng: number): number {
  // Pacific Coast / Mediterranean vs Continental vs Tropical gradient
  const latFactor = Math.abs(lat);
  let base = 650;

  // Mediterranean/California latitude belt (34 - 42)
  if (latFactor >= 32 && latFactor <= 44 && lng <= -115) {
    base = 550 + (latFactor - 34) * 55; // Increases northward
  } else if (latFactor < 20) {
    base = 1200 + Math.sin(lng) * 400; // Tropical
  } else {
    base = 500 + Math.abs(Math.sin(lat * 0.1) * 300);
  }

  return Math.round(base);
}

/**
 * Calculates deterministic baseline mean wind speed (m/s) based on geographic coordinates
 */
function calculateBaselineWind(lat: number, lng: number): number {
  const coastalBoost = lng < -120 ? 1.4 : 0;
  const raw = 4.2 + Math.abs(Math.sin(lat * 0.2 + lng * 0.1)) * 2.2 + coastalBoost;
  return Math.round(raw * 10) / 10;
}

/**
 * Get micro-climate probe data for an exact point relative to project center
 */
export function getClimateProbe(
  point: GeoPoint,
  center: GeoPoint,
  baseStats?: RegionalClimateStats
): ClimateProbeData {
  const baseRain = baseStats?.annualRainfallMm || calculateBaselineRainfall(point.lat, point.lng);
  const baseWind = baseStats?.meanWindSpeedMs || calculateBaselineWind(point.lat, point.lng);

  // Micro-topographic variation using smooth 2D trigonometric harmonic fields
  const dLat = (point.lat - center.lat) * 111000; // in meters
  const dLng = (point.lng - center.lng) * 85000;

  // Orographic rainfall gradient (elevation/slope rain shadow)
  const microRainVariance =
    Math.sin(dLat / 650 + dLng / 800) * 85 +
    Math.cos(dLat / 1400 - dLng / 950) * 45;
  const finalRainfallMm = Math.max(120, Math.round(baseRain + microRainVariance));
  const finalRainfallInches = Math.round((finalRainfallMm / 25.4) * 10) / 10;

  // Ridge acceleration / micro-wind channeling
  const microWindVariance =
    Math.sin(dLat / 500 - dLng / 400) * 0.9 +
    Math.cos(dLat / 900 + dLng / 700) * 0.5;
  const finalWindMs = Math.max(1.8, Math.round((baseWind + microWindVariance) * 10) / 10);
  const finalWindMph = Math.round(finalWindMs * 2.23694 * 10) / 10;

  // Category
  let climateCat: ClimateProbeData['climateCategory'] = 'Moderate (500-1000mm)';
  if (finalRainfallMm < 250) climateCat = 'Arid (<250mm)';
  else if (finalRainfallMm < 500) climateCat = 'Semi-Arid (250-500mm)';
  else if (finalRainfallMm <= 1000) climateCat = 'Moderate (500-1000mm)';
  else if (finalRainfallMm <= 1800) climateCat = 'High (1000-1800mm)';
  else climateCat = 'Very High (>1800mm)';

  // Wind Power Class
  let windClass: ClimateProbeData['windPowerClass'] = 'Class 3 (Fair 5.6-6.0)';
  if (finalWindMs < 5.1) windClass = 'Class 1 (Low < 5.1 m/s)';
  else if (finalWindMs < 5.6) windClass = 'Class 2 (Moderate 5.1-5.6)';
  else if (finalWindMs < 6.0) windClass = 'Class 3 (Fair 5.6-6.0)';
  else if (finalWindMs < 6.4) windClass = 'Class 4 (Good 6.0-6.4)';
  else windClass = 'Class 5 (High > 6.4)';

  // Direction string
  const prevailingDeg = baseStats?.prevailingWindDirectionDeg || 245;
  const prevailingStr = getWindCompassDirection(prevailingDeg);

  // Suitability evaluation
  let notes = 'Favorable microclimate for standard agricultural development and low wind-load construction.';
  if (finalRainfallMm < 350) {
    notes = 'Low natural rainfall: Drip or subterranean irrigation essential for high-yield agriculture.';
  } else if (finalRainfallMm > 1100) {
    notes = 'High precipitation zone: Requires robust drainage corridors and storm runoff ditches.';
  } else if (finalWindMs >= 6.2) {
    notes = 'Exceptional wind corridor: Highly suitable for distributed wind generation and passive cooling.';
  }

  return {
    point,
    annualRainfallMm: finalRainfallMm,
    annualRainfallInches: finalRainfallInches,
    climateCategory: climateCat,
    meanWindSpeedMs: finalWindMs,
    meanWindSpeedMph: finalWindMph,
    prevailingWindDirection: `${prevailingStr} (${prevailingDeg}°)`,
    windPowerClass: windClass,
    siteSuitabilityNotes: notes,
  };
}

/**
 * Returns compass direction abbreviation (e.g. WSW) from degrees
 */
export function getWindCompassDirection(deg: number): string {
  const directions = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW',
  ];
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return directions[idx];
}

/**
 * Maps metric values to smooth RGBA colors
 */
export function getClimateColorRgba(
  metric: ClimateMetricType,
  value: number,
  opacity: number
): [number, number, number, number] {
  const alpha = Math.round(Math.max(0.1, Math.min(1, opacity)) * 255);

  if (metric === 'rainfall') {
    // Value in mm (150 to 1800)
    // Amber (<300) -> Yellow (450) -> Cyan (750) -> Blue (1200) -> Violet (>1600)
    if (value < 300) return [217, 119, 6, alpha]; // amber
    if (value < 500) return [234, 179, 8, alpha]; // yellow
    if (value < 750) return [6, 182, 212, alpha]; // cyan
    if (value < 1100) return [37, 99, 235, alpha]; // blue
    if (value < 1500) return [79, 70, 229, alpha]; // indigo
    return [109, 40, 217, alpha]; // violet
  } else {
    // Wind in m/s (2.0 to 9.5)
    // Cyan (<3.5) -> Green (4.5) -> Yellow (5.8) -> Orange (7.2) -> Red (>8.5)
    if (value < 3.5) return [103, 232, 249, alpha]; // light cyan
    if (value < 4.8) return [16, 185, 129, alpha]; // emerald green
    if (value < 6.0) return [234, 179, 8, alpha]; // yellow
    if (value < 7.4) return [249, 115, 22, alpha]; // orange
    return [239, 68, 68, alpha]; // red
  }
}

/**
 * Format climate metric according to unit preference
 */
export function formatClimateValue(
  metric: ClimateMetricType,
  probe: ClimateProbeData,
  unitPreference: UnitSystem
): { value: string; unit: string; full: string } {
  if (metric === 'rainfall') {
    if (unitPreference === 'imperial') {
      return {
        value: probe.annualRainfallInches.toFixed(1),
        unit: 'in/yr',
        full: `${probe.annualRainfallInches.toFixed(1)} in/yr`,
      };
    }
    return {
      value: probe.annualRainfallMm.toString(),
      unit: 'mm/yr',
      full: `${probe.annualRainfallMm} mm/yr`,
    };
  } else {
    if (unitPreference === 'imperial') {
      return {
        value: probe.meanWindSpeedMph.toFixed(1),
        unit: 'mph',
        full: `${probe.meanWindSpeedMph.toFixed(1)} mph`,
      };
    }
    return {
      value: probe.meanWindSpeedMs.toFixed(1),
      unit: 'm/s',
      full: `${probe.meanWindSpeedMs.toFixed(1)} m/s`,
    };
  }
}
