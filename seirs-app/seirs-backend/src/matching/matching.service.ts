import { Injectable, Logger } from '@nestjs/common';
import { FeesService } from '../fees/fees.service';
import { ConfigService } from '@nestjs/config';
import { Driver, VehicleType } from '../drivers/driver.entity';
import { Delivery, PackageSize, UrgencyLevel } from '../deliveries/delivery.entity';
import { DriversService } from '../drivers/drivers.service';
import { PricingService } from '../deliveries/pricing.service';

// Spec V8 §3.9 - this default will move into the Fee Catalogue once that
// module ships, so admins can adjust it live without a redeploy. For now,
// override via MATCHING_RADIUS_KM env var in Railway.
const DEFAULT_MATCHING_RADIUS_KM = 15;

// ─── Vehicle suitability matrix ──────────────────────────────────────────────
// Which vehicles can carry which package sizes (1 = yes, 0 = no)
const VEHICLE_SUITABILITY: Record<VehicleType, Record<PackageSize, number>> = {
  [VehicleType.BICYCLE]:     { [PackageSize.SMALL]: 1, [PackageSize.MEDIUM]: 0.3, [PackageSize.LARGE]: 0   },
  [VehicleType.MOTORCYCLE]:  { [PackageSize.SMALL]: 1, [PackageSize.MEDIUM]: 0.8, [PackageSize.LARGE]: 0.2 },
  [VehicleType.TRICYCLE]:    { [PackageSize.SMALL]: 1, [PackageSize.MEDIUM]: 1,   [PackageSize.LARGE]: 0.7 },
  [VehicleType.CAR]:         { [PackageSize.SMALL]: 1, [PackageSize.MEDIUM]: 1,   [PackageSize.LARGE]: 0.8 },
  [VehicleType.VAN]:         { [PackageSize.SMALL]: 1, [PackageSize.MEDIUM]: 1,   [PackageSize.LARGE]: 1   },
  [VehicleType.TRUCK_SMALL]: { [PackageSize.SMALL]: 0.7, [PackageSize.MEDIUM]: 1, [PackageSize.LARGE]: 1   },
  [VehicleType.TRUCK_LARGE]: { [PackageSize.SMALL]: 0.5, [PackageSize.MEDIUM]: 1, [PackageSize.LARGE]: 1   },
};

// For fragile items, prefer enclosed vehicles
const FRAGILE_SUITABILITY: Record<VehicleType, number> = {
  [VehicleType.BICYCLE]:     0.3,
  [VehicleType.MOTORCYCLE]:  0.4,
  [VehicleType.TRICYCLE]:    0.6,
  [VehicleType.CAR]:         1.0,
  [VehicleType.VAN]:         1.0,
  [VehicleType.TRUCK_SMALL]: 0.7,
  [VehicleType.TRUCK_LARGE]: 0.5,
};

// For instant deliveries, prefer faster vehicles
const SPEED_SUITABILITY: Record<VehicleType, number> = {
  [VehicleType.BICYCLE]:     0.5,
  [VehicleType.MOTORCYCLE]:  1.0,
  [VehicleType.TRICYCLE]:    0.7,
  [VehicleType.CAR]:         0.8,
  [VehicleType.VAN]:         0.6,
  [VehicleType.TRUCK_SMALL]: 0.4,
  [VehicleType.TRUCK_LARGE]: 0.3,
};

// Score weights (must sum to 1.0)
const WEIGHTS = {
  distance:    0.35,
  vehicle:     0.25,
  rating:      0.20,
  speed:       0.12,
  fragile:     0.08,
};

