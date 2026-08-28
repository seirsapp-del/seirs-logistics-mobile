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
import { redactRateCardForPublic } from './redact-rate-card';

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
    // Redacted: this route has no token, so it must not carry the driver
    // cost basis or the founder's name. See redact-rate-card.ts.
    return redactRateCardForPublic(await this.pricing.getActiveRateCard() as any);
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
          // The honest mini-breakdown for the price tap (founder
          // 2026-08-23): the exact engine lines, no re-derivation.
          breakdown: {
            base:       Math.round(Number(b.customer.base ?? 0)),
            distance:   Math.round(Number(b.customer.distanceLabour ?? 0) + Number(b.customer.distanceFuel ?? 0)),
            night:      Math.round(Number(b.customer.timeSurcharges?.night ?? 0)),
            peak:       Math.round(Number(b.customer.timeSurcharges?.peak ?? 0)),
            weekend:    Math.round(Number(b.customer.timeSurcharges?.weekend ?? 0)),
            vat:        Math.round(Number(b.customer.vat ?? 0)),
          },
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

  /**
   * Super admin only (2026-08-13 RBAC audit): publishing a rate card
   * changes what every future delivery and ride costs, platform-wide.
   *
   * THIS RAN UNAUTHENTICATED IN PRODUCTION until the 2026-08-23 sweep.
   * The guard above was written for this method, but a JSDoc block was
   * later inserted between the decorator and the handler, so TypeScript
   * bound it to the NEXT decorated method instead: sync-fuel carried the
   * guard twice and this one carried none. Verified live with an
   * unauthenticated PUT that reached the handler body (400 changeReason
   * required) rather than 401. There is no global JWT guard to fall back
   * on: the only APP_GUARD is the throttler.
   *
   * Never separate a @UseGuards from its handler with a comment block.
   */
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
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

    /**
     * Merge the nested price maps per entry, do not replace them.
     *
     * `...body` is a shallow spread, so a submitted vehicleRates object
     * replaced the stored one wholesale. Any key the caller happened not
     * to send was therefore deleted, and the dashboard was submitting a
     * REDACTED card with the entire driver cost basis missing. That is a
     * belt-and-braces guard alongside the real fix, which is that the
     * editor now loads the unredacted card: a partial payload should
     * never be able to silently drop driver pay, whoever sends it.
     */
    const mergeRates = (stored: any, sent: any) => {
      if (!sent || typeof sent !== 'object') return stored;
      if (!stored || typeof stored !== 'object') return sent;
      const out: any = { ...stored };
      for (const [k, v] of Object.entries(sent)) {
        out[k] = (v && typeof v === 'object' && !Array.isArray(v) &&
                  stored[k] && typeof stored[k] === 'object')
          ? { ...stored[k], ...v }
          : v;
      }
      return out;
    };

    const fresh = this.rateCardRepo.create({
      ...current,           // copy unchanged fields
      ...body,              // override only what admin sent
      vehicleRates:   mergeRates(current?.vehicleRates,   (body as any).vehicleRates),
      rideRates:      mergeRates(current?.rideRates,      (body as any).rideRates),
      stopAndDwell:   { ...(current?.stopAndDwell   ?? {}), ...((body as any).stopAndDwell   ?? {}) },
      timeSurcharges: mergeRates(current?.timeSurcharges, (body as any).timeSurcharges),
      highValue:      { ...(current?.highValue      ?? {}), ...((body as any).highValue      ?? {}) },
      id: undefined,
      version: nextVersion,
      isActive: true,
      activatedAt: new Date(),
      deactivatedAt: null,
      createdAt: undefined,
    });
    return this.rateCardRepo.save(fresh as any);
  }

  /**
   * GET /api/v1/admin/rate-card/active
   *
   * The WHOLE card, driver cost basis included (2026-08-28).
   *
   * The dashboard's rate-card editor was loading /config/rate-card,
   * which is @Public() and deliberately redacted: it strips
   * baseFareDriver, labourPerKmDriver, the ride equivalents, the stop
   * and dwell driver bonuses, every driverSharePercent and the
   * high-value driver share, because that route has no token and the
   * driver cost basis is the margin on every vehicle SEIRS runs.
   *
   * Two consequences, one visible and one not.
   *
   * The visible one: the founder screenshotted the vehicle table with
   * every driver column blank and asked what they were. They were blank
   * because they had been stripped on the way to his browser.
   *
   * The dangerous one: publish spreads the submitted body over the
   * current card, and vehicleRates is a single jsonb object, so a
   * shallow spread REPLACES it. Publishing from that page would have
   * written the redacted shape back, dropping baseFareDriver entirely.
   * Not to zero: to undefined, which makes dBase = undefined * mult =
   * NaN, and NaN propagates through driverTotal into seirsNet. One press
   * of Publish new version and every quote returns NaN for driver pay.
   *
   * Nobody has pressed it: v1 and v2 both still carry motorcycle
   * baseFareDriver 200 and labourPerKmDriver 80.
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/rate-card/active')
  async getActiveRateCardForAdmin() {
    return this.pricing.getActiveRateCard();
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
