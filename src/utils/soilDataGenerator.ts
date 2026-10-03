import { GeoPoint, SoilMetricType, SoilProbeData } from '../types';

/**
 * Returns soil characteristics and suitability metrics for any coordinate
 * with geographic grounding based on latitude and regional landforms.
 */
export function getSoilProbe(point: GeoPoint, projectCenter: GeoPoint): SoilProbeData {
  // Deterministic pseudo-random variation based on spatial noise
  const nx = Math.sin(point.lat * 1800 + point.lng * 2200);
  const ny = Math.cos(point.lat * 3100 - point.lng * 1900);
  const variation = (nx + ny) / 2; // -1 to 1

  const isDesert = point.lat > 32 && point.lat < 37 && point.lng > -118 && point.lng < -114;
  const isWineCountry = point.lat > 37.8 && point.lat < 39.0 && point.lng > -123.0 && point.lng < -121.5;
  const isMidwestPrairie = point.lat > 38 && point.lat < 46 && point.lng > -100 && point.lng < -85;

  let baseSuitability = 72;
  let soilSeries = 'Arbuckle Fine Sandy Loam';
  let texture = 'Fine Sandy Loam';
  let baseOM = 2.4;
  let basePH = 6.6;
  let primeStatus: SoilProbeData['primeFarmlandStatus'] = 'Prime Farmland if Irrigated';
  let capabilityClass: SoilProbeData['landCapabilityClass'] = 'Class II';
  let drainage: SoilProbeData['drainageClass'] = 'Well Drained';
  let crops = ['Wheat', 'Alfalfa', 'Vegetables', 'Orchards'];

  if (isDesert) {
    baseSuitability = 32;
    soilSeries = 'Cajon Sand & Mojave Loam';
    texture = 'Coarse Sand & Gravelly Loam';
    baseOM = 0.6;
    basePH = 7.9;
    primeStatus = 'Not Prime Farmland';
    capabilityClass = 'Class VI';
    drainage = 'Excessively Drained';
    crops = ['Drought-Resistant Forage', 'Desert Agrivoltaics', 'Date Palms'];
  } else if (isWineCountry) {
    baseSuitability = 88;
    soilSeries = 'Bale Gravelly Loam / Yolo Alluvial';
    texture = 'Volcanic Silt Loam & Gravel';
    baseOM = 3.6;
    basePH = 6.5;
    primeStatus = 'All Areas are Prime Farmland';
    capabilityClass = 'Class I';
    drainage = 'Well Drained';
    crops = ['Wine Grapes', 'Olives', 'Heirloom Fruits', 'Cover Crops'];
  } else if (isMidwestPrairie) {
    baseSuitability = 92;
    soilSeries = 'Clarion-Nicollet-Webster Mollisol';
    texture = 'Deep Rich Silt Loam';
    baseOM = 4.5;
    basePH = 6.8;
    primeStatus = 'All Areas are Prime Farmland';
    capabilityClass = 'Class I';
    drainage = 'Well Drained';
    crops = ['Corn', 'Soybeans', 'Winter Wheat', 'Barley'];
  }

  // Apply localized terrain variation
  const finalScore = Math.max(10, Math.min(98, Math.round(baseSuitability + variation * 14)));
  const organicMatter = Math.max(0.4, Number((baseOM + variation * 0.8).toFixed(1)));
  const phLevel = Number((basePH + variation * 0.3).toFixed(1));

  let erosionRisk: SoilProbeData['erosionRisk'] = 'Low';
  if (finalScore < 40) erosionRisk = 'High';
  else if (finalScore < 65) erosionRisk = 'Moderate';

  return {
    point,
    suitabilityScore: finalScore,
    landCapabilityClass: capabilityClass,
    primeFarmlandStatus: primeStatus,
    soilSeriesName: soilSeries,
    texture,
    organicMatterPercent: organicMatter,
    phLevel,
    drainageClass: drainage,
    erosionRisk,
    recommendedCrops: crops,
  };
}

/**
 * Returns RGBA color tuple for a given metric score (0 to 100)
 */
export function getSoilMetricColor(score: number, metric: SoilMetricType, opacity = 0.6): string {
  // Invert score if erosion risk (higher risk = worse/red)
  const normScore = metric === 'erosion_risk' ? 100 - score : score;

  // Multi-stop color ramp:
  // 0-35: Red/Orange (Poor/Marginal)
  // 35-65: Amber/Yellow (Moderate)
  // 65-85: Light Green (Good)
  // 85-100: Deep Emerald (Prime)
  let r = 239,
    g = 68,
    b = 68; // default red #ef4444

  if (normScore >= 85) {
    // Deep Emerald Green #059669
    r = 5;
    g = 150;
    b = 105;
  } else if (normScore >= 70) {
    // Lime / Green #10b981
    r = 16;
    g = 185;
    b = 129;
  } else if (normScore >= 55) {
    // Yellow-Green #84cc16
    r = 132;
    g = 204;
    b = 22;
  } else if (normScore >= 40) {
    // Amber #f59e0b
    r = 245;
    g = 158;
    b = 11;
  } else if (normScore >= 25) {
    // Orange #f97316
    r = 249;
    g = 115;
    b = 22;
  }

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export const SOIL_METRIC_CONFIGS: Record<
  SoilMetricType,
  { label: string; description: string; unit: string; optimalRange: string }
> = {
  suitability_index: {
    label: 'Agricultural Land Suitability (ALSI)',
    description: 'Composite USDA capability rating combining drainage, depth, and fertility.',
    unit: '/ 100 Score',
    optimalRange: '75 – 100 (Prime Farmland)',
  },
  organic_matter: {
    label: 'Soil Organic Matter & Humus',
    description: 'Biological fertility, carbon storage, and natural water retention capability.',
    unit: '% Organic Matter',
    optimalRange: '3.0% – 5.5%',
  },
  drainage_class: {
    label: 'Percolation & Moisture Retention',
    description: 'Hydraulic conductivity and subsurface drainage without waterlogging.',
    unit: 'Hydraulic Index',
    optimalRange: 'Well Drained',
  },
  ph_level: {
    label: 'Soil pH & Acidity Level',
    description: 'Nutrient availability balance for viticulture and agricultural crops.',
    unit: 'pH',
    optimalRange: '6.2 – 7.2 (Slightly Acidic to Neutral)',
  },
  erosion_risk: {
    label: 'Erosion Vulnerability Index',
    description: 'Susceptibility of topsoil to wind and stormwater runoff degradation.',
    unit: 'Risk Score',
    optimalRange: 'Low Risk (<35)',
  },
};
