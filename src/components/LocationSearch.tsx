import React, { useState } from 'react';
import {
  Search,
  MapPin,
  Loader2,
  X,
  Compass,
  Store,
  Utensils,
  Building2,
  Home,
  Briefcase,
  Crosshair,
  PlusCircle,
  Check,
  Landmark,
} from 'lucide-react';
import { GeoPoint, UnitSystem, LandMarker } from '../types';
import { calculateDistance, formatDistance } from '../utils/geoMath';
import type { Map as LeafletMap } from 'leaflet';

interface LocationSearchProps {
  isOpen: boolean;
  onClose: () => void;
  leafletMap: LeafletMap | null;
  onLocationSelected: (point: GeoPoint, name: string) => void;
  onAddMarker?: (marker: Omit<LandMarker, 'id'>) => void;
  currentCenter?: GeoPoint;
  unitPreference?: UnitSystem;
}

interface SearchResult {
  place_id: number | string;
  display_name: string;
  lat: string | number;
  lon: string | number;
  class?: string;
  type?: string;
  badge?: string;
  subtitle?: string;
  extratags?: Record<string, string>;
  address?: Record<string, string>;
}

type PlaceCategory = 'all' | 'shops' | 'buildings' | 'restaurants' | 'malls' | 'houses_plots' | 'commercial';

const CATEGORY_TABS: Array<{
  id: PlaceCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string;
}> = [
  { id: 'all', label: 'All Places', icon: Compass, placeholder: 'Search any address, shop, building, or coordinates...' },
  { id: 'shops', label: 'Shops & Retail', icon: Store, placeholder: 'Search shops: Costco, Target, grocery, hardware, bakery...' },
  { id: 'buildings', label: 'Buildings & Landmarks', icon: Landmark, placeholder: 'Search building names, civic towers, municipal halls...' },
  { id: 'restaurants', label: 'Restaurants & Cafes', icon: Utensils, placeholder: 'Search restaurants, dining, cafes, bakeries...' },
  { id: 'malls', label: 'Malls & Plazas', icon: Building2, placeholder: 'Search shopping malls, centers, retail parks...' },
  { id: 'houses_plots', label: 'Houses & Plots', icon: Home, placeholder: 'Search houses, residential plots, subdivisions, estates...' },
  { id: 'commercial', label: 'Commercial & Offices', icon: Briefcase, placeholder: 'Search office parks, commercial zones, warehouses...' },
];

const PRESET_PLACES = [
  {
    name: 'Empire State Building & Civic Landmark, New York, NY',
    coords: { lat: 40.7484, lng: -73.9857 },
    category: 'buildings',
    tag: 'Iconic Skyscraper & Commercial Landmark',
  },
  {
    name: 'Costco Wholesale & Bulk Retail Depot, San Jose, CA',
    coords: { lat: 37.3059, lng: -121.8492 },
    category: 'shops',
    tag: 'Supermarket & Membership Warehouse',
  },
  {
    name: 'Apple Park Campus & Steve Jobs Theater, Cupertino, CA',
    coords: { lat: 37.3349, lng: -122.009 },
    category: 'buildings',
    tag: 'Architectural Office & Innovation Campus',
  },
  {
    name: 'Target Supercenter & Retail District, Irvine, CA',
    coords: { lat: 33.7042, lng: -117.7852 },
    category: 'shops',
    tag: 'National Retail & Department Store',
  },
  {
    name: 'Santana Row Shopping & Residential District, San Jose, CA',
    coords: { lat: 37.3218, lng: -121.9478 },
    category: 'malls',
    tag: 'Retail Plaza & Mixed Residential',
  },
  {
    name: 'Napa Downtown Restaurant & Artisan Row, CA',
    coords: { lat: 38.2975, lng: -122.2869 },
    category: 'restaurants',
    tag: 'Culinary & Dining District',
  },
  {
    name: 'Transamerica Pyramid & Commercial Center, San Francisco, CA',
    coords: { lat: 37.7952, lng: -122.4028 },
    category: 'buildings',
    tag: 'Financial District Skyscraper',
  },
  {
    name: 'Highland Oaks Residential Subdivision Lots, TX',
    coords: { lat: 30.2922, lng: -98.885 },
    category: 'houses_plots',
    tag: 'Single-Family Home Parcels',
  },
];