export interface ScoredDriver {
  driver:     Driver;
  score:      number;
  distanceKm: number;
  breakdown: {
    distanceScore: number;
    vehicleScore:  number;
    ratingScore:   number;
    speedScore:    number;
    fragileScore:  number;
  };
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);
  private readonly radiusKm: number;

  constructor(
    private driversService: DriversService,
    private feesService:    FeesService,
    cfg: ConfigService,
  ) {
    const raw = Number(cfg.get<string>('MATCHING_RADIUS_KM'));
    this.radiusKm = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MATCHING_RADIUS_KM;
  }

  async findBestDriver(delivery: Delivery): Promise<ScoredDriver | null> {
    const nearbyDrivers = await this.driversService.findNearby(
      delivery.pickupLat,
      delivery.pickupLng,
      this.radiusKm,
    );

    if (!nearbyDrivers.length) {
      this.logger.warn(`No drivers found near delivery ${delivery.id}`);
      return null;
    }

    // Value-level gate (founder 2026-08-21): a driver never sees a job
    // whose declared value exceeds their level's cap.
    const candidates = this.filterForDriverLimits(
      this.filterForRide(
        await this.filterByValueLevel(nearbyDrivers, delivery), delivery),
      delivery);
    if (!candidates.length) {
      this.logger.warn(
        `No drivers near delivery ${delivery.id} are levelled for its declared value (₦${Number((delivery as any).declaredValueNgn ?? 0)}).`,
      );
      return null;
    }

    // Premium subscription priority boost (Spec V8 §2.13). Resolved in
    // parallel for the candidate set - cheap on a per-candidate basis
    // since most pools are <30 drivers.
    const premiumIds = await Promise.all(
      candidates.map(async (d) => [d.id, await this.driversService.isPremiumActive(d.id)] as const),
    );
    const premiumSet = new Set(premiumIds.filter(([, on]) => on).map(([id]) => id));
    const corridorCfg = await this.corridorConfig();
    // Interstate declared trips (Spec V8 2.18): the driver app has
    // promised "matching packages will be auto-offered" since day one;
    // this is the code that makes it true. Route match is GEOGRAPHIC as
    // of 2026-08-31: both ends of the parcel near both ends of the trip.
    // It used to compare city-name spelling against free-text addresses.
    const interTrips = await this.driversService
      .activeInterstateTripsFor(candidates.map((d) => d.id))
      .catch(() => [] as any[]);
    const interBonus = await this.feesService.getValueOr('interstate_match_bonus', 0.25).catch(() => 0.25);
    /* How near a parcel's two ends must be to the declared trip's two ends.
       A catalogue row because 'near' on a Lagos to Ibadan corridor is not
       'near' on a Lagos to Maiduguri one. */
    const corridorMatchKm = await this.feesService
      .getValueOr('interstate_corridor_match_km', 25).catch(() => 25);

    /* What each candidate is already carrying, one query for the whole
       pass. Feeds the spare-capacity test below. */
    const committedByDriver = await this.driversService
      .committedLoadKgFor(candidates.map(d => d.id), delivery.id)
      .catch(() => new Map<string, number>());

    const scored = candidates
      .map((driver) => {
        const scored = this.scoreDriver(driver, delivery, premiumSet.has(driver.id), corridorCfg);
        const trip = interTrips.find((tr: any) => String(tr.driverId ?? tr.driver?.id) === driver.id);
        if (trip
          && this.tripCanCarry(trip, delivery, committedByDriver.get(driver.id) ?? 0)
          && this.tripRouteMatches(trip, delivery, corridorMatchKm)) {
          scored.score = Math.min(1, scored.score + interBonus);
        }
        return scored;
      })
      .filter((s) => s.score > 0.1) // discard clearly unsuitable drivers
      .sort((a, b) => b.score - a.score);

    this.logger.log(
      `Matched ${scored.length} drivers for delivery ${delivery.id}. ` +
      `Best: ${scored[0]?.driver.id} score=${scored[0]?.score.toFixed(3)}`
    );

    return scored[0] ?? null;
  }

  /**
   * Can this declared trip actually take this package?
   *
   * The route-match bonus used to be handed out on the city names alone,
   * so the two switches the driver app puts in front of the rider both
   * did nothing:
   *
   *   acceptsPackages  a rider who set "Carry packages: OFF" was still
   *                    boosted to the top of the pool for package jobs.
   *                    The setting prevented nothing, which is worse
   *                    than not offering it: they declined and we
   *                    prioritised them anyway.
   *   spareCapacityKg  the number was collected at declaration and then
   *                    never compared to anything, so a trip with 5kg
   *                    free outranked everyone for a 40kg load.
   *
   * A failed check only withholds the bonus. The driver stays in the
   * pool on their ordinary score, because a trip that cannot take THIS
   * package may still be a perfectly good match on proximity alone, and
   * spareCapacityKg is a rider's own estimate rather than a certified
   * payload rating. The vehicle payload cap is enforced elsewhere, at
   * booking.
   *
   * Unknown weight is treated as fitting: refusing to boost because a
   * field is null would quietly disable the corridor feature on every
   * booking that predates the column.
   */
  /**
   * Does this booking actually travel the corridor the rider declared?
   *
   * This used to be two substring tests: pickupAddress.includes(fromCity)
   * and dropoffAddress.includes(toCity), both lowercased. It compared
   * SPELLING, not geography, so it failed on exactly the addresses
   * Nigerians write. A rider who declared "Abuja" got no bonus for a
   * parcel addressed "Wuse 2, FCT"; one who declared "Ibadan" got none
   * for "Bodija, Oyo State"; and "Lagos" quietly matched anything with
   * the word Lagos in it, including a purely local Lagos Island run that
   * was never going anywhere near the trip.
   *
   * The trip has carried real destination coordinates since the twelve
   * city lookup was removed, so this compares distance instead: the
   * parcel starts near where the rider starts, and ends near where the
   * rider ends. The radius is a Fee Catalogue row because "near" on a
   * Lagos to Ibadan corridor is not "near" on a Lagos to Maiduguri one,
   * and the founder will want to move it.
   *
   * Falls back to the old string test when the trip predates the
   * coordinate columns, so old rows keep whatever matching they had
   * rather than silently losing the feature.
   */
  private tripRouteMatches(trip: any, delivery: any, radiusKm: number): boolean {
    const tripFrom = this.coord(trip.pickupLat, trip.pickupLng);
    const tripTo   = this.coord(trip.destLat,   trip.destLng);
    const dropFrom = this.coord(delivery.pickupLat,  delivery.pickupLng);
    const dropTo   = this.coord(delivery.dropoffLat, delivery.dropoffLng);

    if (!tripFrom || !tripTo || !dropFrom || !dropTo) {
      const up = String(delivery.pickupAddress ?? '').toLowerCase();
      const dn = String(delivery.dropoffAddress ?? '').toLowerCase();
      const from = String(trip.fromCity ?? '').toLowerCase();
      const to   = String(trip.toCity   ?? '').toLowerCase();
      if (!from || !to) return false;
      return up.includes(from) && dn.includes(to);
    }

    const startGap = PricingService.haversineKm(
      dropFrom.lat, dropFrom.lng, tripFrom.lat, tripFrom.lng);
    const endGap = PricingService.haversineKm(
      dropTo.lat, dropTo.lng, tripTo.lat, tripTo.lng);

    return startGap <= radiusKm && endGap <= radiusKm;
  }

  /** A coordinate pair is usable only when both halves are real and not 0,0. */
  private coord(lat: any, lng: any): { lat: number; lng: number } | null {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
    if (la === 0 && ln === 0) return null;
    return { lat: la, lng: ln };
  }

  private tripCanCarry(trip: any, delivery: any, committedKg: number): boolean {
    if (trip.acceptsPackages === false) return false;

    const spareKg = Number(trip.spareCapacityKg ?? 0);
    const loadKg  = Number(delivery.weightKg ?? 0);
    // A trip that declared no spare capacity is not refusing packages,
    // it simply never filled the field in. Only compare when the rider
    // gave us a real number to compare against.
    if (!(spareKg > 0)) return true;

    /**
     * Capacity is what is LEFT, not what was declared (2026-08-29).
     *
     * This compared each package against the full declared figure on its
     * own, so a trip advertising 1 kg free boosted for a 1 kg parcel,
     * and again for the next, and the next. Five separate 1 kg parcels
     * every one of them "fits" a 1 kg trip, and the rider arrives to
     * five.
     *
     * Packages are never attached to a trip, deliberately: the empty
     * state tells a sender to "send your package the normal way and it
     * can still ride with an intercity driver", and matching is what
     * puts them together. So the load already committed is counted from
     * the rider's live work, fetched once per matching pass rather than
     * per candidate.
     *
     * A failure here still only withholds the corridor bonus. The rider
     * stays in the pool on proximity, because spareCapacityKg is their
     * own estimate and not a certified payload rating.
     */
    return committedKg + loadKg <= spareKg;
  }

  /**
   * Drop drivers whose value level cannot cover the booking's declared
   * value (caps are admin-editable fee rows; see DriversService).
   * No declared value = no gate: ordinary parcels match as before.
   */
  /**
   * A ride goes ONLY to the exact vehicle class the passenger chose
   * (founder 2026-08-22): someone who booked a car must not get an
   * okada, and a person never rides a bicycle or a truck.
   */
  private filterForRide(drivers: Driver[], delivery: Delivery): Driver[] {
    if ((delivery as any).kind !== 'ride') return drivers;
    return drivers.filter((d) => d.vehicleType === delivery.vehicleType);
  }

  /**
   * Respect what the rider said they will actually do (2026-08-31).
   *
   * Two standing preferences, both new, both defaulting to the old
   * behaviour so nobody's work changes until they change it:
   *
   *   acceptsInterstate  false means never auto-assign a run that leaves
   *                      their state. Before this the only way to say no
   *                      was to decline the job, which costs them their
   *                      acceptance rate for answering honestly.
   *   maxTripKm          the rider's own ceiling. Distinct from the
   *                      vehicle's maxRouteKm, which is what the machine
   *                      can do rather than what the person will do.
   *
   * Both are skipped when the run's states are unknown. A booking made
   * before those columns existed has not been SHOWN to cross a line, and
   * withholding work on a guess is the wrong way round: the rider loses
   * a job for a fact nobody established.
   */
  private filterForDriverLimits(drivers: Driver[], delivery: Delivery): Driver[] {
    const from = (delivery as any).pickupStateCode;
    const to   = (delivery as any).dropoffStateCode;
    const isInterState = !!(from && to && from !== to);
    const runKm = Number((delivery as any).distanceKm ?? 0);

    return drivers.filter((d) => {
      if (isInterState && (d as any).acceptsInterstate === false) return false;
      const cap = Number((d as any).maxTripKm ?? 0);
      if (cap > 0 && runKm > cap) return false;
      return true;
    });
  }

  /**
   * LAUNCH CALIBRATION, flagged 2026-08-28 and not changed here because
   * the ladder is a founder policy.
   *
   * This is a hard filter: a rider below the level for a parcel's
   * declared value is removed from the pool, and if the pool empties the
   * job matches nobody and stops with a log line.
   *
   * Every rider starts at valueLevel 1, whose cap is 5,000, and the
   * nightly auto-raise needs 25 completed deliveries per level and can
   * only move somebody one level a night. So on day one, when nobody has
   * a delivery history yet, ANY booking that declares a value above
   * 5,000 has no eligible rider anywhere in Lagos. A 25,000 phone needs
   * a rider with 50 completed jobs; there will not be one.
   *
   * Parcels that declare nothing are unaffected: the filter returns
   * early when declaredValueNgn is 0. But declaring value is exactly
   * what SEIRS asks customers to do, since it drives the high-value
   * premium and the signature rules, so the customers following the
   * product's own advice are the ones who cannot be matched.
   *
   * Three ways out, all the founder's call: raise the level-1 cap for
   * launch, seed approved riders above level 1, or let the pool widen
   * with a flag when nothing qualifies.
   */
  private async filterByValueLevel(drivers: Driver[], delivery: Delivery): Promise<Driver[]> {
    const declaredNgn = Number((delivery as any).declaredValueNgn ?? 0);
    if (!(declaredNgn > 0)) return drivers;
    const caps = await this.driversService.getLevelCaps();
    return drivers.filter((d) => {
      const lvl = Math.min(Math.max(Math.round((d as any).valueLevel ?? 1), 1), 10);
      return caps[lvl - 1] >= declaredNgn;
    });
  }

  /** Corridor knobs, resolved once per matching pass (fee rows, cached). */
  private async corridorConfig(): Promise<{ radiusM: number; bonus: number }> {
    try {
      const [radiusM, bonus] = await Promise.all([
        this.feesService.getValueOr('corridor_match_radius_m', 600),
        this.feesService.getValueOr('corridor_score_bonus', 0.2),
      ]);
      return { radiusM, bonus };
    } catch {
      return { radiusM: 600, bonus: 0.2 };
    }
  }

  /**
   * Metres from a point to the segment A->B, on an equirectangular
   * approximation. Fine at corridor scale (a few km, radius ~600m).
   */
  private static pointToSegmentM(
    pLat: number, pLng: number,
    aLat: number, aLng: number,
    bLat: number, bLng: number,
  ): number {
    const mPerDegLat = 111_320;
    const mPerDegLng = 111_320 * Math.cos((aLat * Math.PI) / 180);
    const px = (pLng - aLng) * mPerDegLng, py = (pLat - aLat) * mPerDegLat;
    const bx = (bLng - aLng) * mPerDegLng, by = (bLat - aLat) * mPerDegLat;
    const len2 = bx * bx + by * by;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
    const dx = px - t * bx, dy = py - t * by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private scoreDriver(driver: Driver, delivery: Delivery, isPremium = false, corridorCfg?: { radiusM: number; bonus: number }): ScoredDriver {
    const distanceKm = PricingService.haversineKm(
      delivery.pickupLat, delivery.pickupLng,
      driver.lastLat ?? 0, driver.lastLng ?? 0,
    );

    // Distance score: linear decay from 1.0 at 0km to 0.0 at the radius bound
    const distanceScore = Math.max(0, 1 - distanceKm / this.radiusKm);

    // Vehicle suitability
    const vehicleScore = VEHICLE_SUITABILITY[driver.vehicleType]?.[delivery.packageSize] ?? 0;

    // Rating score: 0–5 mapped to 0–1
    const ratingScore = (driver.rating ?? 0) / 5;

    // Speed score (matters more for instant urgency)
    const speedScore = delivery.urgency === UrgencyLevel.INSTANT
      ? SPEED_SUITABILITY[driver.vehicleType] ?? 0.5
      : 0.5; // neutral for non-instant

    // Fragile score (matters only for fragile packages)
    const fragileScore = delivery.isFragile
      ? FRAGILE_SUITABILITY[driver.vehicleType] ?? 0.5
      : 1.0; // non-fragile = any vehicle is fine

    let score =
      distanceScore  * WEIGHTS.distance +
      vehicleScore   * WEIGHTS.vehicle  +
      ratingScore    * WEIGHTS.rating   +
      speedScore     * WEIGHTS.speed    +
      fragileScore   * WEIGHTS.fragile;

    // Spec V8 §2.11 - next-day priority penalty. Drivers who flipped
    // wind-down within 30min of going online get a -0.15 score hit
    // until end-of-tomorrow. Lower in the ranking, not excluded -
    // they'll still get jobs when no penalty-free driver is closer.
    if (driver.priorityPenaltyUntil && new Date(driver.priorityPenaltyUntil) > new Date()) {
      score = Math.max(0, score - 0.15);
    }

    // Spec V8 §2.13 - Driver Premium subscribers get a priority boost
    // symmetric to the wind-down penalty. Sized to outrank a 0.5-star
    // rating gap (rating contributes 0.20 weight × 0.1 step = 0.02 max).
    if (isPremium) {
      score = Math.min(1, score + 0.15);
    }

    // Corridor bonus ("on their way", founder 2026-08-21): the job rides
    // a trip the courier declared they were already making. Pickup AND
    // drop must both hug the line from the courier's position to their
    // destination; either one off the line means a real detour, so no
    // bonus.
    const cLat = Number((driver as any).corridorDestLat);
    const cLng = Number((driver as any).corridorDestLng);
    const cExp = (driver as any).corridorExpiresAt ? new Date((driver as any).corridorExpiresAt) : null;
    if (
      corridorCfg && cExp && cExp > new Date() &&
      Number.isFinite(cLat) && Number.isFinite(cLng) &&
      driver.lastLat != null && driver.lastLng != null &&
      delivery.dropoffLat != null && delivery.dropoffLng != null
    ) {
      const pickM = MatchingService.pointToSegmentM(
        delivery.pickupLat, delivery.pickupLng,
        driver.lastLat, driver.lastLng, cLat, cLng,
      );
      const dropM = MatchingService.pointToSegmentM(
        delivery.dropoffLat, delivery.dropoffLng,
        driver.lastLat, driver.lastLng, cLat, cLng,
      );
      if (pickM <= corridorCfg.radiusM && dropM <= corridorCfg.radiusM) {
        score = Math.min(1, score + corridorCfg.bonus);
      }
    }

    return {
      driver,
      score: Math.round(score * 1000) / 1000,
      distanceKm: Math.round(distanceKm * 10) / 10,
      breakdown: { distanceScore, vehicleScore, ratingScore, speedScore, fragileScore },
    };
  }

  // Returns top 3 options for manual selection (customer picks)
  async getDeliveryOptions(delivery: Delivery): Promise<ScoredDriver[]> {
    const nearby = await this.driversService.findNearby(
      delivery.pickupLat,
      delivery.pickupLng,
      this.radiusKm,
    );
    // Same value-level gate as auto-matching: a customer picking by hand
    // must not be offered a driver the platform would not trust with
    // this declared value.
    const nearbyDrivers = this.filterForRide(
      await this.filterByValueLevel(nearby, delivery), delivery);
    const premiumIds = await Promise.all(
      nearbyDrivers.map(async (d) => [d.id, await this.driversService.isPremiumActive(d.id)] as const),
    );
    const premiumSet = new Set(premiumIds.filter(([, on]) => on).map(([id]) => id));

    return nearbyDrivers
      .map((d) => this.scoreDriver(d, delivery, premiumSet.has(d.id)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }
}
