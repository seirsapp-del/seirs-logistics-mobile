import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { BusinessService } from '../business/business.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { PricingService } from '../pricing/pricing.service';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { IdempotencyKey } from './idempotency-key.entity';
import { AuthedApiKey } from './api-key.guard';

// Spec V8 Tier 3 — V1 public API service. Wraps the internal services
// with sandbox routing + the publicly-stable request/response shape.
// Internal entities (Delivery, etc.) are NOT exposed directly; we
// always serialize to a curated DTO so internal schema changes don't
// break partners.

export interface V1QuoteInput {
  pickup:  { lat: number; lng: number };
  dropoff: { lat: number; lng: number };
  vehicleType?: string;     // bicycle | motorcycle | tricycle | car | van | truck_small | truck_large
  categoryCode?: string;    // small_parcel, fragile, ...
  weightKg?: number;
}

export interface V1OrderInput {
  pickup: {
    address: string;
    lat:     number;
    lng:     number;
  };
  dropoff: {
    address:        string;
    lat:            number;
    lng:            number;
    recipientName:  string;
    recipientPhone: string;
    notes?:         string;
  };
  vehicleType?:    string;
  categoryCode?:   string;
  weightKg?:       number;
  packageDescription?: string;
  externalReference?:  string;  // partner's own order ID — round-tripped
  scheduledAt?:    string;       // ISO; null = ASAP
}

export interface V1OrderResponse {
  id:             string;
  externalRef:    string | null;
  status:         string;
  trackingCode:   string;
  trackingUrl:    string;
  price: {
    customer:  number;
    driver:    number;
    seirsNet:  number;
  };
  estimatedKm:    number;
  estimatedMinutes: number;
  pickup:         { address: string; lat: number; lng: number };
  dropoff:        { address: string; lat: number; lng: number; recipientName: string; recipientPhone: string };
  mode:           'live' | 'test';
  createdAt:      string;
}

@Injectable()
export class V1Service {
  private readonly logger = new Logger(V1Service.name);

  constructor(
    @InjectRepository(Delivery)          private deliveriesRepo: Repository<Delivery>,
    @InjectRepository(IdempotencyKey)    private idemRepo:       Repository<IdempotencyKey>,
    private readonly businessService:    BusinessService,
    private readonly deliveriesService:  DeliveriesService,
    private readonly pricingService:     PricingService,
  ) {}

  // ── Idempotency helpers ─────────────────────────────────────────────────

  async findIdempotent(apiKeyId: string, key: string, routeSig: string) {
    if (!key) return null;
    const row = await this.idemRepo.findOne({ where: { apiKeyId, key } });
    if (!row) return null;
    if (row.routeSignature !== routeSig) {
      throw new BadRequestException('Idempotency-Key already used on a different endpoint.');
    }
    if (row.expiresAt && row.expiresAt < new Date()) {
      // Expired — purge and treat as new
      this.idemRepo.delete(row.id).catch(() => {});
      return null;
    }
    return row;
  }

  async storeIdempotent(apiKeyId: string, key: string, routeSig: string, status: number, body: any) {
    if (!key) return;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.idemRepo.save(this.idemRepo.create({
      apiKeyId, key: key.slice(0, 100), routeSignature: routeSig,
      responseStatus: status, responseBody: body, expiresAt,
    })).catch(err => this.logger.warn(`Idempotency persist failed: ${err.message}`));
  }

  // Daily purge of expired idempotency rows
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeExpiredIdempotency() {
    const res = await this.idemRepo.delete({ expiresAt: LessThan(new Date()) });
    if (res.affected) this.logger.log(`Purged ${res.affected} expired idempotency keys`);
  }

  // ── Quote — works the same in live + test mode ───────────────────────────

