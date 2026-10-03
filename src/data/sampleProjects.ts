import { LandProject } from '../types';
import { calculateGeodesicArea, calculatePerimeter } from '../utils/geoMath';

// Coordinates around Napa Valley / Sonoma wine country (real coordinates with rich satellite scenery)
const oakridgeCoordsParcel1 = [
  { lat: 38.483120, lng: -122.415250 },
  { lat: 38.484950, lng: -122.408710 },
  { lat: 38.481280, lng: -122.406980 },
  { lat: 38.479520, lng: -122.413860 },
];

const oakridgeCoordsParcel2 = [
  { lat: 38.484950, lng: -122.408710 },
  { lat: 38.486250, lng: -122.403980 },
  { lat: 38.482810, lng: -122.402650 },
  { lat: 38.481280, lng: -122.406980 },
];

const oakridgeCoordsPond = [
  { lat: 38.480110, lng: -122.411800 },
  { lat: 38.480850, lng: -122.410120 },
  { lat: 38.480320, lng: -122.408980 },
  { lat: 38.479640, lng: -122.410520 },
];

const oakridgeFenceLine = [
  { lat: 38.483120, lng: -122.415250 },
  { lat: 38.484950, lng: -122.408710 },
  { lat: 38.486250, lng: -122.403980 },
  { lat: 38.482810, lng: -122.402650 },
  { lat: 38.479520, lng: -122.413860 },
  { lat: 38.483120, lng: -122.415250 },
];

const oakridgeRoad = [
  { lat: 38.478950, lng: -122.414900 },
  { lat: 38.481450, lng: -122.411950 },
  { lat: 38.483520, lng: -122.409100 },
];

// Mojave Desert Solar & Eco Park coords
const solarCoordsArray1 = [
  { lat: 35.021500, lng: -116.892000 },
  { lat: 35.021500, lng: -116.883500 },
  { lat: 35.015200, lng: -116.883500 },
  { lat: 35.015200, lng: -116.892000 },
];

const solarCoordsBuffer = [
  { lat: 35.023200, lng: -116.894500 },
  { lat: 35.023200, lng: -116.881000 },
  { lat: 35.021500, lng: -116.881000 },
  { lat: 35.021500, lng: -116.894500 },
];