export const LocationSearch: React.FC<LocationSearchProps> = ({
  isOpen,
  onClose,
  leafletMap,
  onLocationSelected,
  onAddMarker,
  currentCenter,
  unitPreference = 'imperial',
}) => {
  const [activeCategory, setActiveCategory] = useState<PlaceCategory>('all');
  const [query, setQuery] = useState('');
  const [searchNearMap, setSearchNearMap] = useState(true);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [markedPinId, setMarkedPinId] = useState<number | null>(null);

  if (!isOpen) return null;

  // Derive active map center
  const mapCenter = leafletMap ? { lat: leafletMap.getCenter().lat, lng: leafletMap.getCenter().lng } : currentCenter;

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string, overrideCategory?: PlaceCategory) => {
    if (e) e.preventDefault();
    const q = (overrideQuery !== undefined ? overrideQuery : query).trim();
    const cat = overrideCategory !== undefined ? overrideCategory : activeCategory;

    // Check if input is direct coordinates: e.g. "38.4828, -122.4098"
    const coordMatch = q.match(/^([-+]?\d{1,2}(?:\.\d+)?)[,\s]+([-+]?\d{1,3}(?:\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        leafletMap?.setView([lat, lng], 17, { animate: true });
        onLocationSelected({ lat, lng }, `Coordinates ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        onClose();
        return;
      }
    }

    setIsSearching(true);
    setErrorMsg(null);

    try {
      // Build tailored query string based on selected category
      let searchQuery = q;
      if (!searchQuery) {
        if (cat === 'shops') searchQuery = 'supermarket store grocery retail';
        else if (cat === 'buildings') searchQuery = 'building tower civic center landmark';
        else if (cat === 'restaurants') searchQuery = 'restaurant cafe food dining';
        else if (cat === 'malls') searchQuery = 'shopping mall commercial center';
        else if (cat === 'houses_plots') searchQuery = 'residential house plot subdivision';
        else if (cat === 'commercial') searchQuery = 'commercial office park warehouse';
        else searchQuery = 'places';
      }

      let parsedResults: SearchResult[] = [];

      // 1. Query backend universal place/shop/building search cache
      try {
        const backendUrl = `/api/places/search?q=${encodeURIComponent(searchQuery)}&category=${cat}${
          searchNearMap && mapCenter ? `&lat=${mapCenter.lat}&lon=${mapCenter.lng}` : ''
        }`;
        const bRes = await fetch(backendUrl);
        if (bRes.ok) {
          const bData = await bRes.json();
          if (bData.results && bData.results.length > 0) {
            parsedResults = bData.results.map((r: any) => ({
              place_id: r.id,
              display_name: r.subtitle ? `${r.name}, ${r.subtitle}` : r.name,
              lat: r.lat,
              lon: r.lng,
              class: r.category,
              type: r.osmType || r.category,
              badge: r.badge,
              subtitle: r.subtitle,
            }));
          }
        }
      } catch (err) {
        console.warn('Backend place search fallback to Nominatim', err);
      }

      // 2. If backend search returned empty, fallback to client-side Nominatim
      if (parsedResults.length === 0) {
        let endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery
        )}&limit=14&addressdetails=1&extratags=1`;

        // If search near current map area is toggled, add bounding box bias
        if (searchNearMap && leafletMap) {
          const bounds = leafletMap.getBounds();
          endpoint += `&viewbox=${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}&bounded=0`;
        }

        const response = await fetch(endpoint, {
          headers: {
            'Accept-Language': 'en',
          },
        });

        if (response.ok) {
          const data: SearchResult[] = await response.json();
          parsedResults = data;
        }
      }

      setResults(parsedResults);

      if (parsedResults.length === 0) {
        setErrorMsg(`No ${cat === 'all' ? 'places' : cat.replace('_', ' ')} found for "${q || searchQuery}". Try zooming map or searching a broader city/area.`);
      }
    } catch {
      setErrorMsg('Unable to retrieve location search results. Please check your internet connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = (res: SearchResult) => {
    const lat = typeof res.lat === 'number' ? res.lat : parseFloat(res.lat);
    const lng = typeof res.lon === 'number' ? res.lon : parseFloat(res.lon);
    leafletMap?.setView([lat, lng], 17, { animate: true });
    const title = res.display_name.split(',')[0];
    onLocationSelected({ lat, lng }, title);
    onClose();
  };

  const handleAddAsMarker = (e: React.MouseEvent, res: SearchResult) => {
    e.stopPropagation();
    if (!onAddMarker) return;

    const lat = typeof res.lat === 'number' ? res.lat : parseFloat(res.lat);
    const lng = typeof res.lon === 'number' ? res.lon : parseFloat(res.lon);
    const title = res.display_name.split(',')[0];

    // Map result type to LandMarker category
    let markerCat: 'structure' | 'benchmark' | 'survey_pin' | 'hazard' = 'structure';
    if (res.class === 'shop' || res.class === 'amenity' || res.type === 'house' || res.type === 'mall') {
      markerCat = 'structure';
    }

    onAddMarker({
      name: title,
      category: markerCat,
      point: { lat, lng },
      notes: `${res.display_name} (${res.type || res.class || 'POI'})`,
    });

    setMarkedPinId(typeof res.place_id === 'number' ? res.place_id : 999999);
    setTimeout(() => setMarkedPinId(null), 2500);

    // Also pan map to location
    leafletMap?.setView([lat, lng], 17, { animate: true });
  };

  const handleSelectPreset = (preset: typeof PRESET_PLACES[0]) => {
    leafletMap?.setView([preset.coords.lat, preset.coords.lng], 16, { animate: true });
    onLocationSelected(preset.coords, preset.name);
    onClose();
  };

  // Helper to determine place type badge & icon
  const getPlaceBadge = (res: SearchResult) => {
    const cls = res.class || '';
    const type = res.type || '';
    const raw = `${cls} ${type} ${res.display_name}`.toLowerCase();

    if (res.badge) {
      if (res.badge.toLowerCase().includes('building') || res.class === 'building') {
        return {
          label: res.badge,
          icon: Landmark,
          color: 'text-sky-400 bg-sky-950/40 border-sky-800/50',
        };
      }
      if (res.badge.toLowerCase().includes('shop') || res.class === 'shop') {
        return {
          label: res.badge,
          icon: Store,
          color: 'text-amber-400 bg-amber-950/40 border-amber-800/50',
        };
      }
    }

    if (
      cls === 'building' ||
      type === 'building' ||
      raw.includes('building') ||
      raw.includes('tower') ||
      raw.includes('center') ||
      raw.includes('hall') ||
      raw.includes('landmark')
    ) {
      return {
        label: 'Building / Landmark',
        icon: Landmark,
        color: 'text-sky-400 bg-sky-950/40 border-sky-800/50',
      };
    }

    if (cls === 'shop' || ['supermarket', 'convenience', 'clothes', 'bakery', 'chemist', 'grocer'].includes(type) || raw.includes('shop') || raw.includes('store')) {
      return {
        label: type.replace('_', ' ') || 'Shop / Retail',
        icon: Store,
        color: 'text-amber-400 bg-amber-950/40 border-amber-800/50',
      };
    }
    if (cls === 'amenity' && ['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court'].includes(type)) {
      return {
        label: type.replace('_', ' ') || 'Restaurant',
        icon: Utensils,
        color: 'text-rose-400 bg-rose-950/40 border-rose-800/50',
      };
    }
    if (type === 'mall' || raw.includes('mall') || raw.includes('shopping center') || raw.includes('plaza')) {
      return {
        label: 'Shopping Mall / Plaza',
        icon: Building2,
        color: 'text-purple-400 bg-purple-950/40 border-purple-800/50',
      };
    }
    if (
      type === 'house' ||
      type === 'residential' ||
      type === 'apartments' ||
      type === 'allotments' ||
      type === 'plot' ||
      raw.includes('subdivision') ||
      raw.includes('plot')
    ) {
      return {
        label: type.replace('_', ' ') || 'Housing / Plot',
        icon: Home,
        color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50',
      };
    }
    if (cls === 'office' || cls === 'industrial' || raw.includes('business park') || raw.includes('logistics')) {
      return {
        label: type.replace('_', ' ') || 'Commercial / Office',
        icon: Briefcase,
        color: 'text-cyan-400 bg-cyan-950/40 border-cyan-800/50',
      };
    }

    return {
      label: type.replace('_', ' ') || 'Landmark',
      icon: MapPin,
      color: 'text-slate-300 bg-slate-800 border-slate-700',
    };
  };

  const activePlaceholder = CATEGORY_TABS.find((c) => c.id === activeCategory)?.placeholder || 'Search places...';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Find Satellite Location & Points of Interest</h2>
              <p className="text-[11px] text-slate-400">
                Locate shops, restaurants, shopping malls, housing plots, and cadastral locations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-800 bg-slate-950/40 px-3 py-1.5 gap-1 scrollbar-none">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveCategory(tab.id);
                  handleSearch(undefined, undefined, tab.id);
                }}
                className={`py-1.5 px-2.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-colors shrink-0 ${
                  isActive
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Bar & Near Current Map Toggle */}
        <form onSubmit={(e) => handleSearch(e)} className="p-4 border-b border-slate-800 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={activePlaceholder}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-24 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
            </button>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <label className="flex items-center gap-2 cursor-pointer hover:text-slate-200 transition-colors">
              <input
                type="checkbox"
                checked={searchNearMap}
                onChange={(e) => setSearchNearMap(e.target.checked)}
                className="accent-cyan-500 rounded"
              />
              <span className="flex items-center gap-1">
                <Crosshair className="w-3 h-3 text-cyan-400" />
                <span>Search near current map viewport first</span>
              </span>
            </label>

            {mapCenter && (
              <span className="font-mono text-[10px] text-slate-500">
                Center: {mapCenter.lat.toFixed(4)}°, {mapCenter.lng.toFixed(4)}°
              </span>
            )}
          </div>
        </form>

        {/* Results or Presets */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs text-center">
              {errorMsg}
            </div>
          )}

          {/* Search Results List */}
          {results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                <span>Matching Places ({results.length})</span>
                <span className="text-[10px] font-normal text-slate-500 font-sans">
                  Click to fly to location · Pin icon to mark on map
                </span>
              </div>

              {results.map((res) => {
                const lat = typeof res.lat === 'number' ? res.lat : parseFloat(res.lat);
                const lng = typeof res.lon === 'number' ? res.lon : parseFloat(res.lon);
                const title = res.display_name.split(',')[0];
                const addressDetails = res.display_name.split(',').slice(1, 4).join(',').trim();
                const badge = getPlaceBadge(res);
                const BadgeIcon = badge.icon;

                // Distance from map center if available
                let distText = '';
                if (mapCenter) {
                  const d = calculateDistance(mapCenter, { lat, lng });
                  distText = formatDistance(d, unitPreference);
                }

                const isMarked = markedPinId === res.place_id;

                return (
                  <div
                    key={res.place_id}
                    onClick={() => handleSelectResult(res)}
                    className="w-full text-left p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/90 border border-slate-700/60 hover:border-cyan-500/60 transition-all flex items-start justify-between gap-3 group cursor-pointer"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-cyan-500/50 group-hover:text-cyan-400 transition-colors">
                        <BadgeIcon className="w-4 h-4 text-cyan-400" />
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-100 group-hover:text-cyan-300 transition-colors truncate">
                            {title}
                          </span>
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded border capitalize ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400 line-clamp-1 leading-tight">
                          {addressDetails || res.display_name}
                        </div>

                        {distText && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            {distText} from current center · {lat.toFixed(4)}°, {lng.toFixed(4)}°
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      {onAddMarker && (
                        <button
                          onClick={(e) => handleAddAsMarker(e, res)}
                          className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                            isMarked
                              ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                              : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                          }`}
                          title="Save this place as a survey landmark pin on your map"
                        >
                          {isMarked ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-[10px] text-emerald-400 font-semibold">Marked</span>
                            </>
                          ) : (
                            <>
                              <PlusCircle className="w-3.5 h-3.5 text-cyan-400" />
                              <span className="text-[10px]">Mark Pin</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Featured Presets */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
              Sample Survey Locations & Commercial Districts
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {PRESET_PLACES.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handleSelectPreset(preset)}
                  className="w-full text-left p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/60 transition-all flex items-center gap-2.5 group"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
                    <Compass className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-emerald-300 transition-colors">
                      {preset.name}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-mono">
                      {preset.tag}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
