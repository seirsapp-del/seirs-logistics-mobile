import { Controller, Get } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { SupportTicket } from '../support/support-ticket.entity';
import { DataSource, Repository } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { PricingService } from '../pricing/pricing.service';
import { MailService } from '../mail/mail.service';

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
    private readonly mail: MailService,
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
      // Both failing endpoints touch the user relation, which the plain
      // find above does not. Probe the join on its own.
      try {
        await this.ticketsRepo.find({
          where: { user: { id: '00000000-0000-0000-0000-000000000000' } },
          take: 1,
        });
      } catch (e: any) { readError = `relation: ${e?.message ?? 'unknown'}`; }
      // Exactly what the admin Support Inbox runs. It reports Internal
      // Server Error in the dashboard and there is no way to call it
      // without an agent account, so it is reproduced here.
      try {
        await this.ticketsRepo.createQueryBuilder('t')
          .leftJoinAndSelect('t.user', 'u')
          .orderBy('t.lastMessageAt', 'DESC')
          .take(5)
          .getMany();
      } catch (e: any) { readError = `queue: ${e?.message ?? 'unknown'}`; }
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

    /**
     * Payments schema probe (2026-09-01).
     *
     * Two self-heals in PaymentsModule.onModuleInit have to have applied
     * for payments to record the truth: payments.method must be nullable
     * so a row can exist before anyone has paid, and the enum backing it
     * must hold 'ussd', which checkout has always offered.
     *
     * Both run inside try/catch, so total failure is indistinguishable
     * from success at boot: the service comes up healthy, pricing is ok,
     * and the fault surfaces weeks later as the first USSD payment
     * throwing on insert. The Railway logs that would say so are not
     * reachable without a login.
     *
     * So it is reported here rather than inferred. Read-only, and it
     * names the enum type it found rather than assuming the type name,
     * for the same reason the heal itself resolves it from the
     * catalogue.
     */
    let paymentsSchema: Record<string, unknown> = { ok: false };
    try {
      const col = await this.dataSource.query(
        `SELECT is_nullable, udt_name FROM information_schema.columns
          WHERE table_name = 'payments' AND column_name = 'method'`,
      );
      if (!col?.[0]) {
        paymentsSchema = { ok: false, error: 'payments.method column not found' };
      } else {
        const typeName = col[0].udt_name;
        const vals = await this.dataSource.query(
          `SELECT e.enumlabel FROM pg_enum e
             JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = $1
            ORDER BY e.enumsortorder`,
          [typeName],
        );
        const methods    = vals.map((v: any) => v.enumlabel);
        const isNullable = col[0].is_nullable === 'YES';
        const hasUssd    = methods.includes('ussd');
        paymentsSchema = {
          // ok only when BOTH heals actually landed. Anything else is a
          // real fault however healthy the rest of the boot looked.
          ok: isNullable && hasUssd,
          methodNullable: isNullable,
          methodEnum:     typeName,
          methods,
          ...(isNullable ? {} : { warn: 'payments.method is still NOT NULL: the DROP NOT NULL heal did not apply' }),
          ...(hasUssd    ? {} : { warnUssd: "the enum has no 'ussd' value: a USSD payment will throw on insert" }),
        };
      }
    } catch (err: any) {
      paymentsSchema = { ok: false, error: err?.message ?? 'unknown' };
    }

    /**
     * Statements schema probe (2026-09-01).
     *
     * statement_records grew two columns after it shipped: pdf, which
     * holds the document exactly as issued, and downloadExpiresAt, which
     * ends the emailed link. Both arrive as ALTERs in the module's
     * self-heal, inside the usual try/catch, so a total failure of both
     * looks identical to success at boot.
     *
     * The consequence is not cosmetic and not immediate, which is what
     * makes it worth a probe. Without pdf, issuing appears to work,
     * writes a record, prints a code on a document, and every download
     * of it 404s. Nobody finds out until somebody follows a link, and by
     * then the statement is in an accountant's inbox.
     *
     * Same reasoning as paymentsSchema below it, which exists only
     * because a nullable method column and a ussd enum value silently
     * did not apply and there was no way to know until someone paid.
     */
    let statementsSchema: Record<string, unknown> = { ok: false };
    try {
      const cols = await this.dataSource.query(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_name = 'statement_records'
            AND column_name IN ('pdf', 'downloadExpiresAt')`,
      );
      const names = (cols as any[]).map(c => c.column_name);
      const hasPdf    = names.includes('pdf');
      const hasExpiry = names.includes('downloadExpiresAt');
      // How many documents actually have bytes behind them. A row
      // without them cannot be downloaded, so this is the count that
      // says whether issuing has ever really worked.
      const counted = await this.dataSource.query(
        `SELECT COUNT(*)::int AS total,
                COUNT("pdf")::int AS "withPdf"
           FROM "statement_records"`,
      ).catch(() => null);
      statementsSchema = {
        ok: hasPdf && hasExpiry,
        pdfColumn:        hasPdf,
        expiryColumn:     hasExpiry,
        ...(counted?.[0] ? { issued: counted[0].total, withDocument: counted[0].withPdf } : {}),
        ...(hasPdf    ? {} : { warn: 'statement_records has no pdf column: every download will 404 while issuing looks fine' }),
        ...(hasExpiry ? {} : { warnExpiry: 'statement_records has no downloadExpiresAt column: links will never expire' }),
      };
    } catch (err: any) {
      statementsSchema = { ok: false, error: err?.message ?? 'unknown' };
    }

    /**
     * KYC document store probe (2026-09-02).
     *
     * driver_documents was generalised into kyc_documents and the copy-in
     * runs inside the usual try/catch on boot, so a total failure looks
     * exactly like success: the service comes up, the queue renders empty,
     * and nobody finds out until a reviewer asks where the documents went.
     *
     * Reports the row count per owner type alongside what is still sitting
     * in the old table, so "did the migration actually land" is one curl
     * rather than a database session.
     */
    let kycSchema: Record<string, unknown> = { ok: false };
    try {
      const byOwner = await this.dataSource.query(
        `SELECT "ownerType", COUNT(*)::int AS n FROM "kyc_documents" GROUP BY "ownerType"`,
      );
      const legacy = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM "driver_documents"`,
      ).catch(() => [{ n: null }]);

      /**
       * How many partner documents there are to copy at all.
       *
       * Without this, a partner_store count of zero is ambiguous: it reads
       * the same whether the backfill failed or whether no shop has ever
       * uploaded anything. On the first deploy it was zero and there was
       * no way to tell which from outside.
       */
      const partnerSource = await this.dataSource.query(
        `SELECT COUNT(*)::int AS stores,
                COUNT(*) FILTER (WHERE COALESCE("storefrontPhotoUrl", '') <> ''
                                    OR COALESCE("cacRegUrl", '') <> ''
                                    OR COALESCE("ownerIdUrl", '') <> '')::int AS "storesWithFiles",
                (COALESCE(COUNT(*) FILTER (WHERE COALESCE("storefrontPhotoUrl", '') <> ''), 0)
               + COALESCE(COUNT(*) FILTER (WHERE COALESCE("cacRegUrl", '') <> ''), 0)
               + COALESCE(COUNT(*) FILTER (WHERE COALESCE("ownerIdUrl", '') <> ''), 0))::int AS "filesOnStores"
           FROM "partner_stores"`,
      ).catch(() => [null]);

      const counts: Record<string, number> = {};
      for (const r of byOwner as any[]) counts[r.ownerType] = Number(r.n ?? 0);
      const copied = counts.driver ?? 0;
      const inLegacy = legacy?.[0]?.n ?? null;

      kycSchema = {
        // Not ok until every legacy row has a counterpart. A partial copy
        // is the failure worth catching, and it is invisible otherwise.
        ok: inLegacy === null ? copied > 0 : copied >= inLegacy,
        documents: counts,
        legacyDriverDocuments: inLegacy,
        partnerStores: partnerSource?.[0] ?? null,
        ...(partnerSource?.[0] && partnerSource[0].filesOnStores > (counts.partner_store ?? 0)
          ? { warnPartner: `${partnerSource[0].filesOnStores} partner files on stores, ${counts.partner_store ?? 0} in the shared store` }
          : {}),
        ...(inLegacy !== null && copied < inLegacy
          ? { warn: `only ${copied} of ${inLegacy} driver documents copied into the shared store` }
          : {}),
      };
    } catch (err: any) {
      kycSchema = { ok: false, error: err?.message ?? 'unknown' };
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
      // Did the two payments self-heals actually apply? Reported rather
      // than inferred from a clean boot, because both are wrapped in
      // try/catch and failure looks identical to success until the
      // first USSD payment throws on insert.
      paymentsSchema,
      // Did driver_documents actually reach kyc_documents? A silent
      // try/catch copy-in fails identically to succeeding.
      kycSchema,
      // Did the statement_records ALTERs land? Same class of silent
      // failure: issuing looks healthy and every download 404s.
      statementsSchema,
      pricing,
      /**
       * Can this deploy actually send an email?
       *
       * A missing RESEND_API_KEY used to be invisible: the mailer no-opped
       * and every caller reported success. If configured is false, nobody
       * can register, reset a password, or accept a staff invite. If
       * sharedTestSender is true, only the Resend account owner receives
       * anything and every other address is refused.
       */
      mail: this.mail.transportStatus,
      /**
       * Live or test money.
       *
       * Before anyone types a real card into this app we need to know
       * which Flutterwave environment the deploy is pointed at, and
       * nobody can read Railway's env from here. Reports the MODE only:
       * the key itself is never echoed, only whether it carries the
       * TEST marker Flutterwave puts in sandbox keys.
       */
      payments: (() => {
        const k = process.env.FLUTTERWAVE_SECRET_KEY ?? '';
        if (!k) return { provider: 'flutterwave', configured: false, mode: 'none' };
        return {
          provider:   'flutterwave',
          configured: true,
          mode:       /TEST/i.test(k) ? 'test' : 'live',
          webhookHashSet: Boolean(process.env.FLW_WEBHOOK_HASH),
        };
      })(),

      /**
       * Whether a push notification can leave this server at all.
       *
       * FcmService disables itself with a log line when
       * FIREBASE_SERVICE_ACCOUNT_JSON is unset, and every send after
       * that is a silent no-op. Nothing outside the process could tell,
       * and the broadcast composer was reporting those no-ops as
       * successful deliveries (fixed the same day). Read straight from
       * the env rather than through the service, so this stays a
       * Public health route with no injection.
       */
      push: (() => {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '';
        if (!raw) {
          return {
            provider: 'fcm',
            configured: false,
            note: 'FIREBASE_SERVICE_ACCOUNT_JSON is not set. In-app notifications still save; no phone will buzz.',
          };
        }
        let projectId: string | null = null;
        let parses = true;
        try { projectId = JSON.parse(raw)?.project_id ?? null; } catch { parses = false; }
        return {
          provider: 'fcm',
          configured: parses,
          projectId,
          note: parses ? undefined : 'FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON, so push is off.',
        };
      })(),
    };
  }
}
