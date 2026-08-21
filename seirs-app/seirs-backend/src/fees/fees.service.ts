import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Fee, FeeCategory, FeeUnit } from './fee.entity';
import { FeeHistory } from './fee-history.entity';
import { RedisService } from '../tracking/redis.service';
import { FEE_SEEDS } from './fees.seed';

const CACHE_TTL_SEC  = 60;
const CACHE_KEY_PREFIX = 'fee:';
const ALL_CACHE_KEY  = 'fees:all_active';

@Injectable()
export class FeesService implements OnModuleInit {
  private readonly logger = new Logger(FeesService.name);

  constructor(
    @InjectRepository(Fee)         private feesRepo:    Repository<Fee>,
    @InjectRepository(FeeHistory)  private historyRepo: Repository<FeeHistory>,
    private readonly redisService: RedisService,
  ) {}

  // Idempotent seed - only inserts rows that don't already exist by key.
  // Existing fees are NEVER overwritten so production values persist.
  async onModuleInit() {
    /**
     * Postgres enums do not grow by themselves and production runs with
     * schema sync off, so a new FeeCategory value has to be added by
     * hand or every insert using it fails.
     */
    try {
      await this.feesRepo.query(
        `ALTER TYPE "fees_category_enum" ADD VALUE IF NOT EXISTS 'loyalty'`,
      );
    } catch (e: any) {
      this.logger.error(`fee category self-heal FAILED: ${e?.message ?? e}`);
    }

    // Same story for units: eleven rows carry durations or counts, and
    // rendering them as naira put "N7" on the abandonment threshold.
    // Must run BEFORE the seed below, or a fresh database rejects the
    // first row carrying one of these labels.
    for (const label of ['minutes', 'hours', 'days', 'count', 'hour_of_day']) {
      try {
        await this.feesRepo.query(
          `ALTER TYPE "fees_unit_enum" ADD VALUE IF NOT EXISTS '${label}'`,
        );
      } catch (e: any) {
        this.logger.error(`fee unit self-heal FAILED for '${label}': ${e?.message ?? e}`);
      }
    }

    const existing  = await this.feesRepo.find({ select: ['key', 'unit'] });
    const existingKeys = new Set(existing.map(f => f.key));
    const toInsert  = FEE_SEEDS.filter(f => !existingKeys.has(f.key!));
    if (toInsert.length > 0) {
      await this.feesRepo.save(toInsert.map(f => this.feesRepo.create(f)));
      this.logger.log(`Seeded ${toInsert.length} new fees into the Fee Catalogue`);
    } else {
      this.logger.log(`Fee Catalogue already seeded (${existing.length} fees present)`);
    }

    // The seed is insert-only for VALUES, which belong to the admin. The
    // unit is code-owned metadata with no editor in the dashboard, so a
    // row whose stored unit disagrees with the seed is simply stale.
    // Production rows all predate the non-monetary units, which is how
    // "7 days" came to render as a price.
    const unitByKey = new Map(existing.map(f => [f.key, String(f.unit)]));
    let fixed = 0;
    for (const seed of FEE_SEEDS) {
      const stored = unitByKey.get(seed.key!);
      if (stored && seed.unit && stored !== String(seed.unit)) {
        try {
          await this.feesRepo.update(seed.key!, { unit: seed.unit });
          fixed++;
        } catch (e: any) {
          this.logger.error(`unit sync failed for ${seed.key}: ${e?.message ?? e}`);
        }
      }
    }
    if (fixed) this.logger.log(`Corrected the unit on ${fixed} existing fee row(s)`);
  }

  // ── Public read path (cached) ──────────────────────────────────────────
  // Returns the live numeric value for a fee. Hot path - used by the
  // pricing engine and quote endpoint. Cache TTL keeps DB pressure low
  // while propagating admin edits within 60s.
  async getValue(key: string): Promise<number> {
    const cached = await this.redisService.get(`${CACHE_KEY_PREFIX}${key}`);
    if (cached !== null) return Number(cached);

    const row = await this.feesRepo.findOne({ where: { key } });
    if (!row || !row.active) {
      throw new NotFoundException(`Fee not found or disabled: ${key}`);
    }
    const value = Number(row.value);
    await this.redisService.set(`${CACHE_KEY_PREFIX}${key}`, String(value), CACHE_TTL_SEC);
    return value;
  }

  // Same as getValue but returns 0 instead of throwing - useful for
  // optional fees (e.g. zone surcharges) where missing = no surcharge.
  async getValueOr(key: string, fallback: number): Promise<number> {
    try {
      return await this.getValue(key);
    } catch {
      return fallback;
    }
  }

