import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Driver, VehicleType } from '../drivers/driver.entity';
import { Delivery, PackageSize, UrgencyLevel } from '../deliveries/delivery.entity';
import { DriversService } from '../drivers/drivers.service';
import { PricingService } from '../deliveries/pricing.service';

// Spec V8 §3.9 — this default will move into the Fee Catalogue once that
// module ships, so admins can adjust it live without a redeploy. For now,
// override via MATCHING_RADIUS_KM env var in Railway.
const DEFAULT_MATCHING_RADIUS_KM = 15;

// ─── Vehicle suitability matrix ──────────────────────────────────────────────
// Which vehicles can carry which package sizes (1 = yes, 0 = no)
const VEHICLE_SUITABILITY: Record<VehicleType, Record<PackageSize, number>> = {
  [VehicleType.BICYCLE]:    { [PackageSize.SMALL]: 1, [PackageSize.MEDIUM]: 0.3, [PackageSize.LARGE]: 0 },
  [VehicleType.MOTORCYCLE]: { [PackageSize.SMALL]: 1, [PackageSize.MEDIUM]: 0.8, [PackageSize.LARGE]: 0.2 },
  [VehicleType.TRICYCLE]:   { [PackageSize.SMALL]: 1, [PackageSize.MEDIUM]: 1,   [PackageSize.LARGE]: 0.7 },
  [VehicleType.CAR]:        { [PackageSize.SMALL]: 1, [PackageSize.MEDIUM]: 1,   [PackageSize.LARGE]: 0.8 },
  [VehicleType.VAN]:        { [PackageSize.SMALL]: 1, [PackageSize.MEDIUM]: 1,   [PackageSize.LARGE]: 1   },
};

// For fragile items, prefer enclosed vehicles
const FRAGILE_SUITABILITY: Record<VehicleType, number> = {
  [VehicleType.BICYCLE]:    0.3,
  [VehicleType.MOTORCYCLE]: 0.4,
  [VehicleType.TRICYCLE]:   0.6,
  [VehicleType.CAR]:        1.0,
  [VehicleType.VAN]:        1.0,
};

// For instant deliveries, prefer faster vehicles
const SPEED_SUITABILITY: Record<VehicleType, number> = {
  [VehicleType.BICYCLE]:    0.5,
  [VehicleType.MOTORCYCLE]: 1.0,
  [VehicleType.TRICYCLE]:   0.7,
  [VehicleType.CAR]:        0.8,
  [VehicleType.VAN]:        0.6,
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

    const scored = nearbyDrivers
      .map((driver) => this.scoreDriver(driver, delivery))
      .filter((s) => s.score > 0.1) // discard clearly unsuitable drivers
      .sort((a, b) => b.score - a.score);

    this.logger.log(
      `Matched ${scored.length} drivers for delivery ${delivery.id}. ` +
      `Best: ${scored[0]?.driver.id} score=${scored[0]?.score.toFixed(3)}`
    );

    return scored[0] ?? null;
  }

  private scoreDriver(driver: Driver, delivery: Delivery): ScoredDriver {
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

    const score =
      distanceScore  * WEIGHTS.distance +
      vehicleScore   * WEIGHTS.vehicle  +
      ratingScore    * WEIGHTS.rating   +
      speedScore     * WEIGHTS.speed    +
      fragileScore   * WEIGHTS.fragile;

    return {
      driver,
      score: Math.round(score * 1000) / 1000,
      distanceKm: Math.round(distanceKm * 10) / 10,
      breakdown: { distanceScore, vehicleScore, ratingScore, speedScore, fragileScore },
    };
  }

  // Returns top 3 options for manual selection (customer picks)
  async getDeliveryOptions(delivery: Delivery): Promise<ScoredDriver[]> {
    const nearbyDrivers = await this.driversService.findNearby(
      delivery.pickupLat,
      delivery.pickupLng,
      this.radiusKm,
    );

    return nearbyDrivers
      .map((d) => this.scoreDriver(d, delivery))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }
}
