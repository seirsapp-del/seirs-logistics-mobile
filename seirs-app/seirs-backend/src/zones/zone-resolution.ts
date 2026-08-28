import type { Zone, ZoneStatus } from './zone.entity';
import { isZoneActiveAt } from './zone-window';
import { shapeContains, zoneOrdering, type ZonePoint } from './zone-geometry';

export type ZoneEnd = 'pickup' | 'dropoff';

export interface ZoneRefusal {
  zoneId:   string;
  zoneName: string;
  status:   ZoneStatus;
  reason:   string;
  end:      ZoneEnd;
  /** Present only on a vehicle-ban refusal, so the app can offer another class. */
  vehicleType?: string;
}

export interface ZoneNotice {
  zoneId:        string;
  zoneName:      string;
  reason:        string;
  end:           ZoneEnd;
  surchargePct:  number;
  rateMultiplier?: number;
}

export interface ZoneDecision {
  /** Set when the job is refused outright. Money must not be calculated after this. */
  refusal: ZoneRefusal | null;
  /** Multiplier from the winning PICKUP zone, or null when no zone supplies one. */
  rateMultiplier: number | null;
  /** Pump override from the winning PICKUP zone. */
  fuelPriceOverride: { petrolNgn?: number; dieselNgn?: number } | null;
  /** Summed across the winning zone at EACH end. */
  surchargePct: number;
  /** Every zone that changed this quote, named, with its reason. */
  notices: ZoneNotice[];
  /** Ids of every active zone touching the job, for logging and the admin preview. */
  pickupZoneIds:  string[];
  dropoffZoneIds: string[];
}

export const EMPTY_ZONE_DECISION: ZoneDecision = {
  refusal: null,
  rateMultiplier: null,
  fuelPriceOverride: null,
  surchargePct: 0,
  notices: [],
  pickupZoneIds: [],
  dropoffZoneIds: [],
};

/** Does this status refuse work at THIS end? The two one-way statuses are not symmetrical. */
function refusesAt(status: ZoneStatus, end: ZoneEnd): boolean {
  if (status === 'closed') return true;
  if (end === 'pickup')  return status === 'no_pickup';
  return status === 'no_dropoff';
}

/**
 * Order among refusals, when several apply at once.
 *
 * A total closure outranks a one-way block, because it is the stronger
 * statement about the same ground and the more useful thing to tell the
 * sender. Below that it is the ordinary priority then smallest-shape
 * ordering, purely so the message is stable rather than whichever row
 * the database happened to return first.
 */
function refusalOrdering(a: Zone, b: Zone): number {
  const sev = (z: Zone) => (z.status === 'closed' ? 0 : 1);
  const s = sev(a) - sev(b);
  if (s !== 0) return s;
  return zoneOrdering(a, b);
}

function reasonFor(zone: Zone): string {
  const named = (zone.reason ?? '').trim();
  if (named) return named;
  // A refusal with no reason reads as a broken app, so there is always
  // something to say even when the admin left the field empty.
  switch (zone.status) {
    case 'closed':     return zone.name + ' is closed to all SEIRS operations right now.';
    case 'no_pickup':  return 'Collections from ' + zone.name + ' are suspended right now. Deliveries into it still work.';
    case 'no_dropoff': return 'Deliveries into ' + zone.name + ' are suspended right now. Collections from it still work.';
    default:           return zone.name + ' pricing applies to this job.';
  }
}

/**
 * The whole zone engine, as a pure function over already-loaded rows.
 *
 * The ORDER below is the specification, not an implementation detail:
 *
 *  1. resolve zones at BOTH ends. The old engine called resolveRegion
 *     twice and passed the pickup both times, so the destination's zone
 *     did not exist as a concept anywhere in pricing.
 *  2. block check FIRST, before a single naira is calculated. A closed
 *     area never produces a price, so there is nothing to display, cache
 *     or replay later.
 *  3. vehicle bans, which are refusals too and are checked the same way.
 *  4. only then effects.
 *
 * Overlap: any blocking status wins outright regardless of priority,
 * because a closure is a safety statement and must never be outvoted by
 * a pricing rule. Among non-blocking zones the highest priority wins and
 * ties break to the SMALLEST shape, which is how the existing hotspot
 * circles already behave.
 */
