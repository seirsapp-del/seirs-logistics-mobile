import { Injectable, Logger } from '@nestjs/common';

// Spec V8 §2 — multi-drop route optimisation. Pure TSP is NP-hard;
// a greedy nearest-neighbour heuristic gives ~25% worse than optimal
// on average but completes in O(n²) which is fine for n ≤ 50 stops
// (vehicle drop caps in spec). Recalculates per drop + on traffic
// shifts >15%.
//
// Real-world this would call Google Directions API for time-aware
// distances; this service gives the haversine-based skeleton that
// the matching/dispatch layer can call now and swap to Directions
// later without API surface change.

export interface Stop {
  id:    string;
  lat:   number;
  lng:   number;
  label?: string;
}

interface OptimizedRoute {
  ordered:        Stop[];
  totalDistanceKm: number;
  legCount:       number;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

@Injectable()
export class MultiDropRoutingService {
  private readonly logger = new Logger(MultiDropRoutingService.name);

  // Greedy nearest-neighbour TSP. Start at `pickup`, repeatedly visit
  // the nearest unvisited stop until none remain.
  optimize(pickup: Stop, drops: Stop[]): OptimizedRoute {
    if (drops.length === 0) {
      return { ordered: [pickup], totalDistanceKm: 0, legCount: 0 };
    }

    const remaining = [...drops];
    const ordered: Stop[] = [pickup];
    let totalKm = 0;

    let cursor = pickup;
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversineKm(cursor.lat, cursor.lng, remaining[i].lat, remaining[i].lng);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      ordered.push(next);
      totalKm += bestDist;
      cursor = next;
    }

    return {
      ordered,
      totalDistanceKm: Math.round(totalKm * 10) / 10,
      legCount:        ordered.length - 1,
    };
  }

  // Recalculate when traffic shifts >15% — swap remaining unvisited
  // stops to the new optimal order based on current driver position.
  recomputeFromCurrentPosition(currentLat: number, currentLng: number, remainingStops: Stop[]): OptimizedRoute {
    return this.optimize(
      { id: '__driver__', lat: currentLat, lng: currentLng, label: 'Current location' },
      remainingStops,
    );
  }
}
