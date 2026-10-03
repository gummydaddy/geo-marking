export interface GeoPoint {
  lat: number;
  lng: number;
}

export type LandCategory =
  | 'residential'
  | 'agricultural'
  | 'commercial'
  | 'industrial'
  | 'green_buffer'
  | 'water'
  | 'solar_utility'
  | 'access_road'
  | 'custom';

export interface CategoryPreset {
  id: LandCategory;
  label: string;
  defaultColor: string;
  defaultStroke: string;
  fillOpacity: number;
  description: string;
}

export const CATEGORY_PRESETS: Record<LandCategory, CategoryPreset> = {
  agricultural: {
    id: 'agricultural',
    label: 'Agricultural / Crop',
    defaultColor: '#16a34a',
    defaultStroke: '#15803d',
    fillOpacity: 0.35,
    description: 'Arable farmland, crop plots, orchards, pastures',
  },
  residential: {
    id: 'residential',
    label: 'Residential / Buildable',
    defaultColor: '#0284c7',
    defaultStroke: '#0369a1',
    fillOpacity: 0.35,
    description: 'Residential building footprints, home parcels',
  },
  commercial: {
    id: 'commercial',
    label: 'Commercial',
    defaultColor: '#7c3aed',
    defaultStroke: '#6d28d9',
    fillOpacity: 0.35,
    description: 'Retail, business operations, parking zones',
  },
  industrial: {
    id: 'industrial',
    label: 'Industrial / Logistics',
    defaultColor: '#ea580c',
    defaultStroke: '#c2410c',
    fillOpacity: 0.35,
    description: 'Warehouses, fabrication, loading docks',
  },
  green_buffer: {
    id: 'green_buffer',
    label: 'Conservation / Buffer',
    defaultColor: '#10b981',
    defaultStroke: '#047857',
    fillOpacity: 0.3,
    description: 'Wetland buffers, tree lines, easements',
  },
  water: {
    id: 'water',
    label: 'Water / Retention Basin',
    defaultColor: '#06b6d4',
    defaultStroke: '#0e7490',
    fillOpacity: 0.45,
    description: 'Lakes, retention ponds, irrigation reservoirs',
  },
  solar_utility: {
    id: 'solar_utility',
    label: 'Solar & Utility',
    defaultColor: '#eab308',
    defaultStroke: '#ca8a04',
    fillOpacity: 0.4,
    description: 'Solar photovoltaic arrays, substations, switchyards',
  },
  access_road: {
    id: 'access_road',
    label: 'Access Road / Corridor',
    defaultColor: '#64748b',
    defaultStroke: '#475569',
    fillOpacity: 0.4,
    description: 'Right-of-way, internal drives, utility corridors',
  },
  custom: {
    id: 'custom',
    label: 'Custom Zone',
    defaultColor: '#ec4899',
    defaultStroke: '#be185d',
    fillOpacity: 0.35,
    description: 'User-specified designation',
  },
};

export interface LandParcel {
  id: string;
  name: string;
  category: LandCategory;
  color: string;
  strokeColor: string;
  fillOpacity: number;
  strokeWidth: number;
  coordinates: GeoPoint[];
  areaSqMeters: number;
  perimeterMeters: number;
  notes?: string;
  zoningCode?: string;
  setbackMeters?: number;
  taxLotNumber?: string;
}

export type LineType = 'fence' | 'road' | 'pipeline' | 'boundary_wall' | 'easement' | 'ditch';

export interface LandLine {
  id: string;
  name: string;
  type: LineType;
  color: string;
  strokeWidth: number;
  dashArray?: string;
  coordinates: GeoPoint[];
  lengthMeters: number;
  notes?: string;
}

export type MarkerType =
  | 'survey_pin'
  | 'well'
  | 'transformer'
  | 'gate'
  | 'soil_sample'
  | 'structure'
  | 'tree'
  | 'hazard'
  | 'benchmark';

export interface LandMarker {
  id: string;
  name: string;
  category: MarkerType;
  point: GeoPoint;
  notes?: string;
  elevationMeters?: number;
}

export type UnitSystem = 'metric' | 'imperial';

