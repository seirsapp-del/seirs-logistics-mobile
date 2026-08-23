import {
  Controller, Get, Put, Post, Body, Param, UseGuards, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingService, PricingInput } from './pricing.service';
import { RateCard } from './rate-card.entity';
import { ServiceCategory } from './service-category.entity';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Pricing system surface area.
 *
 * Public reads (called by all 3 mobile apps on boot + every 5 min cache refresh):
 *   GET /config/rate-card        → current active rate card
 *   GET /config/service-catalog  → list of active service categories
 *
 * Auth'd quote (used by the booking form to show breakdown before confirm):
 *   POST /pricing/quote          → returns PriceBreakdown for the given input
 *
 * Admin writes (called from the dashboard rate-card editor):
 *   PUT  /admin/rate-card        → publish a new RateCard version (deactivates the old one)
 *   PUT  /admin/service-catalog/:code  → upsert a service category
 *   GET  /admin/rate-cards       → version history
 */
@Controller()
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    @InjectRepository(RateCard)
    private readonly rateCardRepo: Repository<RateCard>,
    @InjectRepository(ServiceCategory)
    private readonly categoryRepo: Repository<ServiceCategory>,
  ) {}

  /**
   * How far the pump price has drifted from the active rate card.
   *
   * Powers the admin warning. Fuel is corrected from the catalogue so
   * drivers are always reimbursed correctly, but the card's own
   * customer-facing rates go stale behind it, and somebody has to be
   * told to republish.
   */
  @Get('pricing/fuel-drift')
  fuelDrift() {
    return this.pricing.fuelDrift();
  }

  // ── Public config endpoints (apps fetch on boot) ─────────────────────  // ── Public config endpoints (apps fetch on boot) ─────────────────────

  @Public()
  @Get('config/rate-card')
  async getActiveRateCard() {
    return this.pricing.getActiveRateCard();
  }

  @Public()
  @Get('config/service-catalog')
  async getServiceCatalog() {
    return this.pricing.getServiceCategories();
  }

  // ── Quote endpoint (auth required) ───────────────────────────────────

  /**
   * One call prices every ride vehicle for the route, each with its
   * own pin, so vehicle-select shows four honest numbers and confirm
   * books the exact one shown (founder 2026-08-22, Book-a-Ride rebuild).
   */
  @UseGuards(JwtAuthGuard)
  @Post('pricing/ride-quote')
  async rideQuote(@Body() body: {
    km: number;
    pickupCoords?:  { latitude: number; longitude: number };
    dropoffCoords?: { latitude: number; longitude: number };
    luggage?: string;
  }) {
    if (typeof body.km !== 'number' || body.km < 0) {
      throw new BadRequestException('km must be a non-negative number');
    }
    const pricedAt = new Date();
    const vehicles: Record<string, any> = {};
    for (const v of PricingService.RIDE_VEHICLES) {
      try {
        const b = await this.pricing.computeRidePrice({
          vehicleType: v,
          km: body.km,
          scheduledAt: pricedAt,
          pickupCoords: body.pickupCoords ?? null,
          luggage: body.luggage,
          dropoffCoords: body.dropoffCoords ?? null,
        });
        vehicles[v] = {
          total:          Number(b.customer.total),
          driverEarnings: Number(b.driver.total),
          serviceFee:     Number(b.customer.serviceFee ?? 0),
          luggageFee:     Number((b.customer as any).luggageFee ?? 0),
          quotePin:       this.pricing.signQuotePin(Number(b.customer.total), pricedAt),
        };
      } catch { /* vehicle missing from the card: omit */ }
    }
    return { pricedAt: pricedAt.toISOString(), vehicles };
  }

  @UseGuards(JwtAuthGuard)
  @Post('pricing/quote')
  async quote(@Body() body: PricingInput) {
    if (!body.vehicleType || !body.categoryCode) {
      throw new BadRequestException('vehicleType and categoryCode are required');
    }
    if (typeof body.km !== 'number' || body.km < 0) {
      throw new BadRequestException('km must be a non-negative number');
    }
    if (typeof body.weightKg !== 'number' || body.weightKg < 0) {
      throw new BadRequestException('weightKg must be a non-negative number');
    }
    if (typeof body.stopCount !== 'number' || body.stopCount < 1) {
      throw new BadRequestException('stopCount must be at least 1');
    }
    // Pin the moment of pricing: send-now bookings re-evaluate time
    // surcharges at this instant when they book with the pin, so the
    // number shown IS the number charged (founder 2026-08-21: the
    // review said 1,679 and the charge was 1,684).
    const pricedAt = new Date();
    const breakdown = await this.pricing.computePrice({
      ...body,
      scheduledAt: (body as any).scheduledAt ? new Date((body as any).scheduledAt) : pricedAt,
    } as any);
    return {
      ...breakdown,
      quotePin: this.pricing.signQuotePin(Number((breakdown as any).customer?.total ?? 0), pricedAt),
    };
  }

  // ── Admin endpoints ──────────────────────────────────────────────────
  // NOTE: a proper admin guard is wired separately in admin.module; the
  // JwtAuthGuard here ensures only authenticated users can hit these.
  // Production should add an explicit role check via RolesGuard.

  // Super admin only (2026-08-13 RBAC audit). Publishing a rate card
  // changes what every future delivery costs, platform-wide.
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  /**
   * Copy today's pump prices into a new rate card version, in one action.
   *
   * Correcting fuel was technically possible all along: edit the two
   * fields on the pricing page and publish. It was simply never done,
   * and the card drifted 45% behind the pump while every driver
   * silently absorbed the difference (review 2026-08-18). Friction is
   * why maintenance does not happen, so the fix is one button rather
   * than a second source of truth.
   *
   * This is a normal publish: it increments the version, deactivates the
   * old card and records why, so the price change is auditable like any
   * other.
   */
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Post('admin/rate-card/sync-fuel')
  async syncFuel(@CurrentUser() admin: any) {
    const current = await this.rateCardRepo.findOne({ where: { isActive: true } });
    if (!current) throw new BadRequestException('No active rate card to update.');

    const live = await this.pricing.livePumpPrices(current);
    const before = {
      petrol: Number(current.fuelPrices.petrolPerLitreNgn),
      diesel: Number(current.fuelPrices.dieselPerLitreNgn),
    };
    if (before.petrol === live.petrol && before.diesel === live.diesel) {
      return { published: false, message: 'The rate card already matches the pump price.', ...before };
    }

    await this.rateCardRepo.update(current.id, { isActive: false, deactivatedAt: new Date() });
    const fresh = this.rateCardRepo.create({
      ...current,
      id: undefined,
      version: (current.version ?? 0) + 1,
      isActive: true,
      activatedAt: new Date(),
      deactivatedAt: null,
      createdAt: undefined,
      fuelPrices: { petrolPerLitreNgn: live.petrol, dieselPerLitreNgn: live.diesel },
      activatedBy:  admin?.name ?? admin?.email ?? 'admin',
      changeReason: `Fuel synced to pump price: petrol NGN ${before.petrol} to ${live.petrol}, diesel NGN ${before.diesel} to ${live.diesel}.`,
    });
    const saved = await this.rateCardRepo.save(fresh as any);
    return {
      published: true,
      version:   (saved as any).version,
      from:      before,
      to:        { petrol: live.petrol, diesel: live.diesel },
    };
  }

  @Put('admin/rate-card')
  async publishRateCard(@Body() body: Partial<RateCard> & { changeReason: string; activatedBy: string }) {
    if (!body.changeReason) {
      throw new BadRequestException('changeReason is required - explain what changed and why.');
    }

    // Deactivate the current active card and increment version.
    const current = await this.rateCardRepo.findOne({ where: { isActive: true } });
    const nextVersion = (current?.version ?? 0) + 1;

    if (current) {
      await this.rateCardRepo.update(current.id, {
        isActive: false,
        deactivatedAt: new Date(),
      });
    }

    const fresh = this.rateCardRepo.create({
      ...current,           // copy unchanged fields
      ...body,              // override only what admin sent
      id: undefined,
      version: nextVersion,
      isActive: true,
      activatedAt: new Date(),
      deactivatedAt: null,
      createdAt: undefined,
    });
    return this.rateCardRepo.save(fresh as any);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/rate-cards')
  async listRateCards() {
    return this.rateCardRepo.find({ order: { version: 'DESC' } });
  }

  // Service categories carry surcharges, so editing one moves prices.
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @Put('admin/service-catalog/:code')
  async upsertCategory(@Param('code') code: string, @Body() body: Partial<ServiceCategory>) {
    const existing = await this.categoryRepo.findOne({ where: { code } });
    if (existing) {
      await this.categoryRepo.update(existing.id, body);
      return this.categoryRepo.findOne({ where: { id: existing.id } });
    }
    const created = this.categoryRepo.create({ ...body, code });
    return this.categoryRepo.save(created as any);
  }
}
