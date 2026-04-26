import { Injectable } from '@nestjs/common';
import { PackageSize, UrgencyLevel } from './delivery.entity';
import { VehicleType } from '../drivers/driver.entity';

interface PriceInput {
  distanceKm:  number;
  packageSize: PackageSize;
  urgency:     UrgencyLevel;
  isFragile:   boolean;
}

export interface PriceResult {
  price:          number;
  driverEarnings: number;
  breakdown: {
    base:        number;
    distance:    number;
    sizeFee:     number;
    urgencyFee:  number;
    fragileFee:  number;
    platformFee: number;
  };
}

// Base rates in Nigerian Naira — adjust per country in Phase 5
const BASE_FARE     = 300;
const PER_KM_RATE   = 80;
const PLATFORM_CUT  = 0.20; // 20% platform commission

const SIZE_MULTIPLIER: Record<PackageSize, number> = {
  [PackageSize.SMALL]:  1.0,
  [PackageSize.MEDIUM]: 1.4,
  [PackageSize.LARGE]:  1.9,
};

const URGENCY_MULTIPLIER: Record<UrgencyLevel, number> = {
  [UrgencyLevel.ECONOMY]:  0.80,
  [UrgencyLevel.STANDARD]: 1.00,
  [UrgencyLevel.INSTANT]:  1.50,
};

@Injectable()
export class PricingService {
  calculate(input: PriceInput): PriceResult {
    const base       = BASE_FARE;
    const distance   = Math.round(input.distanceKm * PER_KM_RATE);
    const sizeFee    = Math.round((base + distance) * (SIZE_MULTIPLIER[input.packageSize] - 1));
    const urgencyFee = Math.round((base + distance + sizeFee) * (URGENCY_MULTIPLIER[input.urgency] - 1));
    const fragileFee = input.isFragile ? 150 : 0;

    const subtotal   = base + distance + sizeFee + urgencyFee + fragileFee;
    const platformFee = Math.round(subtotal * PLATFORM_CUT);
    const price       = subtotal;
    const driverEarnings = subtotal - platformFee;

    return {
      price,
      driverEarnings,
      breakdown: { base, distance, sizeFee, urgencyFee, fragileFee, platformFee },
    };
  }

  // Returns 3 options for the customer to choose from
  getQuotes(distanceKm: number, packageSize: PackageSize, isFragile: boolean) {
    return {
      economy:  this.calculate({ distanceKm, packageSize, urgency: UrgencyLevel.ECONOMY,  isFragile }),
      standard: this.calculate({ distanceKm, packageSize, urgency: UrgencyLevel.STANDARD, isFragile }),
      instant:  this.calculate({ distanceKm, packageSize, urgency: UrgencyLevel.INSTANT,  isFragile }),
    };
  }

  // Haversine distance between two GPS points
  static haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
