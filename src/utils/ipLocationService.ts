import { UserLocation } from '../types';

export interface IpLocationResult {
  location: UserLocation;
  city: string;
  region: string;
  country: string;
}

/**
 * High-reliability IP-based geolocation fallback.
 * Works without browser permissions, within iframes, and across all origins.
 */
export async function fetchIpLocation(): Promise<IpLocationResult> {
  // 1. Try local serverless / backend endpoint first
  try {
    const res = await fetch('/api/location/ip');
    if (res.ok) {
      const data = await res.json();
      if (data.lat && data.lng) {
        return {
          location: {
            lat: data.lat,
            lng: data.lng,
            accuracy: data.accuracy || 3500,
            timestamp: Date.now(),
            source: 'ip',
            cityName: `${data.city || 'Local Area'}${data.region ? `, ${data.region}` : ''}`,
          },
          city: data.city || '',
          region: data.region || '',
          country: data.country || '',
        };
      }
    }
  } catch {
    // Proceed to client-side direct providers
  }

  // 2. Direct client fallback 1: ipwho.is (fast, HTTPS, CORS enabled)
  try {
    const res = await fetch('https://ipwho.is/');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.latitude && data.longitude) {
        const cityName = `${data.city || ''}${data.region ? `, ${data.region}` : ''}`.trim();
        return {
          location: {
            lat: data.latitude,
            lng: data.longitude,
            accuracy: 3500,
            timestamp: Date.now(),
            source: 'ip',
            cityName: cityName || 'Approximate Location',
          },
          city: data.city || '',
          region: data.region || '',
          country: data.country || '',
        };
      }
    }
  } catch {
    // Proceed to fallback 2
  }

  // 3. Direct client fallback 2: freeipapi.com
  try {
    const res = await fetch('https://freeipapi.com/api/json');
    if (res.ok) {
      const data = await res.json();
      if (data.latitude && data.longitude) {
        const cityName = `${data.cityName || ''}${data.regionName ? `, ${data.regionName}` : ''}`.trim();
        return {
          location: {
            lat: data.latitude,
            lng: data.longitude,
            accuracy: 4000,
            timestamp: Date.now(),
            source: 'ip',
            cityName: cityName || 'Approximate Location',
          },
          city: data.cityName || '',
          region: data.regionName || '',
          country: data.countryName || '',
        };
      }
    }
  } catch {
    // Final error
  }

  throw new Error('Unable to determine location from IP.');
}
