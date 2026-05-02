import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LatLng { lat: number; lng: number; label?: string; }

export interface RouteStop extends LatLng {
  index: number;    // original index in the input array
  order: number;    // optimized position in the route
  distanceFromPrev: number; // km from the previous stop
}

export interface OptimizedRoute {
  stops:            RouteStop[];
  totalDistanceKm:  number;
  estimatedMinutes: number;
  /** True when the result came from Google Directions API; false when we fell back to haversine. */
  fromGoogle:       boolean;
}

interface DirectionsLeg {
  distance: { value: number };  // metres
  duration: { value: number };  // seconds
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly apiKey: string;

  constructor(private readonly cfg: ConfigService) {
    this.apiKey = this.cfg.get<string>('GOOGLE_MAPS_API_KEY') ?? '';
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY not set — routing will fall back to haversine distance.');
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Optimise route across stops using nearest-neighbour TSP, then call
   * Google Directions API to get accurate driving distance + duration
   * for the optimised order. Falls back to haversine + 30 km/h estimate
   * when the API key is missing or the call fails.
   */
  async optimizeRoute(stops: LatLng[]): Promise<OptimizedRoute> {
    if (stops.length === 0) return { stops: [], totalDistanceKm: 0, estimatedMinutes: 0, fromGoogle: false };
    if (stops.length === 1) {
      return {
        stops: [{ ...stops[0], index: 0, order: 0, distanceFromPrev: 0 }],
        totalDistanceKm: 0,
        estimatedMinutes: 0,
        fromGoogle: false,
      };
    }

    // Nearest-neighbour ordering — uses haversine for the comparison
    // (still our best option without paying for the Distance Matrix API).
    const order = this.nearestNeighbourOrder(stops);

    // Build the ordered stop list
    const orderedStops = order.map(i => stops[i]);

    // Try Google Directions API for accurate driving distance/duration
    if (this.apiKey && orderedStops.length >= 2) {
      try {
        const legs = await this.fetchDirectionsLegs(orderedStops);
        if (legs && legs.length === orderedStops.length - 1) {
          let totalMetres  = 0;
          let totalSeconds = 0;
          const result: RouteStop[] = orderedStops.map((s, idx) => {
            const distFromPrev = idx === 0 ? 0 : legs[idx - 1].distance.value / 1000;
            if (idx > 0) {
              totalMetres  += legs[idx - 1].distance.value;
              totalSeconds += legs[idx - 1].duration.value;
            }
            return {
              ...s,
              index:            order[idx],
              order:            idx,
              distanceFromPrev: Math.round(distFromPrev * 100) / 100,
            };
          });
          return {
            stops:            result,
            totalDistanceKm:  Math.round((totalMetres / 1000) * 100) / 100,
            estimatedMinutes: Math.ceil(totalSeconds / 60),
            fromGoogle:       true,
          };
        }
      } catch (err) {
        this.logger.warn(`Google Directions API failed, falling back: ${(err as Error).message}`);
      }
    }

    // Fallback: haversine + 30 km/h estimate
    let totalKm = 0;
    const resultStops: RouteStop[] = orderedStops.map((s, idx) => {
      const prev = idx > 0 ? orderedStops[idx - 1] : null;
      const distFromPrev = prev ? this.haversine(prev.lat, prev.lng, s.lat, s.lng) : 0;
      totalKm += distFromPrev;
      return {
        ...s,
        index:            order[idx],
        order:            idx,
        distanceFromPrev: Math.round(distFromPrev * 100) / 100,
      };
    });
    return {
      stops:            resultStops,
      totalDistanceKm:  Math.round(totalKm * 100) / 100,
      estimatedMinutes: Math.round((totalKm / 30) * 60),
      fromGoogle:       false,
    };
  }

  /**
   * Estimate ETA in minutes for a driver to reach a destination.
   * Uses Google Directions when available, falls back to haversine + 30 km/h.
   */
  async estimateEta(driverLat: number, driverLng: number, destLat: number, destLng: number): Promise<number> {
    if (this.apiKey) {
      try {
        const legs = await this.fetchDirectionsLegs([
          { lat: driverLat, lng: driverLng },
          { lat: destLat,   lng: destLng   },
        ]);
        if (legs?.[0]) return Math.ceil(legs[0].duration.value / 60);
      } catch { /* fallback */ }
    }
    const km = this.haversine(driverLat, driverLng, destLat, destLng);
    return Math.ceil((km / 30) * 60);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private nearestNeighbourOrder(stops: LatLng[]): number[] {
    const n = stops.length;
    const visited = new Array(n).fill(false);
    const order: number[] = [0];
    visited[0] = true;
    for (let step = 1; step < n; step++) {
      const current = order[order.length - 1];
      let bestIdx = -1, bestDist = Infinity;
      for (let j = 0; j < n; j++) {
        if (visited[j]) continue;
        const d = this.haversine(stops[current].lat, stops[current].lng, stops[j].lat, stops[j].lng);
        if (d < bestDist) { bestDist = d; bestIdx = j; }
      }
      order.push(bestIdx);
      visited[bestIdx] = true;
    }
    return order;
  }

  /**
   * Hits the Google Directions API once for an entire ordered route.
   * Returns the `legs` array (one leg per consecutive pair of stops).
   * `waypoints=` is used so we don't pay per-leg.
   */
  private async fetchDirectionsLegs(orderedStops: LatLng[]): Promise<DirectionsLeg[] | null> {
    const origin       = `${orderedStops[0].lat},${orderedStops[0].lng}`;
    const destination  = `${orderedStops[orderedStops.length - 1].lat},${orderedStops[orderedStops.length - 1].lng}`;
    const waypoints    = orderedStops.slice(1, -1)
      .map(s => `${s.lat},${s.lng}`)
      .join('|');

    const params = new URLSearchParams({
      origin,
      destination,
      mode:           'driving',
      departure_time: 'now',     // enables traffic-aware duration
      key:            this.apiKey,
    });
    if (waypoints) params.set('waypoints', waypoints);

    const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Directions API HTTP ${res.status}`);
    const data: any = await res.json();
    if (data.status !== 'OK') {
      throw new Error(`Directions API status ${data.status}: ${data.error_message ?? 'unknown'}`);
    }
    return data.routes?.[0]?.legs ?? null;
  }

  // ── Haversine fallback ───────────────────────────────────────────────────
  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
