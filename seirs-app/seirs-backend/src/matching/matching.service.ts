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
    const candidates = this.filterForRide(
      await this.filterByValueLevel(nearbyDrivers, delivery), delivery);
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
    // this is the first code that makes it true. Route match = the
    // declared cities appear in the booking's addresses.
    const interTrips = await this.driversService
      .activeInterstateTripsFor(candidates.map((d) => d.id))
      .catch(() => [] as any[]);
    const interBonus = await this.feesService.getValueOr('interstate_match_bonus', 0.25).catch(() => 0.25);

    const scored = candidates
      .map((driver) => {
        const scored = this.scoreDriver(driver, delivery, premiumSet.has(driver.id), corridorCfg);
        // Declared-trip route match: both cities named in the booking.
        const trip = interTrips.find((tr: any) => String(tr.driverId ?? tr.driver?.id) === driver.id);
        if (trip && this.tripCanCarry(trip, delivery)) {
          const up = String(delivery.pickupAddress ?? '').toLowerCase();
          const dn = String(delivery.dropoffAddress ?? '').toLowerCase();
          if (up.includes(String(trip.fromCity).toLowerCase()) && dn.includes(String(trip.toCity).toLowerCase())) {
            scored.score = Math.min(1, scored.score + interBonus);
          }
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
  private tripCanCarry(trip: any, delivery: any): boolean {
    if (trip.acceptsPackages === false) return false;

    const spareKg = Number(trip.spareCapacityKg ?? 0);
    const loadKg  = Number(delivery.weightKg ?? 0);
    // A trip that declared no spare capacity is not refusing packages,
    // it simply never filled the field in. Only compare when the rider
    // gave us a real number to compare against.
    if (spareKg > 0 && loadKg > spareKg) return false;

    return true;
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
