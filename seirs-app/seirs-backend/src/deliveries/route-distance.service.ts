import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MapsService } from '../maps/maps.service';
import { FeesService } from '../fees/fees.service';
import { PricingService } from './pricing.service';

/**
 * Road distance for quotes, replacing straight-line Haversine (founder
 * 2026-08-15: "fix that properly to fit real live scenarios").
 *
 * Why this exists: fares were priced on the straight line between two pins.
 * In Lagos that is not a rounding error, it is the lagoon: Ikorodu to Lekki
 * measures short across the water while the driver goes the long way around,
 * and because the fare is locked at booking and the driver keeps a share of
 * the QUOTED fare, every underquote came straight out of the rider's pocket.
 *
 * Resolution order per quote:
 *   1. Cache: same ~100m pin pair within 15 minutes reuses the last answer,
 *      so the quote screen and the booking that follows it burn one API
 *      call, not two, and always agree on the number.
 *   2. Google Directions through the existing MapsService proxy, guarded by
 *      a monthly cap (fee key routes_api_monthly_cap, default 9,000 against
 *      Google's 10,000 free tier) counted in route_api_usage so the free
 *      tier is never silently exceeded. 2.5s timeout: a slow Maps day must
 *      not make booking feel broken.
 *   3. Calibrated Haversine: straight line times a circuity factor. The
 *      factor is admin-tunable (circuity_default_pct) and self-calibrating:
 *      every Google-priced quote teaches us the real road/straight ratio for
 *      its pickup zone, and a nightly job folds completed history into
 *      per-zone medians. Over the cap, the estimates keep tracking reality.
 *
 * The result is never allowed below the Haversine floor: roads are not
 * shorter than the straight line, whatever a flaky API response says.
 */

interface RoadDistance {
  km: number;
  durationMin: number | null;
  source: 'google' | 'calibrated' | 'haversine';
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const API_TIMEOUT_MS = 2500;
/** ~0.05 deg ≈ 5.5km cells: coarse enough to accumulate samples per area. */
const ZONE_GRID = 0.05;

@Injectable()
export class RouteDistanceService implements OnModuleInit {
  private readonly logger = new Logger(RouteDistanceService.name);
  private cache = new Map<string, { at: number; value: RoadDistance }>();
  /** zoneKey -> learned road/straight ratio (bounded), rebuilt on boot + nightly. */
  private learned = new Map<string, number>();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly maps: MapsService,
    private readonly fees: FeesService,
  ) {}