  async quote(input: V1QuoteInput) {
    if (!input.pickup || !input.dropoff) {
      throw new BadRequestException('pickup + dropoff required.');
    }
    const km = haversineKm(input.pickup, input.dropoff);
    const breakdown = await this.pricingService.computePrice({
      vehicleType:           input.vehicleType  ?? 'motorcycle',
      categoryCode:          input.categoryCode ?? 'small_parcel',
      km,
      stopCount:             1,
      weightKg:              input.weightKg ?? 1,
      estimatedDwellMinutes: 4,
    });
    return {
      currency: 'NGN',
      estimatedKm: round(km, 2),
      estimatedMinutes: Math.max(15, Math.round(km * 2.5)), // ~24km/h average
      breakdown: {
        customer: round(breakdown.customer.total, 2),
        driver:   round(breakdown.driver.total,   2),
        seirsNet: round(breakdown.seirsNet,       2),
      },
    };
  }

  // ── Create order — sandbox returns a mock; live routes through
  // BusinessService.createDelivery so the same wallet/route/multi-stop
  // path serves partners and direct customers identically.

  async createOrder(apiKey: AuthedApiKey, input: V1OrderInput): Promise<V1OrderResponse> {
    if (!input?.pickup?.address || !input?.dropoff?.address) {
      throw new BadRequestException('pickup.address and dropoff.address required.');
    }
    if (!input?.dropoff?.recipientName || !input?.dropoff?.recipientPhone) {
      throw new BadRequestException('dropoff.recipientName and dropoff.recipientPhone required.');
    }
    if (input.pickup.lat == null || input.dropoff.lat == null) {
      throw new BadRequestException('lat/lng required on both pickup and dropoff.');
    }

    const km = haversineKm(input.pickup, input.dropoff);

    // ── SANDBOX ──────────────────────────────────────────────────────
    if (apiKey.mode === 'test') {
      const breakdown = await this.pricingService.computePrice({
        vehicleType:           input.vehicleType  ?? 'motorcycle',
        categoryCode:          input.categoryCode ?? 'small_parcel',
        km, stopCount: 1, weightKg: input.weightKg ?? 1,
        estimatedDwellMinutes: 4,
      });
      const id          = `sandbox_${crypto.randomBytes(12).toString('hex')}`;
      const trackingCode = `SRS-TEST-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      return {
        id,
        externalRef:       input.externalReference ?? null,
        status:            'pending',
        trackingCode,
        trackingUrl:       `https://seirs.app/t/${trackingCode}`,
        price: {
          customer:  round(breakdown.customer.total, 2),
          driver:    round(breakdown.driver.total,   2),
          seirsNet:  round(breakdown.seirsNet,       2),
        },
        estimatedKm:       round(km, 2),
        estimatedMinutes:  Math.max(15, Math.round(km * 2.5)),
        pickup:            input.pickup,
        dropoff:           input.dropoff,
        mode:              'test',
        createdAt:         new Date().toISOString(),
      };
    }

    // ── LIVE — debits wallet, creates delivery, dispatches to matcher
    const created = await this.businessService.createDelivery(apiKey.ownerUserId, {
      pickupAddress: input.pickup.address,
      pickupLat:     input.pickup.lat,
      pickupLng:     input.pickup.lng,
      stops: [{
        address:        input.dropoff.address,
        lat:            input.dropoff.lat,
        lng:            input.dropoff.lng,
        recipientName:  input.dropoff.recipientName,
        recipientPhone: input.dropoff.recipientPhone,
        notes:          input.dropoff.notes,
        sequenceOrder:  1,
      }],
      vehicleType:           input.vehicleType  ?? 'motorcycle',
      categoryCode:          input.categoryCode ?? 'small_parcel',
      weightKg:              input.weightKg ?? 1,
      packageDescription:    input.packageDescription ?? input.externalReference,
      km,
      estimatedDriveMinutes: Math.max(15, Math.round(km * 2.5)),
      scheduledAt:           input.scheduledAt,
    });

