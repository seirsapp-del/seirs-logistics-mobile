import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { PricingService } from '../pricing/pricing.service';

/**
 * GET /api/v1/health — public liveness + readiness probe.
 *
 * Returns 200 with diagnostic JSON. Used by:
 *   - Railway healthcheck (set HEALTHCHECK_PATH=/api/v1/health in service settings)
 *   - Admin dashboard health page (`adm.healthDash`)
 *   - Manual `curl` smoke tests after a deploy
 *
 * Database round-trip is best-effort — a 500 here means TypeORM can't talk
 * to Postgres, which is the most common reason for production outages
 * (Railway database restart, exhausted connection pool, etc.).
 *
 * Pricing block (post-2026-05-12) verifies the rate card + service catalog
 * seed completed AND the pricing math returns a sensible result for a
 * canned input. If `pricing.status !== "ok"` after a deploy, the
 * multi-stop booking flow will reject every request — fix immediately.
 */
@Controller('health')
export class HealthController {
  private readonly bootedAt = new Date();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly pricing: PricingService,
  ) {}

  @Public()
  @Get()
  async check() {
    const now = new Date();

    // ── DB round-trip ──────────────────────────────────────────────
    let dbOk = false;
    let dbError: string | undefined;
    try {
      await this.dataSource.query('SELECT 1');
      dbOk = true;
    } catch (err: any) {
      dbError = err?.message ?? 'unknown';
    }

    // ── Pricing system smoke test ──────────────────────────────────
    // Canned input: 5 km motorcycle delivery of small parcel. Should
    // always return a non-zero customer total if the rate card seeded
    // correctly. Errors mean either the active RateCard row is missing
    // OR the seeded categories don't include 'small_parcel' (both =
    // broken booking flow).
    let pricing: any = { status: 'unchecked' };
    if (dbOk) {
      try {
        const card  = await this.pricing.getActiveRateCard();
        const cats  = await this.pricing.getServiceCategories();
        const quote = await this.pricing.computePrice({
          vehicleType:  'motorcycle',
          categoryCode: 'small_parcel',
          km:           5,
          stopCount:    1,
          weightKg:     2,
          estimatedDwellMinutes: 4,
        });
        const total = quote.customer.total;
        pricing = {
          status:           total > 0 ? 'ok' : 'degraded',
          rateCardVersion:  card.version,
          activeCategories: cats.length,
          sampleQuote: {
            input:    '5 km motorcycle, 2 kg small parcel',
            customer: Math.round(total),
            driver:   Math.round(quote.driver.total),
            seirsNet: Math.round(quote.seirsNet),
          },
        };
      } catch (err: any) {
        pricing = { status: 'error', error: err?.message ?? 'unknown' };
      }
    }

    return {
      status:    dbOk && pricing.status === 'ok' ? 'ok' : 'degraded',
      timestamp: now.toISOString(),
      uptimeSec: Math.floor((now.getTime() - this.bootedAt.getTime()) / 1000),
      version:   process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      env:       process.env.NODE_ENV ?? 'development',
      db:        { reachable: dbOk, ...(dbError ? { error: dbError } : {}) },
      pricing,
    };
  }
}
