import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PoolGroup } from './pool-group.entity';

const POOL_TIME_CAP_PCT  = 20;   // Spec V8 §1 — insertion can add at most +20% time
const CORRIDOR_RADIUS_KM = 1;    // Pickup/dropoff must lie within 1km of route
const MAX_ACTIVE_LEGS    = 4;    // Sliding capacity bound

export interface FitCheckInput {
  driverId:         string;
  newPickupLat:     number;
  newPickupLng:     number;
  newDropoffLat:    number;
  newDropoffLng:    number;
  newLegEtaMinutes: number;
}

export interface FitCheckResult {
  fits:        boolean;
  reason?:     string;
  poolGroupId?: string;
  newEtaTotal?: number;
}

// Haversine distance in km between two lat/lng points
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// Perpendicular distance from a point to the great-circle line between
// two endpoints. Approximation via cross-track distance — good enough
// at city scale where the line is nearly straight.
function pointToLineKm(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const ab = haversineKm(aLat, aLng, bLat, bLng);
  if (ab < 0.001) return haversineKm(pLat, pLng, aLat, aLng);
  // Project p onto a→b
  const dx = bLng - aLng, dy = bLat - aLat;
  const t  = ((pLng - aLng) * dx + (pLat - aLat) * dy) / (dx * dx + dy * dy);
  const tClamp = Math.max(0, Math.min(1, t));
  const px = aLng + tClamp * dx;
  const py = aLat + tClamp * dy;
  return haversineKm(pLat, pLng, py, px);
}

@Injectable()
export class PoolingService {
  private readonly logger = new Logger(PoolingService.name);

  constructor(
    @InjectRepository(PoolGroup) private repo: Repository<PoolGroup>,
  ) {}

  // Try to insert a new leg into one of the driver's active pool groups.
  // Returns whether it fits, and which group accepted it.
  async checkFit(input: FitCheckInput): Promise<FitCheckResult> {
    const groups = await this.repo.find({
      where: { driverId: input.driverId, status: 'active' },
    });

    for (const g of groups) {
      // Capacity check
      if (g.legIds.length >= MAX_ACTIVE_LEGS) continue;

      // Both new pickup AND new dropoff must lie within corridor of the
      // existing trip line.
      const pickupOff = pointToLineKm(
        input.newPickupLat, input.newPickupLng,
        Number(g.originLat),  Number(g.originLng),
        Number(g.terminalLat), Number(g.terminalLng),
      );
      if (pickupOff > CORRIDOR_RADIUS_KM) continue;

      const dropoffOff = pointToLineKm(
        input.newDropoffLat, input.newDropoffLng,
        Number(g.originLat),  Number(g.originLng),
        Number(g.terminalLat), Number(g.terminalLng),
      );
      if (dropoffOff > CORRIDOR_RADIUS_KM) continue;

      // Time cap check — projected ETA after insertion can't exceed
      // initialEtaMinutes by more than POOL_TIME_CAP_PCT.
      const projected = g.currentEtaMinutes + input.newLegEtaMinutes;
      const cap = g.initialEtaMinutes * (1 + POOL_TIME_CAP_PCT / 100);
      if (projected > cap) continue;

      return {
        fits:         true,
        poolGroupId:  g.id,
        newEtaTotal:  projected,
      };
    }

    return { fits: false, reason: 'No active pool group accepts this leg within corridor + time cap' };
  }

  // Add the new leg to the chosen pool group (called after checkFit returns true).
  async insert(poolGroupId: string, deliveryId: string, newEtaTotal: number, newDropoffLat: number, newDropoffLng: number) {
    const g = await this.repo.findOne({ where: { id: poolGroupId } });
    if (!g) return null;
    g.legIds = [...(g.legIds ?? []), deliveryId];
    g.currentEtaMinutes = newEtaTotal;
    // If the new dropoff extends further than current terminal, push terminal out.
    const distToTerminal    = haversineKm(Number(g.originLat), Number(g.originLng), Number(g.terminalLat), Number(g.terminalLng));
    const distToNewDropoff  = haversineKm(Number(g.originLat), Number(g.originLng), newDropoffLat, newDropoffLng);
    if (distToNewDropoff > distToTerminal) {
      g.terminalLat = newDropoffLat;
      g.terminalLng = newDropoffLng;
    }
    await this.repo.save(g);
    return g;
  }

  // Open a brand-new pool group when a driver accepts a fresh job
  // that doesn't fit any existing chain.
  async openGroup(driverId: string, deliveryId: string, originLat: number, originLng: number, terminalLat: number, terminalLng: number, etaMinutes: number) {
    return this.repo.save(this.repo.create({
      driverId,
      originLat,    originLng,
      terminalLat,  terminalLng,
      initialEtaMinutes: etaMinutes,
      currentEtaMinutes: etaMinutes,
      legIds: [deliveryId],
      status: 'active',
    }));
  }

  // Mark a leg complete; if all legs done, close the group.
  async completeLeg(poolGroupId: string, deliveryId: string) {
    const g = await this.repo.findOne({ where: { id: poolGroupId } });
    if (!g) return null;
    g.legIds = (g.legIds ?? []).filter(id => id !== deliveryId);
    if (g.legIds.length === 0) g.status = 'completed';
    await this.repo.save(g);
    return g;
  }

  async getActive(driverId: string) {
    return this.repo.find({ where: { driverId, status: 'active' } });
  }
}
