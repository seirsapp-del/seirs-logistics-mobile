import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In} from 'typeorm';
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
  /**
   * Rows that were editable in the Fee Catalogue and enforced nowhere.
   *
   * Removing a key from the seed stops it being RE-created; it does not
   * remove the row that is already there, so without this the catalogue
   * keeps offering a number that changes nothing. An admin-tunable knob
   * wired to no consumer is worse than a missing feature, because
   * somebody sets it and believes the platform changed.
   *
   * Each of these was checked for consumers across the whole backend
   * before deletion (2026-08-28):
   *   multi_stop_discount and lekki_zone_surcharge appeared in the seed
   *     and nowhere else.
   *
   * storage_return_fee was in this list for a few minutes and was taken
   * out again: it has no consumer either, but the approved
   * exception-path spec names it, so it is unwired rather than dead.
   * Deleting an unimplemented requirement hides the gap instead of
   * closing it.
   *   night_fee_pct, night_window_start_hour, night_window_end_hour
   *     were read by deliveries.service and then thrown away, because
   *     RATE_CARD_OWNS_NIGHT is hardcoded true and the rate card's
   *     timeSurcharges owns night pricing. Editing them changed nothing.
   *
   * Anything genuinely superseded rather than dead has a live home:
   * area pricing is the Zones page, night is the Pricing Engine's time
   * surcharges, returns are return_to_sender_fee.
   */
  private static readonly RETIRED_KEYS = [
    /**
     * A THIRD fuel price (founder, 2026-08-28: "we have 2 fuel prices
     * thats not okay"). There were three.
     *
     * current_fuel_price sits in the database at 770 next to
     * current_petrol_price_ngn at 1380 and current_diesel_price_ngn at
     * 1650. It appears nowhere in this codebase, not even in the seed
     * below, so it is a leftover of an older seed that was never
     * cleaned up: editable, stale, and adding a third answer to a
     * question that already had two.
     *
     * Deleted rather than kept as a future knob, because the founder's
     * rule is that a value left at ZERO is deliberate, and this is not
     * zero. It is an abandoned value with no code path and no seed row
     * to recreate it.
     */
    'current_fuel_price',
    'multi_stop_discount',
    'lekki_zone_surcharge',
    /* Superseded: rider pay comes from the rate card's per-vehicle driver
       base and per-km. platform_commission_pct settles only jobs recorded
       before that figure was stored (audit, 2026-08-28). */
    'driver_commission_packages',
    'driver_commission_rides',
    /*
     * Both replaced by a rate-card field that is live, and neither was
     * read by one line of code anywhere in the backend or the three apps
     * (audit, 2026-08-28). Not zero-valued, so the standing rule about
     * deliberate zeroes does not cover them: they are duplicates of a
     * working feature, which is exactly what the founder asked to be
     * removed rather than left to be edited by mistake.
     *
     *   customer_booking_fee, NGN 100, a flat fee on every order. The
     *     rate card's serviceFees.packageNgn and rideNgn do this and are
     *     read at pricing.service.ts:1238, :823 and :887. Its only
     *     mention outside the seed was a comment claiming PricingService
     *     reads it. PricingService does not.
     *
     *   surge_multiplier_peak, 150 percent, a peak-demand multiplier.
     *     The rate card's timeSurcharges.peak does this, with its own
     *     window and its own driver share.
     *
     * pool_ride_discount was checked with them and KEPT: it is equally
     * unread, but pooling is deferred by founder decision rather than
     * replaced, so its value is a decision already made. It moves to
     * "Not launched yet" instead.
     */
    'customer_booking_fee',
    'surge_multiplier_peak',
    /*
     * storage_return_fee, settled against the approved spec (2026-08-28).
     *
     * I removed this once for having no consumer, restored it because the
     * "When Delivery Fails" artifact appeared to name it, and left it as
     * an open question in this audit. Reading the artifact properly
     * settles it: its authoritative fee table lists ELEVEN rows under
     * "All eleven rows now have consumers", and storage_return_fee is
     * not one of them. Its only appearance is a build-state line pairing
     * it with storage_24_72hr, which the fee table does not support.
     *
     * The involuntary overstay path it was supposed to price is priced,
     * by return_to_sender_fee, live at partner-store.service.ts:1649.
     * Voluntary recalls are trip-priced per the same spec and take no
     * flat fee at all.
     *
     * So it is a leftover from an earlier draft of a design that
     * replaced it, which is the one case where this list applies.
     */
    'storage_return_fee',
    /* The instant-withdrawal feature was removed by founder decision
       (2026-08-27: "the first false promise i noticed"). The option is
       gone from the rider app; these are its leftover knobs. */
    'instant_cashout_fee',
    'instant_payout_fee_pct',
    'instant_payout_min_age_hours',
    'night_fee_pct',
    'night_window_start_hour',
    'night_window_end_hour',
  ];

  async onModuleInit() {
    try {
      const res = await this.feesRepo.delete({ key: In(FeesService.RETIRED_KEYS) } as any);
      if (res.affected) {
        this.logger?.log?.(`Removed ${res.affected} retired fee rows that no code reads.`);
      }
    } catch (e: any) {
      this.logger?.warn?.(`Could not prune retired fee rows: ${e?.message ?? e}`);
    }

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
    for (const label of ['minutes', 'hours', 'days', 'count', 'hour_of_day', 'points', 'months']) {
      try {
        await this.feesRepo.query(
          `ALTER TYPE "fees_unit_enum" ADD VALUE IF NOT EXISTS '${label}'`,
        );
      } catch (e: any) {
        this.logger.error(`fee unit self-heal FAILED for '${label}': ${e?.message ?? e}`);
      }
    }

    const existing  = await this.feesRepo.find({ select: ['key', 'unit', 'description', 'name'] });
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
    /**
     * The DESCRIPTION is synced for the same reason as the unit, and it
     * matters more (audit, 2026-08-28).
     *
     * The catalogue has no description editor: the text is read-only in
     * the dashboard, written here, and describes what the code does. So a
     * stored description that no longer matches the code is stale by
     * definition, and nobody can correct it from the admin side.
     *
     * Two were actively lying. platform_commission_pct said "applied at
     * escrow release when the driver is paid", which stopped being true
     * when driver pay moved to the rate card and left the percentage as a
     * fallback for legacy rows. min_job_margin_ngn called itself a floor
     * that quotes are held to; it set a flag nothing read. Both invited
     * an operator to change a number and expect the platform to move.
     *
     * The VALUE is still never touched. That belongs to the admin.
     */
    const metaByKey = new Map(existing.map(f => [f.key, f]));
    let fixed = 0;
    for (const seed of FEE_SEEDS) {
      const stored = metaByKey.get(seed.key!);
      if (!stored) continue;
      const patch: Partial<Fee> = {};
      if (seed.unit && String(stored.unit) !== String(seed.unit)) patch.unit = seed.unit;
      if (seed.description && stored.description !== seed.description) {
        patch.description = seed.description;
      }
      // The NAME is display-only in the dashboard too, so a wrong one is
      // equally uncorrectable from the admin side. storage_24_72hr was
      // labelled "Storage Fee (24-72hr)" for a band the code has never
      // had: it charges every started day until the abandonment
      // threshold, so the label promised that charging stops on day
      // three (audit, 2026-08-28).
      if (seed.name && stored.name !== seed.name) patch.name = seed.name;
      if (Object.keys(patch).length === 0) continue;
      try {
        await this.feesRepo.update(seed.key!, patch);
        fixed++;
      } catch (e: any) {
        this.logger.error(`metadata sync failed for ${seed.key}: ${e?.message ?? e}`);
      }
    }
    if (fixed) this.logger.log(`Refreshed code-owned metadata on ${fixed} fee row(s)`);
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
