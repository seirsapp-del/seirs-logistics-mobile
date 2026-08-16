import { Controller, Get } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { SupportTicket } from '../support/support-ticket.entity';
import { DataSource, Repository } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { PricingService } from '../pricing/pricing.service';

/**
 * GET /api/v1/health - public liveness + readiness probe.
 *
 * Returns 200 with diagnostic JSON. Used by:
 *   - Railway healthcheck (set HEALTHCHECK_PATH=/api/v1/health in service settings)
 *   - Admin dashboard health page (`adm.healthDash`)
 *   - Manual `curl` smoke tests after a deploy
 *
 * Database round-trip is best-effort - a 500 here means TypeORM can't talk
 * to Postgres, which is the most common reason for production outages
 * (Railway database restart, exhausted connection pool, etc.).
 *
 * Pricing block (post-2026-05-12) verifies the rate card + service catalog
 * seed completed AND the pricing math returns a sensible result for a
 * canned input. If `pricing.status !== "ok"` after a deploy, the
 * multi-stop booking flow will reject every request - fix immediately.
 */
@Controller('health')
export class HealthController {
  private readonly bootedAt = new Date();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(SupportTicket) private readonly ticketsRepo: Repository<SupportTicket>,
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

    /**
     * Support schema probe. Support was returning 500 on both reading and
     * writing tickets with no way to see why from outside (2026-08-16),
     * and the self-heal logs are not reachable without a Railway login.
     * A health check that reports which subsystem is broken, and how, is
     * worth having permanently.
     */
    let support: Record<string, unknown> = { ok: false };
    try {
      const cols = await this.dataSource.query(
        `SELECT column_name, is_nullable FROM information_schema.columns
          WHERE table_name = 'support_tickets'
            AND is_nullable = 'NO' ORDER BY column_name`,
      );
      // Mimic the read the app actually performs, so a failure here names
      // the reason instead of surfacing as a bare 500 from the endpoint.
      let readError: string | null = null;
      try {
        await this.dataSource.query(
          `SELECT "id","userId","topic","status","subject","lastMessageAt"
             FROM "support_tickets" ORDER BY "lastMessageAt" DESC LIMIT 1`,
        );
      } catch (e: any) { readError = e?.message ?? 'unknown'; }
      // The app reads through TypeORM, not raw SQL, so probe that path
      // too: a mapping fault shows up here and nowhere else.
      try {
        await this.ticketsRepo.find({ order: { lastMessageAt: 'DESC' }, take: 1 });
      } catch (e: any) { readError = `orm: ${e?.message ?? 'unknown'}`; }
      const chat = await this.dataSource.query(
        `SELECT column_name, is_nullable FROM information_schema.columns
          WHERE table_name = 'chat_messages' AND column_name IN ('ticketId','deliveryId')`,
      );
      await this.dataSource.query('SELECT COUNT(*) FROM "support_tickets"');
      support = {
        ok: !readError,
        notNullColumns: cols.map((c: any) => c.column_name),
        chatMessages: chat,
        ...(readError ? { readError } : {}),
      };
    } catch (err: any) {
      support = { ok: false, error: err?.message ?? 'unknown' };
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
      support,
      pricing,
    };
  }
}