  // Returns all active fees in one shot, cached. Used by client apps
  // that need to render a price breakdown screen.
  async getAllActive(): Promise<Fee[]> {
    const cached = await this.redisService.get(ALL_CACHE_KEY);
    if (cached !== null) {
      try { return JSON.parse(cached) as Fee[]; } catch { /* fallthrough */ }
    }
    const rows = await this.feesRepo.find({
      where: { active: true },
      order: { category: 'ASC', name: 'ASC' },
    });
    await this.redisService.set(ALL_CACHE_KEY, JSON.stringify(rows), CACHE_TTL_SEC);
    return rows;
  }

  // ── Admin read path ────────────────────────────────────────────────────

  async listAll() {
    return this.feesRepo.find({ order: { category: 'ASC', name: 'ASC' } });
  }

  async getOne(key: string) {
    const row = await this.feesRepo.findOne({ where: { key } });
    if (!row) throw new NotFoundException(`Fee not found: ${key}`);
    return row;
  }

  async getHistory(key: string, limit = 50) {
    return this.historyRepo.find({
      where: { feeKey: key },
      order: { changedAt: 'DESC' },
      take:  limit,
    });
  }

  // ── Admin write path ───────────────────────────────────────────────────

  async update(
    key: string,
    /**
     * unit is editable because a fee's PERIOD is part of its price.
     * Driver Premium shipped at NGN 5,000 per WEEK, which is NGN 21,667 a
     * month against a Lagos rider income of NGN 150k-300k. Correcting
     * that meant moving it to a monthly period, and there was no way to
     * do it from the dashboard: seeds only apply to an empty table, so
     * the only route was a deploy (review 2026-08-18).
     */
    /**
     * category is editable because where a row APPEARS is part of
     * whether anyone can find it. Twenty-four rows were seeded into
     * System Config, which renders last after eleven other groups, so
     * the founder went looking for counter and loyalty settings and
     * could not find them (2026-08-18).
     */
    patch: { value?: number; active?: boolean; currentNote?: string; unit?: FeeUnit; category?: FeeCategory },
    admin: { id?: string; sub?: string; name?: string },
  ) {
    const existing = await this.getOne(key);

    const newValue  = patch.value  != null ? Number(patch.value)  : Number(existing.value);
    const newActive = patch.active != null ? patch.active         : existing.active;
    const newUnit   = patch.unit   != null ? patch.unit           : existing.unit;
    const newCat    = patch.category != null ? patch.category      : existing.category;

    if (patch.category != null && !Object.values(FeeCategory).includes(patch.category)) {
      throw new BadRequestException(`category must be one of: ${Object.values(FeeCategory).join(', ')}`);
    }

    if (patch.unit != null && !Object.values(FeeUnit).includes(patch.unit)) {
      throw new BadRequestException(`unit must be one of: ${Object.values(FeeUnit).join(', ')}`);
    }

    if (!Number.isFinite(newValue)) {
      throw new BadRequestException('value must be a finite number');
    }

    // Skip writing if nothing actually changed - don't pollute history
    if (Number(existing.value) === newValue && existing.active === newActive
        && existing.unit === newUnit && existing.category === newCat
        && patch.currentNote == null) {
      return existing;
    }

    // Append history BEFORE the mutation so the audit trail is intact
    // even if the update fails downstream.
    await this.historyRepo.save(this.historyRepo.create({
      feeKey:         key,
      previousValue:  Number(existing.value),
      newValue,
      previousActive: existing.active,
      newActive,
      changedById:    admin.id ?? admin.sub,
      changedByName:  admin.name ?? 'Admin',
      note:           patch.currentNote ?? null,
    }));

    await this.feesRepo.update(key, {
      value:             newValue,
      active:            newActive,
      unit:              newUnit,
      category:          newCat,
      currentNote:       patch.currentNote ?? existing.currentNote,
      lastUpdatedById:   admin.id ?? admin.sub,
      lastUpdatedByName: admin.name ?? 'Admin',
    });

    // Invalidate caches - both the per-key entry and the all-active list
    await this.redisService.del(`${CACHE_KEY_PREFIX}${key}`);
    await this.redisService.del(ALL_CACHE_KEY);

    return this.getOne(key);
  }

  // Group all fees by category for the admin UI. Returns `{ commission: [...], surge: [...], ... }`.
  async listGroupedByCategory(): Promise<Record<string, Fee[]>> {
    const all = await this.listAll();
    const grouped: Record<string, Fee[]> = {};
    for (const cat of Object.values(FeeCategory)) grouped[cat] = [];
    for (const fee of all) {
      (grouped[fee.category] ??= []).push(fee);
    }
    return grouped;
  }
}
