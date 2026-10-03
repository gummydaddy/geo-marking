import { UserLocation, UnitSystem } from '../types';

export interface GeolocationState {
  location: UserLocation | null;
  isTracking: boolean;
  isLocating: boolean;
  error: string | null;
}

let watchId: number | null = null;

/**
 * Start watching high-accuracy real-time user geolocation
 */
export function startLocationWatch(
  onUpdate: (loc: UserLocation) => void,
  onError: (errMessage: string) => void
): boolean {
  if (!navigator.geolocation) {
    onError('Geolocation is not supported by your browser.');
    return false;
  }

  // Clear any existing watch
  stopLocationWatch();

  try {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const userLoc: UserLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          altitude: pos.coords.altitude,
          timestamp: pos.timestamp,
        };
        onUpdate(userLoc);
      },
      (err) => {
        let msg = 'Failed to acquire location.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission was denied. Please allow location access in your browser settings.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Location information is currently unavailable.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Location request timed out. Retrying...';
        }
        onError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 1000,
      }
    );
    return true;
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown geolocation error';
    onError(errorMsg);
    return false;
  }
}

/**
 * Stop watching geolocation
 */
export function stopLocationWatch(): void {
  if (watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

/**
 * Request single immediate high-accuracy position fix
 */
export function getSinglePositionFix(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported by your browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          altitude: pos.coords.altitude,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        reject(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  });
}

/**
 * Format location accuracy for display
 */
export function formatAccuracy(meters: number, unitPreference: UnitSystem): string {
  if (unitPreference === 'imperial') {
    const feet = Math.round(meters * 3.28084);
    return `±${feet} ft`;
  }
  return `±${Math.round(meters)} m`;
}
