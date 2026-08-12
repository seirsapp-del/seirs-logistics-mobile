import { useEffect, useState } from 'react';
import { mapsApi } from '@/services/api';

// Directions now go through our backend (security review 2026-08-12).
// The Google key used to sit in this file, which meant it shipped inside
// the installed app where anyone could extract it and spend it on our
// account. It lives in server configuration now.

export interface LatLng {
  latitude: number;
  longitude: number;
}

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
  distanceText: string | null;
  durationText: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
}

const EMPTY: DirectionsResult = {
  coords: [], distanceText: null, durationText: null, distanceMeters: null, durationSeconds: null,
};

/**
 * Real road-following polyline + distance + ETA from Google Directions API.
 * Falls back to a straight A->B line + Haversine km if the network call fails.
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
        const json = await mapsApi.directions({
          origin:      `${from.latitude},${from.longitude}`,
          destination: `${to.latitude},${to.longitude}`,
          mode,
        });
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
      } catch { /* keep straight-line fallback */ }
    })();

    return () => { cancelled = true; };
  }, [from?.latitude, from?.longitude, to?.latitude, to?.longitude, mode]);

  return result;
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371;
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