export interface LandProject {
  id: string;
  name: string;
  description?: string;
  clientOrOwner?: string;
  locationName?: string;
  center: GeoPoint;
  zoom: number;
  parcels: LandParcel[];
  lines: LandLine[];
  markers: LandMarker[];
  unitPreference: UnitSystem;
  createdAt: string;
  updatedAt: string;
}

export type ToolMode =
  | 'select'
  | 'polygon'
  | 'line'
  | 'marker'
  | 'measure';

export type BasemapId =
  | 'esri_satellite'
  | 'esri_clarity'
  | 'esri_hybrid'
  | 'usgs_topo'
  | 'carto_voyager'
  | 'carto_voyager_clean'
  | 'carto_voyager_hd'
  | 'carto_dark'
  | 'carto_dark_clean'
  | 'carto_positron'
  | 'carto_positron_clean'
  | 'osm';

export interface BasemapConfig {
  id: BasemapId;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  overlayUrl?: string;
}

// Solar Panel Capacity Estimator Types
export type SolarMountType = 'fixed_ground' | 'single_axis_tracker' | 'dual_axis' | 'rooftop' | 'agrivoltaics';

export interface SolarPanelConfig {
  mountType: SolarMountType;
  azimuthDeg: number; // 0 to 360 (180 = True South)
  tiltDeg: number; // 0 to 60 deg
  groundCoverRatio: number; // 0.30 to 0.85
  panelWattage: number; // e.g. 550 W
  panelEfficiency: number; // e.g. 0.215 (21.5%)
  electricityRatePerKwh: number; // e.g. 0.09 ($/kWh)
}

export interface SolarCapacityResult {
  usableAreaSqMeters: number;
  usableAreaAcres: number;
  dcCapacityKw: number;
  dcCapacityMw: number;
  annualGenerationMwh: number;
  estimatedPanelCount: number;
  homesPoweredAnnually: number;
  co2OffsetMetricTonsYear: number;
  estimatedAnnualRevenue: number;
  peakSunHoursPerDay: number;
  orientationFactor: number;
}

// Soil Quality & Agricultural Suitability Heatmap Types
export type SoilMetricType =
  | 'suitability_index'
  | 'organic_matter'
  | 'drainage_class'
  | 'ph_level'
  | 'erosion_risk';

export interface SoilProbeData {
  point: GeoPoint;
  suitabilityScore: number; // 0 - 100
  landCapabilityClass: 'Class I' | 'Class II' | 'Class III' | 'Class IV' | 'Class V' | 'Class VI' | 'Class VII';
  primeFarmlandStatus: 'All Areas are Prime Farmland' | 'Farmland of Statewide Importance' | 'Prime Farmland if Irrigated' | 'Not Prime Farmland';
  soilSeriesName: string;
  texture: string;
  organicMatterPercent: number;
  phLevel: number;
  drainageClass: 'Well Drained' | 'Moderately Well Drained' | 'Somewhat Poorly Drained' | 'Excessively Drained';
  erosionRisk: 'Low' | 'Moderate' | 'High' | 'Severe';
  recommendedCrops: string[];
}

// Climate & Meteorological Layer Types
export type ClimateMetricType = 'rainfall' | 'wind';

export interface ClimateProbeData {
  point: GeoPoint;
  annualRainfallMm: number;
  annualRainfallInches: number;
  climateCategory: 'Arid (<250mm)' | 'Semi-Arid (250-500mm)' | 'Moderate (500-1000mm)' | 'High (1000-1800mm)' | 'Very High (>1800mm)';
  meanWindSpeedMs: number;
  meanWindSpeedMph: number;
  prevailingWindDirection: string;
  windPowerClass: 'Class 1 (Low < 5.1 m/s)' | 'Class 2 (Moderate 5.1-5.6)' | 'Class 3 (Fair 5.6-6.0)' | 'Class 4 (Good 6.0-6.4)' | 'Class 5 (High > 6.4)';
  siteSuitabilityNotes: string;
}

// Real-Time User Geolocation Tracking
export interface UserLocation {
  lat: number;
  lng: number;
  accuracy: number; // in meters
  heading?: number | null; // in degrees from true north
  speed?: number | null; // in m/s
  altitude?: number | null; // in meters
  timestamp: number;
  source?: 'gps' | 'ip' | 'manual';
  cityName?: string;
}



