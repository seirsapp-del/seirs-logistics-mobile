import { useEffect, useState } from 'react';

// Same key as useDirectionsPolyline — Directions API + Places enabled in
// the same Google Cloud project.
const MAPS_KEY = 'AIzaSyCl-9atGvhkQb9acFyVkLv9HyDMPUgjIIM';

export interface LatLng { latitude: number; longitude: number }

function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, b: number;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1); lat += dlat;
    result = 0; shift = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1); lng += dlng;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
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

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export interface MultiStopDirectionsResult {
  coords:          LatLng[];
  distanceText:    string | null;
  durationText:    string | null;
  distanceMeters:  number | null;
  durationSeconds: number | null;
  /**
   * If `optimizeWaypoints` was true, this is the order Google used. Each
   * entry is the original index of the waypoint (0..stops.length-2 for
   * intermediate stops; the destination is always last). Returned `null`
   * when optimization wasn't requested or didn't reorder anything.
   */
  waypointOrder:   number[] | null;
  /** True when Google's returned order differs from the input order. */
  wasReordered:    boolean;
}

const EMPTY: MultiStopDirectionsResult = {
  coords: [], distanceText: null, durationText: null,
  distanceMeters: null, durationSeconds: null,
  waypointOrder: null, wasReordered: false,
};

/**
 * Multi-stop road-following polyline + total distance + total ETA.
 *
 * Single Google Directions API call: the last stop becomes the destination,
 * any preceding stops are passed as `waypoints`. The response returns one
 * route with N legs (N = total stops). We sum the leg distances + durations.
 *
 * When `optimizeWaypoints=true`, the URL includes `waypoints=optimize:true|...`
 * and Google reorders the intermediate stops to find the shortest route.
 * Caller can read `waypointOrder` to reorder its local stops array.
 *
 * Replaces useDirectionsPolyline in flows that support 2+ stops — that hook
 * only knows about pickup → first-stop, so business-app's multi-stop new-
 * delivery would silently freeze the total km after the first stop got coords.
 */
export function useMultiStopDirections(
  origin: LatLng | null,
  stops:  LatLng[],
  options: {
    mode?:               'driving' | 'walking' | 'bicycling' | 'transit';
    optimizeWaypoints?:  boolean;
  } = {},
): MultiStopDirectionsResult {
  const mode = options.mode ?? 'driving';
  const optimize = options.optimizeWaypoints ?? false;
  const [result, setResult] = useState<MultiStopDirectionsResult>(EMPTY);

  // Stable cache key so the effect re-runs whenever any coord changes. Using
  // JSON.stringify for the small stop array — cheaper than restructuring the
  // dependency list.
  const stopsKey = stops.map(s => `${s.latitude},${s.longitude}`).join('|');

  useEffect(() => {
    if (!origin || stops.length === 0) { setResult(EMPTY); return; }

    let cancelled = false;
    // Optimistic Haversine fallback while the network call is in-flight, so
    // the UI updates *immediately* on stop-add instead of staring at the old
    // value until Directions returns.
    const totalKm = stops.reduce((acc, s, i) => {
      const prev = i === 0 ? origin : stops[i - 1];
      return acc + haversine(prev, s);
    }, 0);
    setResult({
      coords:          [origin, ...stops],
      distanceText:    formatKm(totalKm),
      durationText:    null,
      distanceMeters:  Math.round(totalKm * 1000),
      durationSeconds: null,
      waypointOrder:   null,
      wasReordered:    false,
    });

    (async () => {
      try {
        const destination = stops[stops.length - 1];
        const waypoints   = stops.slice(0, -1);
        // `optimize:true|` prefix tells Google to solve the TSP for us:
        // the destination stays fixed (last stop), but waypoints get
        // reordered for shortest total drive time. waypoint_order in
        // the response gives us the new order (indices into our input
        // waypoints array).
        const waypointParam = waypoints.length > 0
          ? `&waypoints=${optimize ? 'optimize:true|' : ''}` +
            waypoints.map(w => `${w.latitude},${w.longitude}`).join('|')
          : '';
        const url =
          `https://maps.googleapis.com/maps/api/directions/json` +
          `?origin=${origin.latitude},${origin.longitude}` +
          `&destination=${destination.latitude},${destination.longitude}` +
          waypointParam +
          `&mode=${mode}&key=${MAPS_KEY}`;
        const res  = await fetch(url);
        const json = await res.json();
        if (cancelled) return;
        const route = json?.routes?.[0];
        if (!route) return;

        const legs: any[] = route.legs ?? [];
        const totalMeters  = legs.reduce((acc, l) => acc + (l?.distance?.value ?? 0), 0);
        const totalSeconds = legs.reduce((acc, l) => acc + (l?.duration?.value ?? 0), 0);
        const polyline = route.overview_polyline?.points;

        // Google returns waypoint_order only when optimize:true was set.
        // It's an array of length = waypoints.length, listing the
        // ORIGINAL indices in the new visit order. The destination stays
        // last regardless. We append destination index for caller
        // convenience so the full visit order is one array.
        const rawOrder: number[] | undefined = route.waypoint_order;
        let waypointOrder: number[] | null = null;
        let wasReordered = false;
        if (optimize && Array.isArray(rawOrder)) {
          waypointOrder = [...rawOrder, stops.length - 1];
          wasReordered = rawOrder.some((origIdx, newIdx) => origIdx !== newIdx);
        }

        setResult({
          coords:          (typeof polyline === 'string' && polyline.length > 0)
                             ? decodePolyline(polyline)
                             : [origin, ...stops],
          distanceText:    totalMeters > 0 ? formatKm(totalMeters / 1000) : formatKm(totalKm),
          durationText:    totalSeconds > 0 ? formatDuration(totalSeconds) : null,
          distanceMeters:  totalMeters > 0 ? totalMeters : Math.round(totalKm * 1000),
          durationSeconds: totalSeconds > 0 ? totalSeconds : null,
          waypointOrder,
          wasReordered,
        });
      } catch { /* keep optimistic Haversine fallback */ }
    })();

    return () => { cancelled = true; };
  }, [origin?.latitude, origin?.longitude, stopsKey, mode, optimize]);

  return result;
}
