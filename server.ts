import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// UNIVERSAL SHARED IN-MEMORY TILE & SEARCH CACHE
// ==========================================
interface CachedTile {
  buffer: Buffer;
  contentType: string;
  timestamp: number;
  hits: number;
}

class UniversalTileCache {
  private cache = new Map<string, CachedTile>();
  private readonly maxEntries = 10000; // ~150-200MB shared in-memory tile cache
  private totalHits = 0;
  private totalMisses = 0;

  get(key: string): CachedTile | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.hits++;
      this.totalHits++;
      // LRU refresh: move to end
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry;
    }
    this.totalMisses++;
    return undefined;
  }

  set(key: string, buffer: Buffer, contentType: string) {
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      buffer,
      contentType,
      timestamp: Date.now(),
      hits: 1,
    });
  }

  getStats() {
    let bytes = 0;
    for (const item of this.cache.values()) {
      bytes += item.buffer.byteLength;
    }
    const totalRequests = this.totalHits + this.totalMisses;
    return {
      cachedTilesCount: this.cache.size,
      maxCapacity: this.maxEntries,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      hitRatio: totalRequests > 0 ? ((this.totalHits / totalRequests) * 100).toFixed(1) + '%' : '0.0%',
      memoryMB: (bytes / (1024 * 1024)).toFixed(2),
    };
  }
}

const universalTileCache = new UniversalTileCache();

