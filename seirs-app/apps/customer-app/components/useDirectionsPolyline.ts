import { useEffect, useState } from 'react';

// Android Maps key — also has Directions + Places APIs enabled in the
// Google Cloud project. (The previous key here returned REQUEST_DENIED.)
const MAPS_KEY = 'AIzaSyCl-9atGvhkQb9acFyVkLv9HyDMPUgjIIM';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Decode a Google encoded polyline string into an array of {latitude, longitude}.
 * Standard algorithm — see https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 *
 * Implemented inline (rather than pulling @mapbox/polyline) to keep the
 * dependency surface small.
 */
function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

export interface DirectionsResult {
  coords:       LatLng[];
  /** Human-readable distance, e.g. "12 km" or "850 m". null until first response. */
  distanceText: string | null;
  /** Human-readable duration, e.g. "18 min". null until first response. */
  durationText: string | null;
  /** Raw distance in metres — useful for fare calc. */
  distanceMeters: number | null;
  /** Raw duration in seconds. */
  durationSeconds: number | null;
}

const EMPTY: DirectionsResult = {
  coords: [], distanceText: null, durationText: null, distanceMeters: null, durationSeconds: null,
};

/**
 * Hook that fetches a real road-following route + distance + duration from
 * the Google Directions API between two points.
 *
 * Falls back to a straight A->B line (and Haversine distance) if the API
 * call fails so the map never shows nothing.
 *
 * Usage:
 *
 *   const { coords, distanceText, durationText } = useDirectionsPolyline(pickup, dropoff, 'driving');
 *   <Polyline coordinates={coords} ... />
 */
export function useDirectionsPolyline(
  from: LatLng | null,
  to:   LatLng | null,
  mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving',
): DirectionsResult {
  const [result, setResult] = useState<DirectionsResult>(EMPTY);

  useEffect(() => {
    if (!from || !to) { setResult(EMPTY); return; }

    let cancelled = false;
    // Straight-line fallback so the map immediately has something.
    const haversineKm = haversine(from, to);
    setResult({
      coords: [from, to],
      distanceText:    formatKm(haversineKm),
      durationText:    null,
      distanceMeters:  Math.round(haversineKm * 1000),
      durationSeconds: null,
    });

    (async () => {
      try {
        const url =
          `https://maps.googleapis.com/maps/api/directions/json` +
          `?origin=${from.latitude},${from.longitude}` +
          `&destination=${to.latitude},${to.longitude}` +
          `&mode=${mode}` +
          `&key=${MAPS_KEY}`;

        const res  = await fetch(url);
        const json = await res.json();
        if (cancelled) return;

        const route = json?.routes?.[0];
        const leg   = route?.legs?.[0];
        const polyline = route?.overview_polyline?.points;

        setResult({
          coords:          (typeof polyline === 'string' && polyline.length > 0)
                             ? decodePolyline(polyline)
                             : [from, to],
          distanceText:    leg?.distance?.text ?? formatKm(haversineKm),
          durationText:    leg?.duration?.text ?? null,
          distanceMeters:  leg?.distance?.value ?? Math.round(haversineKm * 1000),
          durationSeconds: leg?.duration?.value ?? null,
        });
      } catch {
        // Network failure -> keep the straight-line fallback already set.
      }
    })();

    return () => { cancelled = true; };
  }, [from?.latitude, from?.longitude, to?.latitude, to?.longitude, mode]);

  return result;
}

// ── small helpers ──────────────────────────────────────────────────────────
function haversine(a: LatLng, b: LatLng): number {
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude  - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
