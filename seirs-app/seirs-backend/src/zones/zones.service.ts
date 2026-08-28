import {
  Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FeesService } from '../fees/fees.service';
import { UserRole, AdminSubRole } from '../users/user.entity';
import { NIGERIAN_STATES, getState, type StateCode, type GeopoliticalZone } from '../pricing/regions';
import {
  Zone, type ZoneShape, type ZoneStatus, type ZoneEffects, type ZoneActiveWindow,
} from './zone.entity';
import { isBlockingStatus, parseHhmm } from './zone-window';
import { type ZonePoint } from './zone-geometry';
import {
  resolveZoneDecision, EMPTY_ZONE_DECISION, type ZoneDecision,
} from './zone-resolution';
import {
  permissionsForTransition, permissionsRequiredBy, permsSatisfy,
  missingPermissionMessage, type ZonePermission,
} from './zones.permissions';

const ZONE_STATUSES: ZoneStatus[] = ['open', 'surcharged', 'no_pickup', 'no_dropoff', 'closed'];
const ZONE_SHAPE_KINDS = ['circle', 'polygon', 'state', 'geozone'];
const GEOZONES: GeopoliticalZone[] = ['NC', 'NE', 'NW', 'SE', 'SS', 'SW'];

/** Minimal view of the signed-in admin. Matches what JwtStrategy attaches. */
export interface ZoneActor {
  id?: string;
  role?: UserRole | string;
  adminRole?: AdminSubRole | string | null;
  roleId?: string | null;
}

export interface ZoneWriteDto {
  name?:     string;
  colour?:   string;
  shape?:    ZoneShape;
  status?:   ZoneStatus;
  effects?:  ZoneEffects;
  active?:   ZoneActiveWindow;
  reason?:   string;
  priority?: number;
  published?: boolean;
}

export interface ZoneEvaluateInput {
  pickup:   ZonePoint;
  dropoff?: ZonePoint | null;
  vehicleType?: string | null;
  /**
   * The instant to evaluate against. For a scheduled booking this is the
   * SCHEDULED time, not now: a 7pm pickup inside a 6pm curfew has to fail
   * at 2pm while it is still fixable.
   */
  at?: Date | null;
}

@Injectable()
export class ZonesService {
  private readonly logger = new Logger(ZonesService.name);

  constructor(
    @InjectRepository(Zone) private readonly repo: Repository<Zone>,
    private readonly fees: FeesService,
    private readonly ds: DataSource,
  ) {}

  // ── Tunables ───────────────────────────────────────────────────────
  // Every number the engine leans on is a Fee Catalogue row with a code
  // fallback, so a bad guardrail is an admin edit rather than a deploy.

  /** Nigeria is WAT (UTC+1) all year, but the knob exists so a host in another zone is config. */
  private windowOffsetMinutes(): Promise<number> {
    return this.fees.getValueOr('zone_window_utc_offset_min', 60);
  }

  /**
   * Cap on the SUM of the two ends' surcharges.
   *
   * Stacking is how a quote quietly doubles. The same discipline already
   * caps stacked discounts so the service fee is not eroded; this is the
   * mirror of it so a job that starts and finishes in difficult areas
   * cannot price itself out of existence by accident.
   */
  private maxTotalSurchargePct(): Promise<number> {
    return this.fees.getValueOr('zone_max_total_surcharge_pct', 100);
  }

  private guardrails(): Promise<[number, number, number]> {
    return Promise.all([
      this.fees.getValueOr('zone_min_rate_multiplier', 0.5),
      this.fees.getValueOr('zone_max_rate_multiplier', 3),
      this.fees.getValueOr('zone_max_surcharge_pct', 100),
    ]);
  }

  // ── Authorization ──────────────────────────────────────────────────

