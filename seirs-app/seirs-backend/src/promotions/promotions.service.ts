import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Promotion, PromoStatus, PromoType } from './promotion.entity';
import { PromoRedemption } from './promo-redemption.entity';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)        private repo:     Repository<Promotion>,
    @InjectRepository(PromoRedemption)  private redempt:  Repository<PromoRedemption>,
  ) {}

  // ── Admin CRUD ────────────────────────────────────────────────────────────
  list(opts: { status?: PromoStatus } = {}) {
    const where = opts.status ? { status: opts.status } : {};
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getOne(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Promotion not found');
    return row;
  }

  async create(adminId: string, body: {
    code: string; type: PromoType; value: number; description?: string;
    validFrom: string; validTo: string;
    usageLimit?: number; perUserLimit?: number;
    minSubtotalKobo?: number; maxDiscountKobo?: number | null;
  }) {
    const code = body.code?.trim().toUpperCase();
    if (!code || !/^[A-Z0-9]{3,20}$/.test(code)) {
      throw new BadRequestException('Code must be 3-20 uppercase alphanumeric characters.');
    }

    const existing = await this.repo.findOne({ where: { code } });
    if (existing) throw new BadRequestException(`Code "${code}" already exists.`);

    if (!Object.values(PromoType).includes(body.type)) {
      throw new BadRequestException('Invalid promo type.');
    }
    const value = Number(body.value);
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException('Value must be a non-negative number.');
    }
    if (body.type === PromoType.PERCENT && value > 100) {
      throw new BadRequestException('Percent discount cannot exceed 100.');
    }

    const validFrom = new Date(body.validFrom);
    const validTo   = new Date(body.validTo);
    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) {
      throw new BadRequestException('Invalid validFrom / validTo.');
    }
    if (validTo <= validFrom) {
      throw new BadRequestException('validTo must be after validFrom.');
    }

    const now = new Date();
    const status: PromoStatus = validFrom > now
      ? PromoStatus.SCHEDULED
      : validTo < now
        ? PromoStatus.EXPIRED
        : PromoStatus.ACTIVE;

    const promo = this.repo.create({
      code,
      type:            body.type,
      value,
      description:     body.description,
      validFrom,
      validTo,
      usageLimit:      body.usageLimit      ?? 0,
      perUserLimit:    body.perUserLimit    ?? 1,
      minSubtotalKobo: body.minSubtotalKobo ?? 0,
      maxDiscountKobo: body.maxDiscountKobo ?? null,
      status,
      createdByUserId: adminId,
    });
    return this.repo.save(promo);
  }

  async update(id: string, body: Partial<{
    description: string;
    status:      PromoStatus;
    validFrom:   string;
    validTo:     string;
    usageLimit:  number;
    perUserLimit: number;
    minSubtotalKobo: number;
    maxDiscountKobo: number | null;
  }>) {
    const row = await this.getOne(id);
    if (body.description !== undefined)     row.description = body.description;
    if (body.status      !== undefined)     row.status      = body.status;
    if (body.validFrom)                     row.validFrom   = new Date(body.validFrom);
    if (body.validTo)                       row.validTo     = new Date(body.validTo);
    if (body.usageLimit  !== undefined)     row.usageLimit  = body.usageLimit;
    if (body.perUserLimit !== undefined)    row.perUserLimit = body.perUserLimit;
    if (body.minSubtotalKobo !== undefined) row.minSubtotalKobo = body.minSubtotalKobo;
    if (body.maxDiscountKobo !== undefined) row.maxDiscountKobo = body.maxDiscountKobo;
    return this.repo.save(row);
  }

  async remove(id: string) {
    const row = await this.getOne(id);
    if (row.usageCount > 0) {
      throw new ForbiddenException('Cannot delete a promotion that has been used — pause it instead.');
    }
    await this.repo.remove(row);
    return { ok: true };
  }

  // ── Customer-facing ───────────────────────────────────────────────────────
  // Visible promos = active OR scheduled within the next 14 days.
  async listActive() {
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const rows = await this.repo.find({
      where: [
        { status: PromoStatus.ACTIVE, validTo: MoreThanOrEqual(now) },
        { status: PromoStatus.SCHEDULED, validFrom: LessThanOrEqual(horizon) },
      ],
      order: { validFrom: 'ASC' },
    });
    return rows.map(r => ({
      id:           r.id,
      code:         r.code,
      type:         r.type,
      value:        Number(r.value),
      description:  r.description,
      validFrom:    r.validFrom,
      validTo:      r.validTo,
      minSubtotalKobo: r.minSubtotalKobo,
      status:       r.status,
    }));
  }

  // Validate + record a redemption. Idempotent enough that the caller
  // (a future delivery booking flow) can call this once the customer
  // commits, and look up `discountAppliedKobo` on the returned row to
  // know what to apply.
  async redeem(userId: string, body: { code: string; subtotalKobo: number; deliveryId?: string }) {
    const code = body.code?.trim().toUpperCase();
    if (!code) throw new BadRequestException('Code required.');

    const promo = await this.repo.findOne({ where: { code } });
    if (!promo) throw new NotFoundException('Code not found.');

    const now = new Date();
    if (promo.status !== PromoStatus.ACTIVE) {
      if (promo.status === PromoStatus.PAUSED) throw new BadRequestException('Promo is paused.');
      if (promo.status === PromoStatus.EXPIRED) throw new BadRequestException('Promo has expired.');
      if (promo.status === PromoStatus.SCHEDULED) throw new BadRequestException('Promo is not active yet.');
    }
    if (promo.validFrom > now) throw new BadRequestException('Promo is not active yet.');
    if (promo.validTo   < now) throw new BadRequestException('Promo has expired.');

    if (promo.minSubtotalKobo > 0 && body.subtotalKobo < promo.minSubtotalKobo) {
      throw new BadRequestException(
        `Order must be at least ₦${(promo.minSubtotalKobo / 100).toLocaleString()} to use this code.`,
      );
    }

    if (promo.usageLimit > 0 && promo.usageCount >= promo.usageLimit) {
      throw new BadRequestException('Promo usage limit reached.');
    }

    if (promo.perUserLimit > 0) {
      const used = await this.redempt.count({ where: { userId, promotion: { id: promo.id } } });
      if (used >= promo.perUserLimit) {
        throw new BadRequestException('You have already used this promo.');
      }
    }

    const discount = this.computeDiscount(promo, body.subtotalKobo);

    const row = this.redempt.create({
      userId,
      promotion: promo,
      deliveryId: body.deliveryId,
      discountAppliedKobo: discount,
    });
    await this.redempt.save(row);

    promo.usageCount += 1;
    await this.repo.save(promo);

    return {
      id:                  row.id,
      promoId:             promo.id,
      code:                promo.code,
      discountAppliedKobo: discount,
      finalSubtotalKobo:   Math.max(0, body.subtotalKobo - discount),
    };
  }

  private computeDiscount(promo: Promotion, subtotalKobo: number): number {
    const value = Number(promo.value);
    let raw = 0;
    switch (promo.type) {
      case PromoType.FLAT_DISCOUNT:
        raw = Math.round(value * 100);
        break;
      case PromoType.PERCENT:
        raw = Math.round(subtotalKobo * (value / 100));
        break;
      case PromoType.FREE_DELIVERY:
        raw = subtotalKobo;
        break;
    }
    if (promo.maxDiscountKobo) raw = Math.min(raw, promo.maxDiscountKobo);
    return Math.min(raw, subtotalKobo);
  }
}