export const SAMPLE_PROJECTS: LandProject[] = [
  {
    id: 'proj_oakridge_estate',
    name: 'Oakridge Ranch & Vineyard Estate',
    description: 'Subdivision and agricultural layout plan for parcel zoning, vineyard planting blocks, and water retention.',
    clientOrOwner: 'Oakridge Ag Land Holdings LLC',
    locationName: 'St. Helena, Napa County, CA',
    center: { lat: 38.4828, lng: -122.4098 },
    zoom: 16,
    unitPreference: 'imperial',
    createdAt: '2026-03-15T09:00:00Z',
    updatedAt: '2026-03-30T11:45:00Z',
    parcels: [
      {
        id: 'parcel_oak_1',
        name: 'Block A - Cabernet Sauvignon',
        category: 'agricultural',
        color: '#16a34a',
        strokeColor: '#15803d',
        fillOpacity: 0.35,
        strokeWidth: 2,
        coordinates: oakridgeCoordsParcel1,
        areaSqMeters: calculateGeodesicArea(oakridgeCoordsParcel1),
        perimeterMeters: calculatePerimeter(oakridgeCoordsParcel1),
        zoningCode: 'AP-40 (Agricultural Preserve)',
        taxLotNumber: 'TL-042-180-009',
        notes: 'Premium hillside volcanic loam soil. Spacing: 6ft x 4ft cane-pruned rootstock.',
      },
      {
        id: 'parcel_oak_2',
        name: 'Block B - Sauvignon Blanc & Olive Grove',
        category: 'agricultural',
        color: '#84cc16',
        strokeColor: '#4d7c0f',
        fillOpacity: 0.35,
        strokeWidth: 2,
        coordinates: oakridgeCoordsParcel2,
        areaSqMeters: calculateGeodesicArea(oakridgeCoordsParcel2),
        perimeterMeters: calculatePerimeter(oakridgeCoordsParcel2),
        zoningCode: 'AP-40',
        taxLotNumber: 'TL-042-180-010',
        notes: 'East-facing slope. Includes 40 Mission olive trees along perimeter boundary.',
      },
      {
        id: 'parcel_oak_pond',
        name: 'South Retention Pond & Reservoir',
        category: 'water',
        color: '#06b6d4',
        strokeColor: '#0891b2',
        fillOpacity: 0.45,
        strokeWidth: 2,
        coordinates: oakridgeCoordsPond,
        areaSqMeters: calculateGeodesicArea(oakridgeCoordsPond),
        perimeterMeters: calculatePerimeter(oakridgeCoordsPond),
        notes: '12 acre-feet irrigation water reservoir. Fed by deep artisan well #2.',
      },
    ],
    lines: [
      {
        id: 'line_perimeter_fence',
        name: '8-Foot Perimeter Deer & Game Fence',
        type: 'fence',
        color: '#f59e0b',
        strokeWidth: 3,
        dashArray: '6,4',
        coordinates: oakridgeFenceLine,
        lengthMeters: calculatePerimeter(oakridgeFenceLine, true),
        notes: 'Heavy-duty galvanized mesh barrier with predator apron.',
      },
      {
        id: 'line_access_road',
        name: 'Main Ranch Service Road (24ft Gravel)',
        type: 'road',
        color: '#94a3b8',
        strokeWidth: 4,
        coordinates: oakridgeRoad,
        lengthMeters: calculatePerimeter(oakridgeRoad, false),
        notes: 'All-weather engineered aggregate surface for tractor and harvester transit.',
      },
    ],
    markers: [
      {
        id: 'marker_well_1',
        name: 'Deep Wellhead #1 (Pump Station)',
        category: 'well',
        point: { lat: 38.480450, lng: -122.411100 },
        elevationMeters: 148,
        notes: '380 GPM yield, 480V 3-phase pump controller.',
      },
      {
        id: 'marker_survey_pin',
        name: 'USGS Cadastral Benchmark (SW Corner)',
        category: 'survey_pin',
        point: { lat: 38.479520, lng: -122.413860 },
        elevationMeters: 142,
        notes: 'Brass monument set in concrete block.',
      },
      {
        id: 'marker_gate',
        name: 'North Automated Security Gate',
        category: 'gate',
        point: { lat: 38.484950, lng: -122.408710 },
        elevationMeters: 156,
        notes: 'Keypad + solar battery backup gate arm.',
      },
    ],
  },
  {
    id: 'proj_solaria_park',
    name: 'Solaria Valley Photovoltaic Facility',
    description: 'Utility-scale solar array layout with wildlife avoidance buffers and 115kV interconnect corridor.',
    clientOrOwner: 'Solaria Clean Energy Partners',
    locationName: 'Daggett, San Bernardino County, CA',
    center: { lat: 35.0195, lng: -116.888 },
    zoom: 15,
    unitPreference: 'metric',
    createdAt: '2026-02-10T14:20:00Z',
    updatedAt: '2026-03-28T16:10:00Z',
    parcels: [
      {
        id: 'parcel_sol_1',
        name: 'Solar Array Zone Alpha (40 MWdc)',
        category: 'solar_utility',
        color: '#eab308',
        strokeColor: '#ca8a04',
        fillOpacity: 0.4,
        strokeWidth: 2,
        coordinates: solarCoordsArray1,
        areaSqMeters: calculateGeodesicArea(solarCoordsArray1),
        perimeterMeters: calculatePerimeter(solarCoordsArray1),
        zoningCode: 'M-1 (Light Industrial/Utility)',
        notes: 'Single-axis tracking bifacial crystalline silicon modules.',
      },
      {
        id: 'parcel_sol_buffer',
        name: 'Northern Ecological Habitat Buffer',
        category: 'green_buffer',
        color: '#10b981',
        strokeColor: '#059669',
        fillOpacity: 0.35,
        strokeWidth: 2,
        coordinates: solarCoordsBuffer,
        areaSqMeters: calculateGeodesicArea(solarCoordsBuffer),
        perimeterMeters: calculatePerimeter(solarCoordsBuffer),
        zoningCode: 'Resource Conservation',
        notes: 'Required 150-meter setback corridor for desert tortoise and burrowing owl nesting.',
      },
    ],
    lines: [
      {
        id: 'line_sec_fence',
        name: 'Chainlink Perimeter Security Fence',
        type: 'fence',
        color: '#ef4444',
        strokeWidth: 3,
        dashArray: '5,3',
        coordinates: [
          { lat: 35.021500, lng: -116.892000 },
          { lat: 35.021500, lng: -116.883500 },
          { lat: 35.015200, lng: -116.883500 },
          { lat: 35.015200, lng: -116.892000 },
          { lat: 35.021500, lng: -116.892000 },
        ],
        lengthMeters: 3100,
        notes: 'Includes tortoise exclusion flashing at ground level.',
      },
    ],
    markers: [
      {
        id: 'marker_substation',
        name: '115kV Interconnection Substation',
        category: 'transformer',
        point: { lat: 35.018500, lng: -116.884500 },
        elevationMeters: 620,
        notes: 'Main power step-up transformer and SCADA control shelter.',
      },
    ],
  },
];