  /**
   * The permissions this actor actually holds, read LIVE from the roles
   * table rather than from the JWT.
   *
   * The token would be cheaper, but admin tokens live 30 minutes, so an
   * admin whose zone permissions were revoked would keep closing and
   * repricing areas for the rest of that window. SuperAdminGuard already
   * made exactly this call for the money endpoints and the reasoning is
   * the same here. It also has to be live because JwtStrategy attaches
   * the User ROW, not the token payload, so there is no permissions
   * claim on req.user to read in the first place.
   *
   * A legacy admin (role 'admin', no adminRole, no roleId) gets nothing.
   * The admin dashboard treats those accounts as holding every PAGE, but
   * SuperAdminGuard refuses them on every endpoint that moves money, and
   * a closure is a heavier action than that, not a lighter one.
   */
  async permissionsOf(actor: ZoneActor | null | undefined): Promise<string[]> {
    if (!actor || actor.role !== UserRole.ADMIN) return [];
    if (actor.adminRole === AdminSubRole.SUPER_ADMIN) return ['*'];
    if (!actor.roleId) return [];
    const row = await this.ds
      .createQueryBuilder()
      .select(['r.slug AS slug', 'r.permissions AS permissions'])
      .from('roles', 'r')
      .where('r.id = :id', { id: actor.roleId })
      .getRawOne();
    if (!row) return [];
    if (row.slug === 'super_admin') return ['*'];
    return Array.isArray(row.permissions) ? row.permissions : [];
  }

  /**
   * Authorization is not authentication. AdminGuard on the controller
   * proves the caller is staff; this checks that THIS actor may make
   * THIS change to THIS row, which is a different question and the one
   * that actually protects the area on the ground.
   */
  private async assertMay(actor: ZoneActor, needed: ZonePermission[]): Promise<void> {
    if (needed.length === 0) return;
    const held = await this.permissionsOf(actor);
    if (permsSatisfy(held, needed)) return;
    const missing = needed.filter(p => held.indexOf(p) < 0 && held.indexOf('*') < 0);
    throw new ForbiddenException(missingPermissionMessage(missing));
  }

  // ── Validation ─────────────────────────────────────────────────────

