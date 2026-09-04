import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StatementRecord } from './statement-record.entity';
import { renderStatementPdf, StatementLine } from './statement-pdf';
import { secureCode } from '../common/utils/auth-codes';
import { spendNarrative, methodLabel } from '../business/spend-narrative';

/**
 * Downloadable earnings statements for partners and drivers.
 *
 * Both sides previously got a single figure per YEAR with nothing behind
 * it, which answers neither "which jobs made up this money" nor a tax
 * filing (founder 2026-08-19). This produces the bank-statement shape:
 * a chosen window, every line in it, totals, and a PDF you can hand to
 * someone.
 *
 * PDF only, deliberately. It is what institutions expect and it renders
 * the same everywhere. It is NOT tamper-proof, whatever the format's
 * reputation, so every document carries a verification code that
 * resolves to the figures SEIRS issued.
 */
@Injectable()
export class StatementsService {
  private readonly logger = new Logger(StatementsService.name);

  constructor(
    @InjectRepository(StatementRecord) private readonly records: Repository<StatementRecord>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  private publicBase(): string {
    return process.env.PUBLIC_WEB_URL?.replace(/\/$/, '')
      ?? 'https://seirs-website.vercel.app';
  }

  /** Validate and normalise a requested window. Defaults to 90 days. */
  private window(from?: string, to?: string): { from: Date; to: Date } {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 90 * 24 * 3600 * 1000);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('from and to must be valid dates (YYYY-MM-DD).');
    }
    if (fromDate > toDate) {
      throw new BadRequestException('The start date cannot be after the end date.');
    }
    // Include the whole closing day rather than stopping at its midnight.
    toDate.setHours(23, 59, 59, 999);
    return { from: fromDate, to: toDate };
  }

  // ── Partner ────────────────────────────────────────────────────────────

  async partnerStatement(storeId: string, from?: string, to?: string) {
    const w = this.window(from, to);
    const store = await this.ds.query(
      `SELECT id, "storeName", "storeCode" FROM "partner_stores" WHERE id = $1 LIMIT 1`,
      [storeId],
    );
    if (!store?.length) throw new NotFoundException('Partner store not found.');

    const rows = await this.ds.query(
      `SELECT amount::float AS amount, status, period, "paidAt", "createdAt"
         FROM partner_payouts
        WHERE "partnerStoreId" = $1
          AND COALESCE("paidAt", "createdAt") BETWEEN $2 AND $3
        ORDER BY COALESCE("paidAt", "createdAt") ASC`,
      [storeId, w.from.toISOString(), w.to.toISOString()],
    );

    const lines: StatementLine[] = rows.map((r: any) => ({
      date:      r.paidAt ?? r.createdAt,
      narrative: r.status === 'paid'
        ? `Counter handling paid (${r.period})`
        : `Counter handling earned (${r.period})`,
      amountNgn: Number(r.amount),
      status:    r.status,
      settled:   r.status === 'paid',
    }));

    return {
      subjectType: 'partner' as const,
      subjectId:   storeId,
      subjectName: store[0].storeName,
      subjectMeta: store[0].storeCode ? `Counter ${store[0].storeCode}` : undefined,
      title:       'Partner Counter Earnings',
      window: w,
      lines,
    };
  }

  // ── Driver ─────────────────────────────────────────────────────────────

  async driverStatement(driverId: string, from?: string, to?: string) {
    const w = this.window(from, to);
    /**
     * The column is vehiclePlate. It was written as "plateNumber", which
     * does not exist, so this query threw on every call; the .catch(() => [])
     * below turned that into an empty array, and the rider was then told
     * "Driver not found." A rider who obviously exists, being told they do
     * not, because a SQL error was dressed up as a missing row.
     *
     * The driver statement PDF had therefore NEVER been issued: /health
     * reported 3 statements with 1 document, and the missing two are these.
     * The app fell back to sharing plain text and looked like it had chosen
     * to.
     *
     * The catch is gone with it. A query that cannot run should say so, not
     * pretend the subject is absent.
     */
    const driver = await this.ds.query(
      `SELECT d.id, u.name, d."vehiclePlate"
         FROM drivers d JOIN users u ON u.id = d."userId"
        WHERE d.id = $1 LIMIT 1`,
      [driverId],
    );
    if (!driver?.length) throw new NotFoundException('Driver not found.');

    const rows = await this.ds.query(
      /**
       * driver_earnings maps to SNAKE_CASE columns: the entity declares
       * @Column({ name: 'delivery_id' }), 'available_at' and a
       * @CreateDateColumn({ name: 'created_at' }). This query asked for
       * "deliveryId", "availableAt" and "createdAt", so it threw every time.
       * Aliased back to the camelCase the mapping below reads.
       */
      `SELECT e.driver_net::float AS amount, e.status,
              e.available_at AS "availableAt",
              e.created_at   AS "createdAt",
              e.delivery_id  AS "deliveryId"
         FROM driver_earnings e
        WHERE e.driver_id = $1
          AND e.created_at BETWEEN $2 AND $3
        ORDER BY e.created_at ASC`,
      [driverId, w.from.toISOString(), w.to.toISOString()],
    );

    const lines: StatementLine[] = (rows as any[]).map((r) => ({
      date:      r.createdAt,
      narrative: r.deliveryId ? `Trip earnings (${String(r.deliveryId).slice(0, 8)})` : 'Trip earnings',
      amountNgn: Number(r.amount),
      status:    r.status,
      settled:   r.status === 'paid' || r.status === 'available',
    }));

    return {
      subjectType: 'driver' as const,
      subjectId:   driverId,
      subjectName: driver[0].name,
      subjectMeta: driver[0].vehiclePlate ? `Vehicle ${driver[0].vehiclePlate}` : undefined,
      title:       'Driver Earnings',
      window: w,
      lines,
    };
  }

  // ── Business sender ────────────────────────────────────────────────────

  /**
   * What a company paid SEIRS to ship, in the window it asked for.
   *
   * Partner and driver statements landed on 19 August and the business
   * side never got one, the same gap that left GET /business/statement a
   * yearly aggregate until 2026-09-01. Built by mirroring the partner
   * producer above rather than inventing a third shape.
   *
   * SETTLED CHARGES ONLY, founder decision 2026-09-01: "no pending in
   * statement at all". So every line here is settled by construction,
   * the pending total is structurally zero, and the caller passes
   * pendingLabel null so the document does not print a zero that reads
   * as "nothing outstanding".
   *
   * card_verify is excluded by name for the same reason the screen
   * excludes it: it is the tokenisation charge, refunded immediately,
   * and if that refund ever fails the row stays SUCCESS and would land
   * on a tax record as a real charge.
   */
  async businessStatement(businessAccountId: string, from?: string, to?: string) {
    const w = this.window(from, to);
    const biz = await this.ds.query(
      `SELECT id, "companyName", "ownerId" FROM "business_accounts" WHERE id = $1 LIMIT 1`,
      [businessAccountId],
    );
    if (!biz?.length) throw new NotFoundException('Business account not found.');

    // Columns named one by one, and the customer relation is not joined:
    // a join here would carry bank details and KYC paths into a document
    // that renders none of them.
    const rows = await this.ds.query(
      `SELECT p."createdAt", p."amountKobo", p.purpose, p.method,
              d."trackingCode", d."pickupAddress", d."dropoffAddress", d.kind,
              (SELECT COUNT(*)::int FROM delivery_stops s WHERE s."deliveryId" = d.id) AS stops
         FROM payments p
         LEFT JOIN deliveries d ON d.id = p."deliveryId"
        WHERE p."customerId" = $1
          AND p.status = 'success'
          AND p.purpose <> 'card_verify'
          AND p."createdAt" BETWEEN $2 AND $3
        ORDER BY p."createdAt" ASC`,
      [biz[0].ownerId, w.from.toISOString(), w.to.toISOString()],
    );

    const lines: StatementLine[] = (rows as any[]).map((r) => {
      const rail = methodLabel(r.method);
      return {
        date:      r.createdAt,
        // The rail rides along in the narrative only when it is known.
        // A charge nobody told us the rail for says nothing about it
        // rather than claiming a card.
        narrative: rail ? `${spendNarrative(r)} (${rail})` : spendNarrative(r),
        amountNgn: Number(r.amountKobo ?? 0) / 100,
        status:    'paid',
        settled:   true,
      };
    });

    return {
      subjectType: 'business' as const,
      subjectId:   businessAccountId,
      subjectName: biz[0].companyName,
      subjectMeta: undefined,
      title:       'Business Delivery Spend',
      window: w,
      lines,
      // No second total on this document. See businessStatement above.
      pendingLabel: null as string | null,
    };
  }

  // ── Customer ───────────────────────────────────────────────────────────

  /**
   * A person's own delivery and ride spend.
   *
   * Approved in the 1 September spec alongside the other three. The
   * challenge to it, that a receipt already meets a payer's needs, does
   * not survive one standing rule: a customer account cannot become a
   * business account. Customer to driver and business to partner are the
   * only conversions there are. So a trader running on a personal
   * account has no route to a business statement, ever, and a pile of
   * per-delivery receipts does not add up to a period a tax office will
   * accept.
   *
   * Rides are included and named as rides. spendNarrative already
   * distinguishes them, so "Ride to Ikeja" reads correctly next to a
   * parcel on the same page.
   */
  async customerStatement(userId: string, from?: string, to?: string) {
    const w = this.window(from, to);
    const who = await this.ds.query(
      `SELECT id, name, "accountId" FROM users WHERE id = $1 LIMIT 1`, [userId],
    );
    if (!who?.length) throw new NotFoundException('Account not found.');

    const rows = await this.ds.query(
      `SELECT p."createdAt", p."amountKobo", p.purpose, p.method,
              d."trackingCode", d."pickupAddress", d."dropoffAddress", d.kind,
              (SELECT COUNT(*)::int FROM delivery_stops s WHERE s."deliveryId" = d.id) AS stops
         FROM payments p
         LEFT JOIN deliveries d ON d.id = p."deliveryId"
        WHERE p."customerId" = $1
          AND p.status = 'success'
          AND p.purpose <> 'card_verify'
          AND p."createdAt" BETWEEN $2 AND $3
        ORDER BY p."createdAt" ASC`,
      [userId, w.from.toISOString(), w.to.toISOString()],
    );

    const lines: StatementLine[] = (rows as any[]).map((r) => {
      const rail = methodLabel(r.method);
      return {
        date:      r.createdAt,
        narrative: rail ? `${spendNarrative(r)} (${rail})` : spendNarrative(r),
        amountNgn: Number(r.amountKobo ?? 0) / 100,
        status:    'paid',
        settled:   true,
      };
    });

    return {
      subjectType: 'customer' as const,
      subjectId:   userId,
      subjectName: who[0].name,
      subjectMeta: who[0].accountId ? `Account ${who[0].accountId}` : undefined,
      title:       'Delivery and Ride Spend',
      window: w,
      lines,
      // Settled only, so a second total would be a zero nobody can read.
      pendingLabel: null as string | null,
    };
  }

  // ── Admin: see what has been issued ────────────────────────────────────

  /**
   * List issued statements.
   *
   * Two documents existed in production with nobody able to name them:
   * the only admin route was issue-one-for-an-entity-you-already-know,
   * and nothing enumerated the table. So "who is walking around with a
   * SEIRS statement" was unanswerable from admin, from the apps and from
   * the health probe alike (found 2026-09-01).
   *
   * The pdf column is never selected. It is the document itself, several
   * kilobytes a row, and nothing in a list view renders it.
   */
  async adminList(opts: { page?: number; subjectType?: string; q?: string } = {}) {
    const take = 25;
    const page = Math.max(1, Number(opts.page ?? 1));
    const args: any[] = [];
    const where: string[] = [];

    if (opts.subjectType) {
      args.push(opts.subjectType);
      where.push(`"subjectType" = $${args.length}`);
    }
    if (opts.q?.trim()) {
      args.push(`%${opts.q.trim()}%`);
      where.push(`("code" ILIKE $${args.length} OR "subjectName" ILIKE $${args.length})`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRows = await this.ds.query(
      `SELECT COUNT(*)::int AS n FROM "statement_records" ${clause}`, args,
    );
    const total = totalRows?.[0]?.n ?? 0;

    const rows = await this.ds.query(
      `SELECT "code", "subjectType", "subjectId", "subjectName",
              "periodFrom", "periodTo", "totalPaidNgn", "totalPendingNgn",
              "lineCount", "issuedBy", "createdAt", "downloadExpiresAt",
              ("pdf" IS NOT NULL) AS "hasDocument"
         FROM "statement_records" ${clause}
        ORDER BY "createdAt" DESC
        LIMIT ${take} OFFSET ${(page - 1) * take}`,
      args,
    );

    const now = Date.now();
    return {
      items: (rows as any[]).map(r => ({
        ...r,
        totalPaidNgn:    Number(r.totalPaidNgn),
        totalPendingNgn: Number(r.totalPendingNgn),
        // Two different reasons a link will not work, and support needs
        // to tell them apart: never had a document, versus had one and
        // the window closed.
        hasDocument: r.hasDocument === true,
        expired: !!r.downloadExpiresAt && new Date(r.downloadExpiresAt).getTime() < now,
      })),
      total, page, pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  /**
   * Kill a download link now, without touching verification.
   *
   * The case this exists for is a statement emailed to the wrong
   * address. The document is already out, so this is damage limitation
   * rather than a recall, and the record stays verifiable because the
   * paper somebody already holds must not stop checking out.
   */
  async adminRevoke(code: string) {
    const rec = await this.records.findOne({ where: { code: String(code ?? '').trim().toUpperCase() } });
    if (!rec) throw new NotFoundException('No statement matches that reference.');
    await this.records.update(rec.id, { downloadExpiresAt: new Date(Date.now() - 1000) });
    return { code: rec.code, revoked: true };
  }

  /**
   * Issue a fresh statement over the same subject and window.
   *
   * Figures are recomputed from today's data on purpose. That is the
   * whole point of a re-issue: if a payment was refunded since, the new
   * document should say so, and it gets its own code rather than
   * overwriting one somebody may be holding.
   */
  async adminReissue(code: string) {
    const rec = await this.records.findOne({ where: { code: String(code ?? '').trim().toUpperCase() } });
    if (!rec) throw new NotFoundException('No statement matches that reference.');

    const from = rec.periodFrom.toISOString().slice(0, 10);
    const to   = rec.periodTo.toISOString().slice(0, 10);
    const data =
      rec.subjectType === 'partner'  ? await this.partnerStatement(rec.subjectId, from, to)
      : rec.subjectType === 'driver' ? await this.driverStatement(rec.subjectId, from, to)
      : rec.subjectType === 'business' ? await this.businessStatement(rec.subjectId, from, to)
      : await this.customerStatement(rec.subjectId, from, to);

    const issued = await this.issueLink(data as any, 'support');
    return { replaces: rec.code, ...issued };
  }

  // ── Issue ──────────────────────────────────────────────────────────────

  /**
   * Turn gathered data into a recorded, verifiable PDF.
   *
   * The record is written BEFORE the document is produced, so a document
   * can never exist without figures to check it against.
   */
  async issue(
    data: Awaited<ReturnType<StatementsService['partnerStatement']>>,
    issuedBy = 'self',
  ): Promise<{ pdf: Buffer; code: string; filename: string }> {
    const paid    = data.lines.filter(l => l.settled).reduce((a, l) => a + l.amountNgn, 0);
    const pending = data.lines.filter(l => !l.settled).reduce((a, l) => a + l.amountNgn, 0);

    const code = `STM-${secureCode(8)}`;
    const record = await this.records.save(this.records.create({
      code,
      subjectType:     data.subjectType,
      subjectId:       data.subjectId,
      subjectName:     data.subjectName,
      periodFrom:      data.window.from,
      periodTo:        data.window.to,
      totalPaidNgn:    Math.round(paid * 100) / 100 as any,
      totalPendingNgn: Math.round(pending * 100) / 100 as any,
      lineCount:       data.lines.length,
      issuedBy,
    }));

    const pdf = await renderStatementPdf({
      title:        data.title,
      subjectName:  data.subjectName,
      subjectMeta:  data.subjectMeta,
      periodFrom:   data.window.from,
      periodTo:     data.window.to,
      lines:        data.lines,
      totalPaidNgn: paid,
      totalPendingNgn: pending,
      code,
      verifyUrl:    `${this.publicBase()}/verify/${code}`,
      issuedNote:   issuedBy === 'self' ? undefined : `Issued by SEIRS ${issuedBy}`,
      // Undefined keeps the earner wording partner and driver expect.
      pendingLabel: (data as any).pendingLabel,
    });

    /**
     * Keep the document itself, so a later download serves the bytes
     * that were issued rather than re-rendering from data that may have
     * moved since. A payment refunded after issue would otherwise
     * produce a PDF disagreeing with the totals on its own verification
     * page, which is the exact failure the verify link exists to
     * prevent.
     *
     * Written after rendering rather than before, so a render that
     * throws leaves a record with no bytes instead of a half-document.
     * The download route treats missing bytes as expired.
     */
    const days = await this.downloadWindowDays();
    await this.records.update(record.id, {
      pdf,
      downloadExpiresAt: new Date(Date.now() + days * 24 * 3600 * 1000),
    });

    const stamp = data.window.to.toISOString().slice(0, 10);
    return { pdf, code, filename: `seirs-statement-${stamp}-${code}.pdf` };
  }

  /**
   * Issue exactly as `issue` does, but hand back the reference instead
   * of the bytes. Same record, same stored document, same expiry: the
   * only difference is what the caller is given to do with it.
   */
  async issueLink(
    data: Awaited<ReturnType<StatementsService['partnerStatement']>>,
    issuedBy = 'self',
  ): Promise<{ code: string; expiresAt: Date | null }> {
    const { code } = await this.issue(data, issuedBy);
    const rec = await this.records.findOne({ where: { code } });
    return { code, expiresAt: rec?.downloadExpiresAt ?? null };
  }

  /**
   * How long a download link stays alive, in days.
   *
   * A Fee Catalogue row with a compiled fallback, per the standing rule
   * that every policy knob is admin-editable. Conservative by default:
   * the link is emailed and email gets forwarded, so a short life is
   * the safer end to be wrong at, and re-issuing costs a tap.
   */
  private async downloadWindowDays(): Promise<number> {
    try {
      const rows: Array<{ value: string }> = await this.ds.query(
        `SELECT value FROM fees WHERE key = 'statement_download_expiry_days' AND active = true LIMIT 1`,
      );
      const n = Number(rows?.[0]?.value);
      if (Number.isFinite(n) && n > 0 && n <= 365) return n;
    } catch { /* fees table unavailable: fall through */ }
    return 7;
  }

  /**
   * Serve a previously issued document by its printed code.
   *
   * Public, and authenticated by the code itself, the same way tracking
   * and collection links work: an unguessable reference in a 32^8 space,
   * handed to the person who is meant to have it.
   *
   * It gives up MORE than the verification page does, which shows totals
   * only and deliberately leaks nothing about the subject's business.
   * This hands over every line. That is defensible for somebody holding
   * the paper, since the paper already carries the lines, but it is why
   * the link expires and the verification code does not.
   */
  async downloadByCode(code: string): Promise<{ pdf: Buffer; filename: string }> {
    const rec = await this.records.findOne({ where: { code: String(code ?? '').trim().toUpperCase() } });
    if (!rec) throw new NotFoundException('No statement matches that reference.');

    // Rows issued before the bytes were kept, and rows whose render
    // failed, both land here. Neither is a server error to the person
    // holding the link: the document is simply no longer available.
    if (!rec.pdf) {
      throw new NotFoundException(
        'This statement is no longer available to download. Open the SEIRS app to issue a fresh one.',
      );
    }
    if (rec.downloadExpiresAt && rec.downloadExpiresAt.getTime() < Date.now()) {
      throw new NotFoundException(
        'This download link has expired. The statement can still be verified by its reference, '
        + 'and a fresh copy can be issued from the SEIRS app.',
      );
    }

    const stamp = new Date(rec.periodTo).toISOString().slice(0, 10);
    return { pdf: rec.pdf, filename: `seirs-statement-${stamp}-${rec.code}.pdf` };
  }

  /**
   * Public check. Returns what SEIRS issued, or nothing.
   *
   * Deliberately thin: enough for a bank or tax officer to confirm the
   * totals and the window, and nothing that would leak a person's
   * business to whoever happens to hold the code.
   */
  async verify(code: string) {
    const rec = await this.records.findOne({ where: { code: code.trim().toUpperCase() } });
    if (!rec) return { valid: false as const };
    return {
      valid: true as const,
      code:          rec.code,
      issuedTo:      rec.subjectName,
      subjectType:   rec.subjectType,
      periodFrom:    rec.periodFrom,
      periodTo:      rec.periodTo,
      totalPaidNgn:    Number(rec.totalPaidNgn),
      totalPendingNgn: Number(rec.totalPendingNgn),
      lineCount:     rec.lineCount,
      issuedAt:      rec.createdAt,
    };
  }
}
