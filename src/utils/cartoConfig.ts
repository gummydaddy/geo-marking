// CARTO Basemaps Client Configuration & Direct CDN Resolver for Vercel & Node
export const LOCAL_STORAGE_CARTO_KEY = 'geomark_carto_api_key';

export function getEffectiveCartoKey(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(LOCAL_STORAGE_CARTO_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
  }

  const envKey =
    (import.meta.env.VITE_CARTO_API_KEY as string) ||
    (import.meta.env.VITE_BASEMAP_API_KEY as string) ||
    '';

  return envKey.trim();
}

export function setStoredCartoKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (key.trim()) {
      localStorage.setItem(LOCAL_STORAGE_CARTO_KEY, key.trim());
    } else {
      localStorage.removeItem(LOCAL_STORAGE_CARTO_KEY);
    }
    window.dispatchEvent(new Event('carto-key-updated'));
  }
}

export function clearStoredCartoKey(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LOCAL_STORAGE_CARTO_KEY);
    window.dispatchEvent(new Event('carto-key-updated'));
  }
}

const CARTO_CDN_STYLES: Record<string, string> = {
  carto_voyager: 'rastertiles/voyager',
  carto_voyager_clean: 'rastertiles/voyager_nolabels',
  carto_voyager_hd: 'rastertiles/voyager',
  carto_dark: 'dark_all',
  carto_dark_clean: 'dark_nolabels',
  carto_positron: 'light_all',
  carto_positron_clean: 'light_nolabels',
};

/**
 * Resolves optimal tile URL for CARTO basemaps.
 * If client has CARTO_API_KEY (from Vercel env or localStorage), uses high-speed direct CARTO CDN.
 * Otherwise, falls back to the server proxy (/api/tiles/carto/...).
 */
export function resolveCartoTileConfig(basemapId: string): {
  url: string;
  subdomains: string[];
  isDirect: boolean;
  hasKey: boolean;
} {
  const key = getEffectiveCartoKey();
  const cdnStyle = CARTO_CDN_STYLES[basemapId];

  // If we have a direct key and style is recognized, route directly to CARTO's CDN
  if (key && cdnStyle) {
    const isRetina = basemapId === 'carto_voyager_hd';
    const tileSuffix = isRetina ? '@2x.png' : '.png';
    const url = `https://{s}.basemaps.cartocdn.com/${cdnStyle}/{z}/{x}/{y}${tileSuffix}?key=${encodeURIComponent(
      key
    )}&api_key=${encodeURIComponent(key)}`;

    return {
      url,
      subdomains: ['a', 'b', 'c', 'd'],
      isDirect: true,
      hasKey: true,
    };
  }

  // Fallback to internal backend / serverless proxy
  const proxyStyle = basemapId.replace(/^carto_/, '');
  return {
    url: `/api/tiles/carto/${proxyStyle}/{z}/{x}/{y}`,
    subdomains: ['a', 'b', 'c', 'd'],
    isDirect: false,
    hasKey: Boolean(key),
  };
}

/**
 * Quick validation helper to test if a CARTO key works against CARTO CDN.
 */
export async function testCartoKey(keyToTest: string): Promise<{ success: boolean; message: string }> {
  const cleanKey = keyToTest.trim();
  if (!cleanKey) {
    return { success: false, message: 'Please enter a valid CARTO API key.' };
  }

  try {
    const testUrl = `https://a.basemaps.cartocdn.com/rastertiles/voyager/15/5241/12665.png?key=${encodeURIComponent(
      cleanKey
    )}`;
    const res = await fetch(testUrl);

    if (res.ok) {
      const etag = res.headers.get('etag') || '';
      // If etag starts with wm-, CARTO attached an "api key required" watermark
      if (etag.includes('wm-')) {
        return {
          success: false,
          message: 'Key reached CARTO, but watermark was returned. Check key permissions or quota.',
        };
      }
      return { success: true, message: 'CARTO API Key verified and active! High-res tiles connected.' };
    } else if (res.status === 403) {
      return { success: false, message: 'CARTO responded with 403 Forbidden. Key may be invalid or expired.' };
    } else {
      return { success: false, message: `CARTO returned HTTP ${res.status}.` };
    }
  } catch (err) {
    return { success: false, message: `Network error verifying CARTO key: ${(err as Error).message}` };
  }
}