  private normaliseShape(shape: any): ZoneShape {
    if (!shape || typeof shape !== 'object' || ZONE_SHAPE_KINDS.indexOf(shape.kind) < 0) {
      throw new BadRequestException('Pick a shape: a circle, a polygon, a state or a geopolitical zone.');
    }
    switch (shape.kind) {
      case 'circle': {
        const lat = Number(shape.lat), lng = Number(shape.lng), radiusKm = Number(shape.radiusKm);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new BadRequestException('Circle latitude is not a real coordinate.');
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new BadRequestException('Circle longitude is not a real coordinate.');
        if (!(radiusKm > 0)) throw new BadRequestException('Circle radius must be greater than zero km.');
        return { kind: 'circle', lat, lng, radiusKm };
      }
      case 'polygon': {
        const raw = Array.isArray(shape.points) ? shape.points : [];
        const points = raw
          .map((p: any) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }))
          .filter((p: any) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        if (points.length < 3) throw new BadRequestException('A polygon needs at least three points.');
        return { kind: 'polygon', points };
      }
      case 'state': {
        const code = String(shape.stateCode || '').toUpperCase();
        if (!getState(code)) throw new BadRequestException('Unknown state code: ' + (shape.stateCode ?? ''));
        return { kind: 'state', stateCode: code as StateCode };
      }
      case 'geozone': {
        const gz = String(shape.geozone || '').toUpperCase() as GeopoliticalZone;
        if (GEOZONES.indexOf(gz) < 0) throw new BadRequestException('Unknown geopolitical zone: ' + (shape.geozone ?? ''));
        return { kind: 'geozone', geozone: gz };
      }
      default:
        throw new BadRequestException('Unknown shape kind.');
    }
  }

  private async normaliseEffects(effects: any): Promise<ZoneEffects> {
    const src = effects && typeof effects === 'object' ? effects : {};
    const [minMult, maxMult, maxPct] = await this.guardrails();
    const out: ZoneEffects = {};

    if (src.rateMultiplier !== undefined && src.rateMultiplier !== null && src.rateMultiplier !== '') {
      const m = Number(src.rateMultiplier);
      if (!Number.isFinite(m) || m <= 0) throw new BadRequestException('Rate multiplier must be a positive number.');
      // Under 1.0 is allowed on purpose: a cheaper corridor is a real
      // lever and is how demand gets seeded somewhere new. The floor is
      // only there to stop a typed 0.05 from giving the platform away.
      if (m < minMult || m > maxMult) {
        throw new BadRequestException('Rate multiplier must be between ' + minMult + ' and ' + maxMult + '.');
      }
      out.rateMultiplier = m;
    }

    if (src.surchargePct !== undefined && src.surchargePct !== null && src.surchargePct !== '') {
      const p = Number(src.surchargePct);
      if (!Number.isFinite(p)) throw new BadRequestException('Surcharge percent must be a number.');
      if (p < 0 || p > maxPct) throw new BadRequestException('Surcharge percent must be between 0 and ' + maxPct + '.');
      out.surchargePct = p;
    }

    const fuel = src.fuelPriceOverride;
    if (fuel && typeof fuel === 'object') {
      const petrol = Number(fuel.petrolNgn);
      const diesel = Number(fuel.dieselNgn);
      const override: { petrolNgn?: number; dieselNgn?: number } = {};
      if (Number.isFinite(petrol) && petrol > 0) override.petrolNgn = Math.round(petrol * 100) / 100;
      if (Number.isFinite(diesel) && diesel > 0) override.dieselNgn = Math.round(diesel * 100) / 100;
      if (Object.keys(override).length > 0) out.fuelPriceOverride = override;
    }

    if (Array.isArray(src.vehicleBans)) {
      const bans = src.vehicleBans
        .map((v: any) => String(v || '').trim())
        .filter((v: string) => v.length > 0);
      if (bans.length > 0) out.vehicleBans = Array.from(new Set(bans)) as string[];
    }

    return out;
  }

  private normaliseWindow(active: any): ZoneActiveWindow {
    const src = active && typeof active === 'object' ? active : { mode: 'always' };
    const mode = src.mode === 'daily' || src.mode === 'dateRange' ? src.mode : 'always';

    if (mode === 'daily') {
      const from = parseHhmm(src.dailyFrom);
      const to   = parseHhmm(src.dailyTo);
      if (from === null || to === null) {
        throw new BadRequestException('A daily window needs a start and an end in HH:MM.');
      }
      // An overnight curfew (18:00 to 06:00) is the normal case, so a
      // "to" earlier than "from" is deliberate rather than an error.
      return { mode: 'daily', dailyFrom: src.dailyFrom.trim(), dailyTo: src.dailyTo.trim() };
    }

    if (mode === 'dateRange') {
      const startsAt = src.startsAt ? new Date(src.startsAt) : null;
      const endsAt   = src.endsAt   ? new Date(src.endsAt)   : null;
      if (startsAt && Number.isNaN(startsAt.getTime())) throw new BadRequestException('Start date is not a real date.');
      if (endsAt   && Number.isNaN(endsAt.getTime()))   throw new BadRequestException('End date is not a real date.');
      if (!startsAt && !endsAt) throw new BadRequestException('A date range needs a start, an end, or both.');
      if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
        throw new BadRequestException('The end of the window must come after its start.');
      }
      return {
        mode: 'dateRange',
        startsAt: startsAt ? startsAt.toISOString() : null,
        endsAt:   endsAt   ? endsAt.toISOString()   : null,
      };
    }

    return { mode: 'always' };
  }

  // ── Admin CRUD ─────────────────────────────────────────────────────

  async listAll(): Promise<Zone[]> {
    return this.repo.find({ order: { published: 'DESC', priority: 'DESC', name: 'ASC' } });
  }

  async getOne(id: string): Promise<Zone> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Zone not found.');
    return row;
  }

  async create(actor: ZoneActor, dto: ZoneWriteDto): Promise<Zone> {
    const draft = await this.buildDraft(null, dto);
    await this.assertMay(actor, permissionsRequiredBy(draft));
    const row = this.repo.create({
      ...draft,
      createdByAdminId: actor?.id ?? null,
      updatedByAdminId: actor?.id ?? null,
      publishedAt: draft.published ? new Date() : null,
    });
    const saved = await this.repo.save(row);
    this.logger.log('Zone created: ' + saved.name + ' (' + saved.status + ', published=' + saved.published + ')');
    return saved;
  }

  async update(actor: ZoneActor, id: string, dto: ZoneWriteDto): Promise<Zone> {
    const existing = await this.getOne(id);
    const draft = await this.buildDraft(existing, dto);
    await this.assertMay(actor, permissionsForTransition(existing, draft));

    const becomingLive = draft.published && !existing.published;
    await this.repo.update(id, {
      ...draft,
      updatedByAdminId: actor?.id ?? null,
      ...(becomingLive ? { publishedAt: new Date() } : {}),
    });
    return this.getOne(id);
  }

  /**
   * Publishing is a separate verb because drawing a closure and enacting
   * one are two different decisions. Unpublishing carries the same
   * permission requirement as publishing, because taking a live curfew
   * off the map reopens the area just as surely as editing it to 'open'.
   */
  async setPublished(actor: ZoneActor, id: string, published: boolean): Promise<Zone> {
    const existing = await this.getOne(id);
    await this.assertMay(actor, permissionsRequiredBy(existing));
    await this.repo.update(id, {
      published,
      updatedByAdminId: actor?.id ?? null,
      ...(published && !existing.published ? { publishedAt: new Date() } : {}),
    });
    this.logger.log('Zone ' + existing.name + (published ? ' published' : ' unpublished'));
    return this.getOne(id);
  }

  async remove(actor: ZoneActor, id: string): Promise<{ deleted: true }> {
    const existing = await this.getOne(id);
    await this.assertMay(actor, permissionsRequiredBy(existing));
    await this.repo.delete(id);
    return { deleted: true };
  }

  private async buildDraft(existing: Zone | null, dto: ZoneWriteDto) {
    const name = (dto.name ?? existing?.name ?? '').trim();
    if (!name) throw new BadRequestException('Give the zone a name people will recognise.');

    const status: ZoneStatus = (dto.status ?? existing?.status ?? 'open') as ZoneStatus;
    if (ZONE_STATUSES.indexOf(status) < 0) throw new BadRequestException('Unknown zone status: ' + status);

    // A new zone with no shape is a zone over nowhere, so it is refused
    // here rather than saved and then silently matching nothing.
    if (dto.shape === undefined && !existing) {
      throw new BadRequestException('Draw the area first: a circle, a polygon, a state or a geopolitical zone.');
    }
    const shape   = dto.shape !== undefined ? this.normaliseShape(dto.shape) : existing.shape;
    const effects = dto.effects !== undefined ? await this.normaliseEffects(dto.effects) : (existing?.effects ?? {});
    const active  = dto.active !== undefined ? this.normaliseWindow(dto.active) : (existing?.active ?? { mode: 'always' as const });
    const reason  = (dto.reason ?? existing?.reason ?? '').trim();

    /**
     * A refusal or an uplift with no reason is not shippable. The sender
     * sees this sentence instead of a booking, and the rider sees it
     * instead of a job, so "restricted" on its own is worse than nothing:
     * it reads as a broken app rather than as a decision somebody made.
     */
    const bansSomething = Array.isArray(effects.vehicleBans) && effects.vehicleBans.length > 0;
    if ((isBlockingStatus(status) || status === 'surcharged' || bansSomething) && !reason) {
      throw new BadRequestException('Write the reason senders and riders will see. A refusal with no reason reads as a bug.');
    }

    const priorityRaw = dto.priority ?? existing?.priority ?? 0;
    const priority = Number(priorityRaw);
    if (!Number.isFinite(priority)) throw new BadRequestException('Priority must be a whole number.');

    return {
      name,
      colour:   (dto.colour ?? existing?.colour ?? '#3A7BD5').trim(),
      shape,
      status,
      effects,
      active,
      reason,
      priority: Math.round(priority),
      published: dto.published !== undefined ? !!dto.published : (existing?.published ?? false),
    };
  }

  // ── Engine ─────────────────────────────────────────────────────────

  /**
   * Live rows only, and deliberately uncached.
   *
   * A closure that takes effect on the next cache flush is not a
   * closure. The founder's line is that new bookings stop IMMEDIATELY,
   * and with a handful of rows behind an index the query costs less than
   * the reconciliation of a stale one would. If this ever becomes hot,
   * cache the non-blocking rows only and keep blocking rows live.
   */
  async publishedZones(): Promise<Zone[]> {
    return this.repo.find({ where: { published: true } });
  }

  /**
   * The engine entry point. Resolves BOTH ends, blocks before any money,
   * then returns the effects the pricing service should apply.
   */
  async evaluate(input: ZoneEvaluateInput): Promise<ZoneDecision> {
    const zones = await this.publishedZones();
    // A fresh copy every time: the decision escapes into a price
    // breakdown that the caller owns, and a shared object handed to two
    // quotes at once is a bug waiting for a busy afternoon.
    if (zones.length === 0) return { ...EMPTY_ZONE_DECISION, notices: [], pickupZoneIds: [], dropoffZoneIds: [] };

    const [offset, capPct] = await Promise.all([
      this.windowOffsetMinutes(),
      this.maxTotalSurchargePct(),
    ]);

    const decision = resolveZoneDecision({
      zones,
      pickup:  input.pickup,
      dropoff: input.dropoff ?? null,
      vehicleType: input.vehicleType ?? null,
      at: input.at ?? new Date(),
      utcOffsetMinutes: Number.isFinite(offset) ? offset : 60,
    });

    if (decision.surchargePct > capPct) decision.surchargePct = capPct;
    return decision;
  }

  /**
   * What the apps may ask before a sender has finished typing: is this
   * address servable, and if not, why. Returns no money and no effect
   * numbers, so it can be answered for any signed-in user without
   * leaking the pricing configuration the way the public rate card once
   * did.
   */
  async checkPoint(point: ZonePoint, at: Date | null, end: 'pickup' | 'dropoff') {
    const decision = await this.evaluate(
      end === 'pickup'
        ? { pickup: point, dropoff: null, at }
        : { pickup: {}, dropoff: point, at },
    );
    if (decision.refusal) {
      return {
        allowed: false,
        end: decision.refusal.end,
        status: decision.refusal.status,
        zoneName: decision.refusal.zoneName,
        reason: decision.refusal.reason,
      };
    }
    return {
      allowed: true,
      notices: decision.notices.map(n => ({ zoneName: n.zoneName, reason: n.reason })),
    };
  }

  /**
   * Admin preview: what would happen to a job between these two points
   * at this instant. Exists so a closure can be checked BEFORE it is
   * published rather than discovered by a sender.
   */
  async preview(input: ZoneEvaluateInput): Promise<ZoneDecision> {
    return this.evaluate(input);
  }

  /** Shape pickers on the admin page, so state codes cannot be typed wrong. */
  shapeOptions() {
    return {
      states: NIGERIAN_STATES.map(s => ({ code: s.code, name: s.name, zone: s.zone })),
      geozones: GEOZONES,
      statuses: ZONE_STATUSES,
    };
  }
}