export function resolveZoneDecision(input: {
  zones: Zone[];
  pickup: ZonePoint;
  dropoff: ZonePoint | null;
  vehicleType?: string | null;
  /** The instant that matters: the scheduled time for a scheduled job, otherwise now. */
  at: Date;
  utcOffsetMinutes: number;
}): ZoneDecision {
  const { zones, pickup, dropoff, vehicleType, at, utcOffsetMinutes } = input;

  const activeAt = (point: ZonePoint | null): Zone[] => {
    if (!point) return [];
    return zones.filter(z =>
      shapeContains(z.shape, point) &&
      isZoneActiveAt(z.active, z.status, at, utcOffsetMinutes));
  };

  const atPickup  = activeAt(pickup);
  const atDropoff = activeAt(dropoff);

  const decision: ZoneDecision = {
    refusal: null,
    rateMultiplier: null,
    fuelPriceOverride: null,
    surchargePct: 0,
    notices: [],
    pickupZoneIds:  atPickup.map(z => z.id),
    dropoffZoneIds: atDropoff.map(z => z.id),
  };

  const ends: Array<{ end: ZoneEnd; list: Zone[] }> = [
    { end: 'pickup',  list: atPickup  },
    { end: 'dropoff', list: atDropoff },
  ];

  // 2. Blocks, before any money. Pickup is reported first when both ends
  // fail: it is the end the sender is standing at and the one they can
  // most easily change.
  for (const entry of ends) {
    const blockers = entry.list.filter(z => refusesAt(z.status, entry.end)).sort(refusalOrdering);
    if (blockers.length > 0) {
      const z = blockers[0];
      decision.refusal = {
        zoneId: z.id, zoneName: z.name, status: z.status,
        reason: reasonFor(z), end: entry.end,
      };
      return decision;
    }
  }

  // 3. Vehicle bans. Also immune to priority: banning a truck from a
  // market street is the same kind of statement as closing it, narrower.
  if (vehicleType) {
    for (const entry of ends) {
      const banned = entry.list
        .filter(z => Array.isArray(z.effects && z.effects.vehicleBans)
          && z.effects.vehicleBans.indexOf(vehicleType) >= 0)
        .sort(zoneOrdering);
      if (banned.length > 0) {
        const z = banned[0];
        decision.refusal = {
          zoneId: z.id, zoneName: z.name, status: z.status, end: entry.end, vehicleType,
          reason: (z.reason ?? '').trim()
            || (vehicleType + ' cannot operate in ' + z.name + '. Choose another vehicle.'),
        };
        return decision;
      }
    }
  }

  // 4. Effects.
  const pickupWinner  = atPickup.slice().sort(zoneOrdering)[0]  ?? null;
  const dropoffWinner = atDropoff.slice().sort(zoneOrdering)[0] ?? null;

  // Multiplier and fuel come from the PICKUP zone, which is where the
  // rider starts, fuels and is paid from, matching how the card's own
  // region resolution has always worked. Under 1.0 is a real setting and
  // not a mistake: some corridors cost less to serve, and a discount is
  // also how demand gets seeded somewhere new.
  if (pickupWinner) {
    const m = Number(pickupWinner.effects && pickupWinner.effects.rateMultiplier);
    if (Number.isFinite(m) && m > 0) decision.rateMultiplier = m;

    const fuel = pickupWinner.effects && pickupWinner.effects.fuelPriceOverride;
    if (fuel && (Number(fuel.petrolNgn) > 0 || Number(fuel.dieselNgn) > 0)) {
      decision.fuelPriceOverride = {};
      if (Number(fuel.petrolNgn) > 0) decision.fuelPriceOverride.petrolNgn = Number(fuel.petrolNgn);
      if (Number(fuel.dieselNgn) > 0) decision.fuelPriceOverride.dieselNgn = Number(fuel.dieselNgn);
    }
  }

  // Surcharges come from BOTH ends and are summed: a job that starts in
  // one difficult area and finishes in another is two lots of difficulty.
  const winners: Array<[ZoneEnd, Zone | null]> = [
    ['pickup',  pickupWinner],
    ['dropoff', dropoffWinner],
  ];
  for (const pair of winners) {
    const end = pair[0];
    const winner = pair[1];
    if (!winner) continue;
    const pct = Number(winner.effects && winner.effects.surchargePct);
    const hasPct = Number.isFinite(pct) && pct !== 0;
    const mult = Number(winner.effects && winner.effects.rateMultiplier);
    if (hasPct) decision.surchargePct += pct;

    /**
     * A notice is raised for ANY non-zero surcharge, and for anything the
     * admin marked 'surcharged' whatever the numbers say. The founder's
     * rule is that an uplift is never silent, so disclosure is driven by
     * money actually moving rather than by the label, and the label alone
     * is enough to force a line when the uplift rides on the multiplier.
     *
     * A plain 'open' zone raises nothing, which is the point of it: a
     * cheaper corridor and a quietly dearer one both work with no line
     * on the quote.
     */
    if (hasPct || winner.status === 'surcharged') {
      const notice: ZoneNotice = {
        zoneId: winner.id,
        zoneName: winner.name,
        reason: reasonFor(winner),
        end,
        surchargePct: hasPct ? pct : 0,
      };
      if (end === 'pickup' && Number.isFinite(mult) && mult > 0 && mult !== 1) {
        notice.rateMultiplier = mult;
      }
      decision.notices.push(notice);
    }
  }

  return decision;
}
