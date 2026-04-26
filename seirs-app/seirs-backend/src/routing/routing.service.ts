import { Injectable } from '@nestjs/common';

export interface LatLng { lat: number; lng: number; label?: string; }

export interface RouteStop extends LatLng {
  index: number;    // original index in the input array
  order: number;    // optimized position in the route
  distanceFromPrev: number; // km from the previous stop
}

export interface OptimizedRoute {
  stops:         RouteStop[];
  totalDistanceKm: number;
  estimatedMinutes: number; // rough estimate at 30 km/h average
}

@Injectable()
export class RoutingService {

  // ── Nearest-Neighbour TSP approximation ─────────────────────────────────────
  // Complexity: O(n²) — practical for up to ~100 stops.
  // Returns stops in visit order, starting from index 0 (first stop is the origin).
  optimizeRoute(stops: LatLng[]): OptimizedRoute {
    if (stops.length === 0) return { stops: [], totalDistanceKm: 0, estimatedMinutes: 0 };
    if (stops.length === 1) {
      return {
        stops: [{ ...stops[0], index: 0, order: 0, distanceFromPrev: 0 }],
        totalDistanceKm: 0,
        estimatedMinutes: 0,
      };
    }

    const n = stops.length;
    const visited = new Array(n).fill(false);
    const route: number[] = [0];
    visited[0] = true;

    // Greedily pick the nearest unvisited stop
    for (let step = 1; step < n; step++) {
      const current = route[route.length - 1];
      let bestIdx  = -1;
      let bestDist = Infinity;

      for (let j = 0; j < n; j++) {
        if (visited[j]) continue;
        const d = this.haversine(stops[current].lat, stops[current].lng, stops[j].lat, stops[j].lng);
        if (d < bestDist) { bestDist = d; bestIdx = j; }
      }

      route.push(bestIdx);
      visited[bestIdx] = true;
    }

    // Build result
    let totalKm = 0;
    const resultStops: RouteStop[] = route.map((originalIdx, order) => {
      const prev = order > 0 ? stops[route[order - 1]] : null;
      const distFromPrev = prev
        ? this.haversine(prev.lat, prev.lng, stops[originalIdx].lat, stops[originalIdx].lng)
        : 0;
      totalKm += distFromPrev;

      return {
        ...stops[originalIdx],
        index:            originalIdx,
        order,
        distanceFromPrev: Math.round(distFromPrev * 100) / 100,
      };
    });

    return {
      stops:           resultStops,
      totalDistanceKm: Math.round(totalKm * 100) / 100,
      estimatedMinutes: Math.round((totalKm / 30) * 60), // 30 km/h average
    };
  }

  // Estimate ETA for a driver at (driverLat, driverLng) to reach (destLat, destLng)
  estimateEta(driverLat: number, driverLng: number, destLat: number, destLng: number): number {
    const km = this.haversine(driverLat, driverLng, destLat, destLng);
    return Math.ceil((km / 30) * 60); // minutes at 30 km/h
  }

  // ── Haversine ───────────────────────────────────────────────────────────────
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