  async onModuleInit() {
    try {
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "route_api_usage" (
          "month" varchar(7) PRIMARY KEY,
          "count" integer NOT NULL DEFAULT 0
        )
      `);
    } catch (e: any) {
      this.logger.warn(`route_api_usage table init skipped: ${e?.message ?? e}`);
    }
    // Learn from history at boot so a fresh deploy is calibrated before the
    // first nightly run, instead of quoting a day of raw defaults.
    this.recalibrate().catch(() => undefined);
  }

  async getRoadDistance(
    pickupLat: number, pickupLng: number,
    dropLat: number, dropLng: number,
  ): Promise<RoadDistance> {
    const haversineKm = PricingService.haversineKm(pickupLat, pickupLng, dropLat, dropLng);

    const key = [pickupLat, pickupLng, dropLat, dropLng]
      .map(v => v.toFixed(3)).join(',');
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    let result: RoadDistance | null = null;

    if (await this.underMonthlyCap()) {
      result = await this.fromGoogle(pickupLat, pickupLng, dropLat, dropLng, haversineKm);
    }
    if (!result) {
      result = await this.fromCalibration(pickupLat, pickupLng, haversineKm);
    }

    this.cache.set(key, { at: Date.now(), value: result });
    // Opportunistic sweep so the map cannot grow without bound.
    if (this.cache.size > 5000) {
      const cutoff = Date.now() - CACHE_TTL_MS;
      for (const [k, v] of this.cache) if (v.at < cutoff) this.cache.delete(k);
    }
    return result;
  }

  // ── Source 1: Google, capped and time-boxed ───────────────────────────────

  private async fromGoogle(
    aLat: number, aLng: number, bLat: number, bLng: number, haversineKm: number,
  ): Promise<RoadDistance | null> {
    try {
      const call = this.maps.directions({
        origin: `${aLat},${aLng}`,
        destination: `${bLat},${bLng}`,
        mode: 'driving',
      });
      const res: any = await Promise.race([
        call,
        new Promise((_, rej) => setTimeout(() => rej(new Error('maps timeout')), API_TIMEOUT_MS)),
      ]);
      const leg = res?.routes?.[0]?.legs?.[0];
      const meters = Number(leg?.distance?.value);
      if (!meters || meters <= 0) return null;

      await this.bumpUsage();

      const km = Math.max(meters / 1000, haversineKm);
      const durationSec = Number(leg?.duration_in_traffic?.value ?? leg?.duration?.value);
      // Feed the learning loop: this pair is a ground-truth sample of how
      // much longer roads run than the straight line in this zone.
      this.observe(aLat, aLng, km / Math.max(haversineKm, 0.1));

      return {
        km: Math.round(km * 10) / 10,
        durationMin: durationSec ? Math.round(durationSec / 60) : null,
        source: 'google',
      };
    } catch (e: any) {
      this.logger.warn(`directions fallback: ${e?.message ?? e}`);
      return null;
    }
  }

  private async underMonthlyCap(): Promise<boolean> {
    try {
      const cap = await this.fees.getValueOr('routes_api_monthly_cap', 9000);
      const month = new Date().toISOString().slice(0, 7);
      const rows = await this.ds.query(
        `SELECT count FROM route_api_usage WHERE month = $1`, [month],
      );
      return Number(rows?.[0]?.count ?? 0) < cap;
    } catch {
      // If the counter is unreadable, refuse the paid path rather than risk
      // uncounted spend: the calibrated fallback keeps quotes flowing.
      return false;
    }
  }

  private async bumpUsage() {
    const month = new Date().toISOString().slice(0, 7);
    await this.ds.query(
      `INSERT INTO route_api_usage (month, count) VALUES ($1, 1)
       ON CONFLICT (month) DO UPDATE SET count = route_api_usage.count + 1`,
      [month],
    ).catch(() => undefined);
  }

  // ── Source 2: calibrated straight line ───────────────────────────────────

  private zoneKey(lat: number, lng: number): string {
    return `${Math.round(lat / ZONE_GRID)}_${Math.round(lng / ZONE_GRID)}`;
  }

  /** Live samples accumulated since boot, folded by recalibrate(). */
  private samples = new Map<string, number[]>();

  private observe(lat: number, lng: number, ratio: number) {
    if (!isFinite(ratio) || ratio < 1 || ratio > 3) return;
    const key = this.zoneKey(lat, lng);
    const arr = this.samples.get(key) ?? [];
    arr.push(ratio);
    if (arr.length > 200) arr.shift();
    this.samples.set(key, arr);
  }

  private async fromCalibration(
    lat: number, lng: number, haversineKm: number,
  ): Promise<RoadDistance> {
    const defaultPct = await this.fees.getValueOr('circuity_default_pct', 145);
    const minPct = await this.fees.getValueOr('circuity_min_pct', 110);
    const maxPct = await this.fees.getValueOr('circuity_max_pct', 220);

    const zone = this.learned.get(this.zoneKey(lat, lng));
    let factor = zone ?? defaultPct / 100;
    factor = Math.min(Math.max(factor, minPct / 100), maxPct / 100);

    return {
      km: Math.round(haversineKm * factor * 10) / 10,
      durationMin: null,
      source: zone ? 'calibrated' : 'haversine',
    };
  }

  /**
   * Nightly (and at boot): fold observed road/straight ratios into per-zone
   * medians. Medians, not means: one bridge closure should not drag a
   * zone's factor for a month. History query backfills from deliveries that
   * were priced by Google, so calibration survives restarts.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async recalibrate() {
    try {
      const rows = await this.ds.query(`
        SELECT "pickupLat"  AS plat, "pickupLng"  AS plng,
               "dropoffLat" AS dlat, "dropoffLng" AS dlng,
               "distanceKm" AS road
        FROM deliveries
        WHERE "createdAt" > NOW() - INTERVAL '14 days'
          AND "quotedDistanceSource" = 'google'
          AND "pickupLat" IS NOT NULL AND "dropoffLat" IS NOT NULL
        LIMIT 5000
      `);
      // Merge DB history into the live sample buffers, then reduce. Each
      // Google-priced delivery is one ground-truth sample: stored road km
      // over the straight line recomputed from its own pins.
      const merged = new Map<string, number[]>(this.samples);
      for (const r of rows ?? []) {
        const straight = PricingService.haversineKm(
          Number(r.plat), Number(r.plng), Number(r.dlat), Number(r.dlng),
        );
        const ratio = Number(r.road) / Math.max(straight, 0.1);
        if (!isFinite(ratio) || ratio < 1 || ratio > 3) continue;
        const key = this.zoneKey(Number(r.plat), Number(r.plng));
        const arr = merged.get(key) ?? [];
        arr.push(ratio);
        merged.set(key, arr);
      }
      const next = new Map<string, number>();
      for (const [key, arr] of merged) {
        if (arr.length < 5) continue;
        const sorted = [...arr].sort((a, b) => a - b);
        next.set(key, sorted[Math.floor(sorted.length / 2)]);
      }
      this.learned = next;
      if (next.size) {
        this.logger.log(`circuity calibrated for ${next.size} zone(s)`);
      }
    } catch (e: any) {
      this.logger.warn(`recalibration skipped: ${e?.message ?? e}`);
    }
  }
}