// Universal Place / Shop / Building Search Cache
interface PlaceCacheEntry {
  data: any[];
  timestamp: number;
}
const universalPlaceCache = new Map<string, PlaceCacheEntry>();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Transparent 1x1 PNG fallback to protect Leaflet map from ever rendering black squares
  const TRANSPARENT_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );

  // Basemap backend configuration & status API
  app.get('/api/basemaps/config', (_req, res) => {
    const hasCarto = Boolean(process.env.CARTO_API_KEY || process.env.BASEMAP_API_KEY);
    const hasMapbox = Boolean(process.env.MAPBOX_API_KEY || process.env.MAPBOX_TOKEN);
    const hasMapTiler = Boolean(process.env.MAPTILER_API_KEY);
    const hasGeneric = Boolean(process.env.BASEMAP_API_KEY || process.env.MAP_API_KEY);

    res.json({
      status: 'ok',
      keysDetected: {
        carto: hasCarto,
        mapbox: hasMapbox,
        maptiler: hasMapTiler,
        generic: hasGeneric,
      },
      activeCartoTier: hasCarto ? 'authenticated' : 'standard',
      cacheStats: universalTileCache.getStats(),
      message: hasCarto
        ? 'CARTO Basemaps API key detected in backend environment and connected.'
        : 'Standard public basemaps active. Set CARTO_API_KEY in backend environment to connect with your key.',
    });
  });

  // Universal Cache Stats API
  app.get('/api/cache/stats', (_req, res) => {
    res.json({
      status: 'ok',
      tileCache: universalTileCache.getStats(),
      placeCacheEntries: universalPlaceCache.size,
    });
  });

  // ==========================================
  // PLACES, SHOPS & BUILDING NAMES SEARCH API
  // ==========================================
  app.get('/api/places/search', async (req, res) => {
    const query = ((req.query.q as string) || '').trim();
    const category = ((req.query.category as string) || 'all').toLowerCase();
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lon = req.query.lon ? parseFloat(req.query.lon as string) : undefined;

    if (!query) {
      return res.json({ status: 'ok', results: [] });
    }

    const cacheKey = `${query.toLowerCase()}:${category}:${lat ? lat.toFixed(2) : 'x'}:${lon ? lon.toFixed(2) : 'x'}`;
    const cached = universalPlaceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour memory cache
      return res.json({ status: 'ok', source: 'universal-cache', results: cached.data });
    }

    try {
      let results: any[] = [];

      // 1. First attempt: Photon OpenStreetMap Geocoding API (ultra-fast, excels at shop & building names)
      let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=16`;
      if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
        photonUrl += `&lat=${lat}&lon=${lon}`;
      }

      const photonRes = await fetch(photonUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'GeoMark-Studio/1.0' },
      });

      if (photonRes.ok) {
        const pData = await photonRes.json();
        if (pData.features && pData.features.length > 0) {
          results = pData.features.map((f: any, idx: number) => {
            const props = f.properties || {};
            const coords = f.geometry?.coordinates || [0, 0];
            const name = props.name || props.street || query;
            const osmKey = (props.osm_key || '').toLowerCase();
            const osmVal = (props.osm_value || '').toLowerCase();

            // Detect place type category
            let detectedCat = 'place';
            let badge = 'Place';

            if (osmKey === 'shop' || osmVal === 'supermarket' || osmVal === 'convenience' || osmVal === 'bakery' || osmVal === 'store' || osmVal === 'retail') {
              detectedCat = 'shop';
              badge = `Shop • ${osmVal || 'Retail'}`;
            } else if (osmKey === 'building' || osmVal === 'commercial' || osmVal === 'office' || osmVal === 'tower' || osmVal === 'hospital' || osmVal === 'civic') {
              detectedCat = 'building';
              badge = `Building • ${osmVal || 'Structure'}`;
            } else if (osmVal === 'restaurant' || osmVal === 'cafe' || osmVal === 'bar' || osmVal === 'fast_food') {
              detectedCat = 'restaurant';
              badge = 'Dining';
            } else if (osmVal === 'mall' || osmVal === 'department_store') {
              detectedCat = 'mall';
              badge = 'Shopping Mall';
            } else if (osmVal === 'residential' || osmVal === 'house' || osmVal === 'apartments') {
              detectedCat = 'house_plot';
              badge = 'Residential';
            }

            const addressParts = [
              props.housenumber ? `${props.housenumber} ${props.street || ''}` : props.street,
              props.city || props.town || props.village,
              props.state,
              props.country,
            ].filter(Boolean);

            return {
              id: `photon-${props.osm_id || idx}`,
              name,
              subtitle: addressParts.join(', ') || 'Global Location',
              lat: coords[1],
              lng: coords[0],
              category: detectedCat,
              badge,
              osmType: `${osmKey}=${osmVal}`,
            };
          });
        }
      }

      // 2. If Photon returned few or no results, fallback to Nominatim
      if (results.length === 0) {
        let nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&limit=15&addressdetails=1&extratags=1`;
        if (lat !== undefined && lon !== undefined) {
          nominatimUrl += `&viewbox=${lon - 0.5},${lat + 0.5},${lon + 0.5},${lat - 0.5}&bounded=0`;
        }

        const nomRes = await fetch(nominatimUrl, {
          headers: {
            'User-Agent': 'GeoMark-Studio/1.0 (officialsocyfie@gmail.com)',
            'Accept-Language': 'en',
          },
        });

        if (nomRes.ok) {
          const nData = await nomRes.json();
          results = nData.map((item: any) => {
            const rawClass = (item.class || '').toLowerCase();
            const rawType = (item.type || '').toLowerCase();

            let detectedCat = 'place';
            let badge = 'Place';

            if (rawClass === 'shop') {
              detectedCat = 'shop';
              badge = `Shop • ${rawType}`;
            } else if (rawClass === 'building' || rawClass === 'office' || rawType.includes('building') || rawType === 'tower') {
              detectedCat = 'building';
              badge = `Building • ${rawType}`;
            } else if (rawClass === 'amenity' && (rawType.includes('restaurant') || rawType.includes('cafe'))) {
              detectedCat = 'restaurant';
              badge = 'Dining';
            }

            const displayName = item.display_name || '';
            const nameParts = displayName.split(',');
            const title = nameParts[0] || query;
            const subtitle = nameParts.slice(1, 4).join(',').trim();

            return {
              id: `nom-${item.place_id}`,
              name: title,
              subtitle: subtitle || displayName,
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon),
              category: detectedCat,
              badge,
              osmType: `${rawClass}=${rawType}`,
            };
          });
        }
      }

      // Cache in universal memory
      universalPlaceCache.set(cacheKey, {
        data: results,
        timestamp: Date.now(),
      });

      res.json({
        status: 'ok',
        source: 'live-geocoding',
        results,
      });
    } catch (err) {
      console.error('[Place Search Error]:', err);
      res.status(500).json({ status: 'error', results: [] });
    }
  });

  // ==========================================
  // CARTO BASEMAPS TILE PROXY WITH UNIVERSAL CACHE
  // Supports: voyager, voyager_clean, voyager_hd (@2x), dark, dark_clean, positron, positron_clean
  // ==========================================
  app.get('/api/tiles/carto/:style/:z/:x/:y', async (req, res) => {
    const { style, z, x, y } = req.params;
    const rawKey =
      (req.query.key as string) ||
      (req.query.api_key as string) ||
      process.env.CARTO_API_KEY ||
      process.env.BASEMAP_API_KEY ||
      '';
    const cartoKey = rawKey.trim();

    // Map style names to CARTO CDN endpoint paths
    const styleAliases: Record<string, string> = {
      voyager: 'rastertiles/voyager',
      voyager_clean: 'rastertiles/voyager_nolabels',
      voyager_nolabels: 'rastertiles/voyager_nolabels',
      voyager_hd: 'rastertiles/voyager',
      dark: 'dark_all',
      dark_clean: 'dark_nolabels',
      dark_nolabels: 'dark_nolabels',
      dark_matter: 'dark_all',
      positron: 'light_all',
      positron_clean: 'light_nolabels',
      light_nolabels: 'light_nolabels',
      light: 'light_all',
      dark_all: 'dark_all',
      light_all: 'light_all',
    };
    const resolvedStyle = styleAliases[style] || style;

    // Detect if closer/cleaner High-DPI (@2x) view is requested
    const isRetina = style === 'voyager_hd' || req.query['2x'] === 'true' || y.includes('@2x');
    const cleanY = y.replace(/(@2x)?\.(png|jpg|webp)$/i, '').replace(/@2x$/i, '');

    // 1. Universal Cache Key check
    const cacheKey = `carto:${resolvedStyle}:${z}:${x}:${cleanY}${isRetina ? '@2x' : ''}`;
    const cached = universalTileCache.get(cacheKey);
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400, immutable');
      res.setHeader('X-Universal-Cache', 'HIT');
      res.setHeader('X-Cache-Hits', String(cached.hits));
      return res.send(cached.buffer);
    }

    // Load-balance across CARTO subdomains
    const subdomains = ['a', 'b', 'c', 'd'];
    const sub = subdomains[Math.abs(Number(x) + Number(cleanY)) % subdomains.length];

    const tileSuffix = isRetina ? `${cleanY}@2x.png` : `${cleanY}.png`;
    let tileUrl = `https://${sub}.basemaps.cartocdn.com/${resolvedStyle}/${z}/${x}/${tileSuffix}`;

    // CARTO basemap CDN requires ?key=YOUR_KEY
    if (cartoKey) {
      tileUrl += `?key=${encodeURIComponent(cartoKey)}&api_key=${encodeURIComponent(cartoKey)}`;
    }

    try {
      const response = await fetch(tileUrl, {
        headers: {
          'User-Agent': 'GeoMark-Studio/1.0',
          'Accept': 'image/png,image/*;q=0.8',
        },
      });

      if (!response.ok) {
        // If 403 authenticated error occurs, try fallback to non-key public tier
        if (cartoKey && response.status === 403) {
          const fallbackUrl = `https://${sub}.basemaps.cartocdn.com/${resolvedStyle}/${z}/${x}/${tileSuffix}`;
          const fallbackRes = await fetch(fallbackUrl);
          if (fallbackRes.ok) {
            const buffer = Buffer.from(await fallbackRes.arrayBuffer());
            const cType = fallbackRes.headers.get('content-type') || 'image/png';
            universalTileCache.set(cacheKey, buffer, cType);
            res.setHeader('Content-Type', cType);
            res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400, immutable');
            res.setHeader('X-Universal-Cache', 'FALLBACK-HIT');
            return res.send(buffer);
          }
        }

        // Return transparent PNG fallback to prevent Leaflet from turning black
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.send(TRANSPARENT_PNG);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/png';

      // Save in Universal Shared Cache for all users
      universalTileCache.set(cacheKey, buffer, contentType);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400, immutable');
      res.setHeader('X-Universal-Cache', 'MISS-STORED');
      res.send(buffer);
    } catch (err) {
      console.error('[CARTO Proxy Error]:', err);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(TRANSPARENT_PNG);
    }
  });

  // Universal tile proxy for other providers (Mapbox, MapTiler, etc.) with Universal Cache
  app.get('/api/tiles/:provider/:style/:z/:x/:y', async (req, res) => {
    const { provider, style, z, x, y } = req.params;
    const cleanY = y.replace(/\.(png|jpg|webp)$/i, '');

    const cacheKey = `${provider}:${style}:${z}:${x}:${cleanY}`;
    const cached = universalTileCache.get(cacheKey);
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400, immutable');
      res.setHeader('X-Universal-Cache', 'HIT');
      return res.send(cached.buffer);
    }

    let tileUrl = '';
    if (provider === 'maptiler') {
      const key = process.env.MAPTILER_API_KEY || process.env.BASEMAP_API_KEY || '';
      tileUrl = `https://api.maptiler.com/maps/${style}/${z}/${x}/${cleanY}.jpg?key=${encodeURIComponent(key.trim())}`;
    } else if (provider === 'mapbox') {
      const token = process.env.MAPBOX_API_KEY || process.env.MAPBOX_TOKEN || process.env.BASEMAP_API_KEY || '';
      tileUrl = `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/256/${z}/${x}/${cleanY}?access_token=${encodeURIComponent(token.trim())}`;
    } else {
      return res.status(400).send('Unsupported tile provider');
    }

    try {
      const response = await fetch(tileUrl);
      if (!response.ok) {
        res.setHeader('Content-Type', 'image/png');
        return res.send(TRANSPARENT_PNG);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      universalTileCache.set(cacheKey, buffer, contentType);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400, immutable');
      res.setHeader('X-Universal-Cache', 'MISS-STORED');
      res.send(buffer);
    } catch (err) {
      console.error(`[${provider} Proxy Error]:`, err);
      res.setHeader('Content-Type', 'image/png');
      res.send(TRANSPARENT_PNG);
    }
  });

  // Mount Vite middleware in development or serve dist in production
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[GeoMark Studio Server] Ready on port ${PORT}`);
    const hasCarto = Boolean(process.env.CARTO_API_KEY || process.env.BASEMAP_API_KEY);
    if (hasCarto) {
      console.log('[GeoMark Studio Server] CARTO Basemaps API key detected. Universal shared cache active.');
    }
  });
}

startServer().catch((err) => {
  console.error('[GeoMark Studio Server Fatal Error]:', err);
});