    // BusinessService.createDelivery returns { delivery, stops, breakdown, wallet }
    return this.serialize((created as any).delivery ?? created, apiKey.mode, input.externalReference ?? null);
  }

  async getOrder(apiKey: AuthedApiKey, orderId: string): Promise<V1OrderResponse> {
    if (apiKey.mode === 'test') {
      // Sandbox orders aren't persisted — return a not-found unless the
      // ID has the sandbox_ prefix, in which case fabricate a stable
      // "pending" snapshot so partner code can poll without surprises.
      if (orderId.startsWith('sandbox_')) {
        return this.sandboxStub(orderId);
      }
      throw new NotFoundException('Order not found.');
    }
    const row = await this.deliveriesRepo.findOne({
      where: { id: orderId }, relations: ['customer'],
    });
    if (!row) throw new NotFoundException('Order not found.');
    if (row.customer?.id !== apiKey.ownerUserId) {
      throw new ForbiddenException('Order belongs to another developer account.');
    }
    return this.serialize(row, apiKey.mode, null);
  }

  async cancelOrder(apiKey: AuthedApiKey, orderId: string): Promise<V1OrderResponse> {
    if (apiKey.mode === 'test') {
      if (orderId.startsWith('sandbox_')) {
        const stub = this.sandboxStub(orderId);
        return { ...stub, status: 'cancelled' };
      }
      throw new NotFoundException('Order not found.');
    }
    const row = await this.deliveriesRepo.findOne({
      where: { id: orderId }, relations: ['customer'],
    });
    if (!row) throw new NotFoundException('Order not found.');
    if (row.customer?.id !== apiKey.ownerUserId) {
      throw new ForbiddenException('Order belongs to another developer account.');
    }
    if (![DeliveryStatus.PENDING, DeliveryStatus.ASSIGNED].includes(row.status as any)) {
      throw new BadRequestException(`Cannot cancel a ${row.status} order.`);
    }
    await this.deliveriesRepo.update(row.id, { status: DeliveryStatus.CANCELLED });
    const updated = await this.deliveriesRepo.findOne({
      where: { id: orderId }, relations: ['customer'],
    });
    return this.serialize(updated!, apiKey.mode, null);
  }

  // ── Serialisation ───────────────────────────────────────────────────────

  private serialize(d: Delivery, mode: 'live' | 'test', externalRef: string | null): V1OrderResponse {
    return {
      id:              d.id,
      externalRef,
      status:          String(d.status),
      trackingCode:    d.trackingCode,
      trackingUrl:     `https://seirs.app/t/${d.trackingCode}`,
      price: {
        customer:  round(Number(d.price ?? 0), 2),
        driver:    round(Number(d.driverEarnings ?? 0), 2),
        seirsNet:  round(Number(d.price ?? 0) - Number(d.driverEarnings ?? 0), 2),
      },
      estimatedKm:       round(Number((d as any).distanceKm ?? 0), 2),
      estimatedMinutes:  Number((d as any).estimatedDriveMinutes ?? 0),
      pickup: {
        address: d.pickupAddress, lat: Number(d.pickupLat), lng: Number(d.pickupLng),
      },
      dropoff: {
        address:        d.dropoffAddress ?? '',
        lat:            Number(d.dropoffLat ?? 0),
        lng:            Number(d.dropoffLng ?? 0),
        recipientName:  (d as any).recipientName ?? '',
        recipientPhone: (d as any).recipientPhone ?? '',
      },
      mode,
      createdAt:       d.createdAt.toISOString(),
    };
  }

  private sandboxStub(id: string): V1OrderResponse {
    return {
      id,
      externalRef:       null,
      status:            'pending',
      trackingCode:      `SRS-TEST-${id.slice(-8).toUpperCase()}`,
      trackingUrl:       `https://seirs.app/t/SRS-TEST-${id.slice(-8).toUpperCase()}`,
      price:             { customer: 1217, driver: 887, seirsNet: 245 },
      estimatedKm:       5,
      estimatedMinutes:  15,
      pickup:            { address: '15 Adeola Odeku, Lekki, Lagos', lat: 6.4407, lng: 3.4216 },
      dropoff:           { address: '7 Marina, Lagos Island', lat: 6.4502, lng: 3.3886, recipientName: 'Adunni Bello', recipientPhone: '08012345678' },
      mode:              'test',
      createdAt:         new Date().toISOString(),
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
            Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function round(n: number, dp = 2): number {
  const m = Math.pow(10, dp);
  return Math.round(n * m) / m;
}
