import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StatementRecord } from './statement-record.entity';
import { renderStatementPdf, StatementLine } from './statement-pdf';
import { secureCode } from '../common/utils/auth-codes';

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
    const driver = await this.ds.query(
      `SELECT d.id, u.name, d."plateNumber"
         FROM drivers d JOIN users u ON u.id = d."userId"
        WHERE d.id = $1 LIMIT 1`,
      [driverId],
    ).catch(() => []);
    if (!driver?.length) throw new NotFoundException('Driver not found.');

    const rows = await this.ds.query(
      `SELECT e.driver_net::float AS amount, e.status,
              e."availableAt", e."createdAt", e."deliveryId"
         FROM driver_earnings e
        WHERE e.driver_id = $1
          AND e."createdAt" BETWEEN $2 AND $3
        ORDER BY e."createdAt" ASC`,
      [driverId, w.from.toISOString(), w.to.toISOString()],
    ).catch(() => []);

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
      subjectMeta: driver[0].plateNumber ? `Vehicle ${driver[0].plateNumber}` : undefined,
      title:       'Driver Earnings',
      window: w,
      lines,
    };
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
    await this.records.save(this.records.create({
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
    });

    const stamp = data.window.to.toISOString().slice(0, 10);
    return { pdf, code, filename: `seirs-statement-${stamp}-${code}.pdf` };
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
