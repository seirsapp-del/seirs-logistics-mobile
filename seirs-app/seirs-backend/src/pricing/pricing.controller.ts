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

  // ── Public config endpoints (apps fetch on boot) ─────────────────────

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
    return this.pricing.computePrice(body);
  }

  // ── Admin endpoints ──────────────────────────────────────────────────
  // NOTE: a proper admin guard is wired separately in admin.module; the
  // JwtAuthGuard here ensures only authenticated users can hit these.
  // Production should add an explicit role check via RolesGuard.

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put('admin/rate-card')
  async publishRateCard(@Body() body: Partial<RateCard> & { changeReason: string; activatedBy: string }) {
    if (!body.changeReason) {
      throw new BadRequestException('changeReason is required — explain what changed and why.');
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

  @UseGuards(JwtAuthGuard, AdminGuard)
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
