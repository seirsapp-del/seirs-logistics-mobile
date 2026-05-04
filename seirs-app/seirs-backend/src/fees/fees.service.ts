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

  // Idempotent seed — only inserts rows that don't already exist by key.
  // Existing fees are NEVER overwritten so production values persist.
  async onModuleInit() {
    const existing  = await this.feesRepo.find({ select: ['key'] });
    const existingKeys = new Set(existing.map(f => f.key));
    const toInsert  = FEE_SEEDS.filter(f => !existingKeys.has(f.key!));
    if (toInsert.length === 0) {
      this.logger.log(`Fee Catalogue already seeded (${existing.length} fees present)`);
      return;
    }
    await this.feesRepo.save(toInsert.map(f => this.feesRepo.create(f)));
    this.logger.log(`Seeded ${toInsert.length} new fees into the Fee Catalogue`);
  }

  // ── Public read path (cached) ──────────────────────────────────────────
  // Returns the live numeric value for a fee. Hot path — used by the
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

  // Same as getValue but returns 0 instead of throwing — useful for
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
    patch: { value?: number; active?: boolean; currentNote?: string },
    admin: { id?: string; sub?: string; name?: string },
  ) {
    const existing = await this.getOne(key);

    const newValue  = patch.value  != null ? Number(patch.value)  : Number(existing.value);
    const newActive = patch.active != null ? patch.active         : existing.active;

    if (!Number.isFinite(newValue)) {
      throw new BadRequestException('value must be a finite number');
    }

    // Skip writing if nothing actually changed — don't pollute history
    if (Number(existing.value) === newValue && existing.active === newActive && patch.currentNote == null) {
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
      currentNote:       patch.currentNote ?? existing.currentNote,
      lastUpdatedById:   admin.id ?? admin.sub,
      lastUpdatedByName: admin.name ?? 'Admin',
    });

    // Invalidate caches — both the per-key entry and the all-active list
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
