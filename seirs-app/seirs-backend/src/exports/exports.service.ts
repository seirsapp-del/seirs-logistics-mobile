import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import type { Response } from 'express';

import { AuditLogEntry } from '../admin/audit-log.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Driver } from '../drivers/driver.entity';
import { DriverEarning } from '../earnings/driver-earning.entity';
import { DriverPayout } from '../earnings/driver-payout.entity';
import { Payment } from '../payments/payment.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { User, UserRole } from '../users/user.entity';
import {
  EXPORTS_FINANCE_PERMISSION, EXPORTS_OPERATIONAL_PERMISSION,
} from './export-permission.guard';
import {
  UTF8_BOM, accountLast4, bool, count, csvRow, decimal, isoDate, money, moneyFromKobo,
} from './csv.util';

export type ExportKey =
  | 'driver-payouts'
  | 'driver-earnings'
  | 'payments'
  | 'deliveries'
  | 'drivers'
  | 'customers'
  | 'support-tickets';

interface DateRange {
  /** Inclusive start, midnight Africa/Lagos. */
  start: Date;
  /** Inclusive end, 23:59:59.999 Africa/Lagos. */
  end: Date;
  /** YYYY-MM-DD as the operator typed it, used in the filename. */
  fromLabel: string;
  toLabel: string;
}

interface ExportDefinition {
  key: ExportKey;
  label: string;
  permission: string;
  /** Header row, in order. This IS the whitelist: nothing else is written. */
  columns: string[];
  query: (range: DateRange) => SelectQueryBuilder<any>;
  row: (raw: any) => unknown[];
}

/**
 * Nigeria has no daylight saving, so Africa/Lagos is a fixed +01:00 and
 * a date range can be pinned to it with a literal offset rather than a
 * timezone library. This matters: an operator asking for August means
 * August in Lagos, and reading the range as UTC would move an hour of
 * revenue out of the first of the month and into the last day of July.
 */
const LAGOS_UTC_OFFSET = '+01:00';

/**
 * Rows fetched per round trip.
 *
 * The response is written batch by batch rather than assembled into one
 * string, so memory stays flat no matter how many rows a range holds.
 * 500 is small enough that a slow client cannot pin much server memory
 * and large enough that a month of deliveries is a handful of queries.
 */
const BATCH_SIZE = 500;

/**
 * The widest range a single export may cover.
 *
 * A year covers every reconciliation and audit request anyone has
 * described, and the cap is what stops a mistyped year turning a routine
 * click into a full-table dump of the customer list.
 */
const MAX_RANGE_DAYS = 366;

/** Raised when the client hangs up mid-download. Not an error worth reporting. */
class ClientGoneError extends Error {}

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(
    @InjectRepository(DriverPayout)  private readonly payoutsRepo:  Repository<DriverPayout>,
    @InjectRepository(DriverEarning) private readonly earningsRepo: Repository<DriverEarning>,
    @InjectRepository(Payment)       private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(Delivery)      private readonly deliveryRepo: Repository<Delivery>,
    @InjectRepository(Driver)        private readonly driversRepo:  Repository<Driver>,
    @InjectRepository(User)          private readonly usersRepo:    Repository<User>,
    @InjectRepository(SupportTicket) private readonly ticketsRepo:  Repository<SupportTicket>,
    @InjectRepository(AuditLogEntry) private readonly auditRepo:    Repository<AuditLogEntry>,
  ) {}

  // -- Entry point ---------------------------------------------------------

  /**
   * Stream one export to the response as CSV.
   *
   * Everything that can fail with a clean HTTP error happens before the
   * first byte is written, because the global exception filter answers
   * with res.json() and would throw ERR_HTTP_HEADERS_SENT if it ran
   * after the download had begun. Once streaming starts the only honest
   * failure is to destroy the connection: a truncated CSV that looks
   * complete is a reconciliation hazard, a failed download is not.
   */
  async streamCsv(
    key: ExportKey,
    from: string | undefined,
    to: string | undefined,
    admin: any,
    ip: string | undefined,
    res: Response,
  ): Promise<void> {
    const def   = this.definition(key);
    const range = this.parseRange(from, to);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${this.filename(def, range)}"`,
    );
    // An export is a point-in-time extract. A cached copy sitting in a
    // proxy is both stale and a copy of the data nobody audited.
    res.setHeader('Cache-Control', 'no-store');

    // A counter the writer mutates rather than a return value, so a run
    // that dies at row 40,000 still audits 40,000 rather than zero. The
    // rows already on the wire have left the building whether or not the
    // download finished, and an audit trail that under-reports a partial
    // export is worse than no number at all.
    const progress = { rows: 0 };
    let completed = false;
    let failure: string | null = null;

    try {
      await this.write(res, UTF8_BOM + csvRow(def.columns));
      await this.writeRows(res, def, range, progress);
      completed = true;
      res.end();
    } catch (e: any) {
      if (e instanceof ClientGoneError) {
        // The operator cancelled or navigated away. Still audited below,
        // because a partial download is still data that left.
        failure = 'client disconnected';
      } else {
        failure = e?.message ?? 'unknown error';
        this.logger.error(`Export ${key} failed after ${progress.rows} rows: ${failure}`);
      }
      if (!res.writableEnded) res.destroy();
    } finally {
      // Audited whether or not it finished. Somebody downloading the
      // customer table leaves a trace even when the download broke, and
      // NDPR expects that trace to exist rather than merely recommending
      // it.
      await this.logExportAudit(admin, def, range, progress.rows, completed, failure, ip);
    }
  }

  // -- Batched writing -----------------------------------------------------

  private async writeRows(
    res: Response,
    def: ExportDefinition,
    range: DateRange,
    progress: { rows: number },
  ): Promise<void> {
    const qb = def.query(range);
    let offset = 0;

    for (;;) {
      if (res.writableEnded || res.destroyed) throw new ClientGoneError();

      const batch = await qb.offset(offset).limit(BATCH_SIZE).getRawMany();
      if (batch.length === 0) break;

      let chunk = '';
      for (const raw of batch) chunk += csvRow(def.row(raw));
      await this.write(res, chunk);

      progress.rows += batch.length;
      offset        += batch.length;
      if (batch.length < BATCH_SIZE) break;
    }
  }

  /**
   * One write, respecting backpressure.
   *
   * Without the drain wait a fast query against a slow connection would
   * queue the whole result set in the socket buffer, which is the same
   * as building the file in memory and defeats the batching above.
   */
  private write(res: Response, chunk: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (res.writableEnded || res.destroyed) {
        reject(new ClientGoneError());
        return;
      }
      if (res.write(chunk)) {
        resolve();
        return;
      }
      res.once('drain', resolve);
    });
  }

  // -- Audit ---------------------------------------------------------------

  /**
   * Follows logAudit in admin.service.ts: same table, same shape, same
   * `kind:id` target convention (`user:<id>`, `delivery:<id>`, here
   * `export:<key>`). Written here rather than by calling the admin
   * service so this module owns its own dependencies.
   *
   * The meta answers the question an auditor actually asks: who took
   * what, covering which dates, and how many rows did they get.
   */
  private async logExportAudit(
    admin: any,
    def: ExportDefinition,
    range: DateRange,
    rows: number,
    completed: boolean,
    failure: string | null,
    ip?: string,
  ) {
    try {
      await this.auditRepo.save(this.auditRepo.create({
        adminId:   admin?.id ?? admin?.sub,
        adminName: admin?.name ?? 'Admin',
        action:    'data_export',
        target:    `export:${def.key}`,
        meta: {
          label:      def.label,
          permission: def.permission,
          from:       range.fromLabel,
          to:         range.toLabel,
          rows,
          columns:    def.columns.length,
          completed,
          ...(failure ? { failure } : {}),
        },
        ip,
      }));
    } catch (e: any) {
      // Never let the audit write break a download that already happened.
      // Loud in the logs instead, because a missing trail is the thing
      // this is here to prevent.
      this.logger.error(`AUDIT WRITE FAILED for export ${def.key} by ${admin?.id}: ${e?.message}`);
    }
  }

  // -- Range and filename --------------------------------------------------

  private parseRange(from?: string, to?: string): DateRange {
    const today     = this.todayInLagos();
    const toLabel   = (to   ?? today).trim();
    const fromLabel = (from ?? this.daysBefore(toLabel, 29)).trim();

    const pairs: Array<[string, string]> = [['from', fromLabel], ['to', toLabel]];
    for (const [name, value] of pairs) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new BadRequestException(`"${name}" must be a date in YYYY-MM-DD form.`);
      }
    }

    const start = new Date(`${fromLabel}T00:00:00.000${LAGOS_UTC_OFFSET}`);
    const end   = new Date(`${toLabel}T23:59:59.999${LAGOS_UTC_OFFSET}`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('That date range is not a real range.');
    }
    if (start > end) {
      throw new BadRequestException('The start date is after the end date.');
    }

    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `A single export covers at most ${MAX_RANGE_DAYS} days. Pull the period in shorter runs.`,
      );
    }

    return { start, end, fromLabel, toLabel };
  }

  /** YYYY-MM-DD for right now in Lagos, whatever the server clock is set to. */
  private todayInLagos(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  }

  private daysBefore(label: string, days: number): string {
    const d = new Date(`${label}T12:00:00.000${LAGOS_UTC_OFFSET}`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  }

  /**
   * The filename carries the range, so a folder of these files is
   * self-describing months later and two months of payouts cannot be
   * confused for one another on an accountant's desktop.
   */
  private filename(def: ExportDefinition, range: DateRange): string {
    return `seirs-${def.key}_${range.fromLabel}_to_${range.toLabel}.csv`;
  }

  // -- Definitions ---------------------------------------------------------

  private definition(key: ExportKey): ExportDefinition {
    const def = this.definitions().find(d => d.key === key);
    if (!def) throw new NotFoundException(`Unknown export "${key}".`);
    return def;
  }

  /**
   * Every column written, named one at a time.
   *
   * Whitelist, never blacklist, and never a spread of an entity. The
   * reason is written on the wall of common/redact-driver.ts: a relation
   * that loaded itself shipped a driver's bank details, home address,
   * date of birth, KYC document URLs and lockout state into a customer's
   * chat, because nobody chose the fields, a decorator did. A blacklist
   * here would leak whichever column somebody adds next.
   */
  private definitions(): ExportDefinition[] {
    return [
      this.driverPayoutsDef(),
      this.driverEarningsDef(),
      this.paymentsDef(),
      this.deliveriesDef(),
      this.driversDef(),
      this.customersDef(),
      this.supportTicketsDef(),
    ];
  }

  /**
   * 1. Driver payouts. THE reconciliation export.
   *
   * One row per transfer that actually left, read from driver_payouts
   * rather than inferred from earnings rows marked paid. That difference
   * is the whole reason the table exists: the first real payout sent
   * 1,322.71 while the dashboard, summing driverNet over earnings,
   * reported 1,469.68 against it. Requested, sent and withheld are three
   * separate columns here so the gap is visible rather than
   * reconstructed.
   *
   * The destination bank appears as code, name and the LAST FOUR DIGITS
   * only. Four digits are enough to match a line on a bank statement,
   * and a full NUBAN in a spreadsheet is an account number that has left
   * the building.
   */
  private driverPayoutsDef(): ExportDefinition {
    return {
      key:        'driver-payouts',
      label:      'Driver payouts (money that left)',
      permission: EXPORTS_FINANCE_PERMISSION,
      columns: [
        'payout_id', 'paid_at_utc', 'driver_id', 'driver_name_at_payout', 'driver_name_now',
        'requested_ngn', 'sent_ngn', 'holdback_ngn', 'earning_count',
        'reference', 'flutterwave_transfer_id',
        'bank_code', 'bank_account_name', 'bank_account_last4',
      ],
      query: (range) => this.payoutsRepo.createQueryBuilder('p')
        .leftJoin(User, 'u', 'u.id = p.driverId')
        .select('p.id', 'payout_id')
        .addSelect('p.createdAt', 'created_at')
        .addSelect('p.driverId', 'driver_id')
        .addSelect('p.driverName', 'driver_name_at_payout')
        .addSelect('u.name', 'driver_name_now')
        .addSelect('p.requestedNgn', 'requested_ngn')
        .addSelect('p.sentNgn', 'sent_ngn')
        .addSelect('p.holdbackNgn', 'holdback_ngn')
        .addSelect('p.earningCount', 'earning_count')
        .addSelect('p.reference', 'reference')
        .addSelect('p.flutterwaveTransferId', 'flutterwave_transfer_id')
        .addSelect('u.bankCode', 'bank_code')
        .addSelect('u.bankAccountName', 'bank_account_name')
        // Read whole, written as the last 4 only. See accountLast4.
        .addSelect('u.bankAccountNumber', 'bank_account_number')
        .where('p.createdAt BETWEEN :start AND :end', { start: range.start, end: range.end })
        .orderBy('p.createdAt', 'ASC')
        .addOrderBy('p.id', 'ASC'),
      row: (r) => [
        r.payout_id,
        isoDate(r.created_at),
        r.driver_id,
        r.driver_name_at_payout,
        r.driver_name_now,
        money(r.requested_ngn),
        money(r.sent_ngn),
        money(r.holdback_ngn),
        count(r.earning_count),
        r.reference,
        r.flutterwave_transfer_id,
        r.bank_code,
        r.bank_account_name,
        accountLast4(r.bank_account_number),
      ],
    };
  }

  /**
   * 2. Driver earnings ledger, with status on every row.
   *
   * Status is the point: pending, available, paying, paid and held are
   * five different liabilities, and a total that mixes them is not a
   * number anyone can act on. `paying` in particular is a claim held
   * across the Flutterwave call, so a row stuck in it is something to
   * reconcile by hand and has to be visible.
   */
  private driverEarningsDef(): ExportDefinition {
    return {
      key:        'driver-earnings',
      label:      'Driver earnings ledger',
      permission: EXPORTS_FINANCE_PERMISSION,
      columns: [
        'earning_id', 'created_at_utc', 'driver_id', 'driver_name',
        'delivery_id', 'tracking_code',
        'gross_amount_ngn', 'seirs_cut_ngn', 'driver_net_ngn',
        'status', 'available_at_utc', 'paid_at_utc',
        'flutterwave_transfer_id', 'hold_reason',
      ],
      query: (range) => this.earningsRepo.createQueryBuilder('e')
        .leftJoin('e.driver', 'u')
        .leftJoin('e.delivery', 'd')
        .select('e.id', 'earning_id')
        .addSelect('e.createdAt', 'created_at')
        .addSelect('e.driverId', 'driver_id')
        .addSelect('u.name', 'driver_name')
        .addSelect('e.deliveryId', 'delivery_id')
        .addSelect('d.trackingCode', 'tracking_code')
        .addSelect('e.grossAmount', 'gross_amount')
        .addSelect('e.seirsCut', 'seirs_cut')
        .addSelect('e.driverNet', 'driver_net')
        .addSelect('e.status', 'status')
        .addSelect('e.availableAt', 'available_at')
        .addSelect('e.paidAt', 'paid_at')
        .addSelect('e.flutterwaveTransferId', 'flutterwave_transfer_id')
        .addSelect('e.holdReason', 'hold_reason')
        .where('e.createdAt BETWEEN :start AND :end', { start: range.start, end: range.end })
        .orderBy('e.createdAt', 'ASC')
        .addOrderBy('e.id', 'ASC'),
      row: (r) => [
        r.earning_id,
        isoDate(r.created_at),
        r.driver_id,
        r.driver_name,
        r.delivery_id,
        r.tracking_code,
        money(r.gross_amount),
        money(r.seirs_cut),
        money(r.driver_net),
        r.status,
        isoDate(r.available_at),
        isoDate(r.paid_at),
        r.flutterwave_transfer_id,
        r.hold_reason,
      ],
    };
  }

  /**
   * 3. Payments in, with escrow status.
   *
   * Escrow status is what separates money SEIRS is holding against an
   * undelivered package from money already released to a rider, and the
   * purpose column separates a fare from a redirect fee, a return leg or
   * a card-verification charge. Both matter: a second charge on one
   * delivery was once picked up by escrow release and paid out as though
   * it were the fare, so a payments file without them misstates revenue.
   */
  private paymentsDef(): ExportDefinition {
    return {
      key:        'payments',
      label:      'Customer payments in',
      permission: EXPORTS_FINANCE_PERMISSION,
      columns: [
        'payment_id', 'created_at_utc', 'customer_id', 'customer_name', 'customer_is_demo',
        'delivery_id', 'tracking_code', 'dropoff_id',
        'amount_ngn', 'currency', 'status', 'method', 'escrow_status', 'purpose',
        'provider', 'provider_reference', 'flutterwave_transaction_id',
        'released_at_utc', 'failure_reason',
      ],
      query: (range) => this.paymentsRepo.createQueryBuilder('p')
        .leftJoin('p.customer', 'u')
        .leftJoin('p.delivery', 'd')
        .select('p.id', 'payment_id')
        .addSelect('p.createdAt', 'created_at')
        .addSelect('u.id', 'customer_id')
        .addSelect('u.name', 'customer_name')
        .addSelect('u.isDemo', 'customer_is_demo')
        .addSelect('d.id', 'delivery_id')
        .addSelect('d.trackingCode', 'tracking_code')
        .addSelect('p.dropoffId', 'dropoff_id')
        .addSelect('p.amountKobo', 'amount_kobo')
        .addSelect('p.currency', 'currency')
        .addSelect('p.status', 'status')
        .addSelect('p.method', 'method')
        .addSelect('p.escrowStatus', 'escrow_status')
        .addSelect('p.purpose', 'purpose')
        .addSelect('p.provider', 'provider')
        .addSelect('p.providerReference', 'provider_reference')
        .addSelect('p.flutterwaveTransactionId', 'flutterwave_transaction_id')
        .addSelect('p.releasedAt', 'released_at')
        .addSelect('p.failureReason', 'failure_reason')
        .where('p.createdAt BETWEEN :start AND :end', { start: range.start, end: range.end })
        .orderBy('p.createdAt', 'ASC')
        .addOrderBy('p.id', 'ASC'),
      row: (r) => [
        r.payment_id,
        isoDate(r.created_at),
        r.customer_id,
        r.customer_name,
        bool(r.customer_is_demo),
        r.delivery_id,
        r.tracking_code,
        r.dropoff_id,
        moneyFromKobo(r.amount_kobo),
        r.currency,
        r.status,
        r.method,
        r.escrow_status,
        r.purpose,
        r.provider,
        r.provider_reference,
        r.flutterwave_transaction_id,
        isoDate(r.released_at),
        r.failure_reason,
      ],
    };
  }

  /**
   * 4. Deliveries with the price breakdown.
   *
   * Every money column on the delivery is named individually rather than
   * dumping the priceBreakdown jsonb. That blob is free-form and changes
   * with the pricing engine, and this codebase has twice shipped a jsonb
   * column whole and been surprised by what was inside it. Named columns
   * also mean an accountant's pivot table does not silently change shape
   * the next time the engine does.
   *
   * Pickup and dropoff addresses are deliberately absent: a reconciliation
   * file does not need them, and in bulk they are a list of where every
   * customer lives.
   */
  private deliveriesDef(): ExportDefinition {
    return {
      key:        'deliveries',
      label:      'Deliveries with price breakdown',
      permission: EXPORTS_FINANCE_PERMISSION,
      columns: [
        'delivery_id', 'tracking_code', 'created_at_utc', 'status', 'source', 'kind',
        'is_multi_stop', 'customer_id', 'customer_name', 'customer_is_demo',
        'driver_id', 'driver_name', 'vehicle_type',
        'package_size', 'urgency', 'category_code', 'weight_kg',
        'distance_km', 'quoted_distance_source', 'rate_card_snapshot_id',
        'price_ngn', 'driver_earnings_ngn', 'night_fee_ngn', 'partner_handling_ngn',
        'cancellation_fee_ngn', 'redirect_fee_ngn', 'driver_failed_trip_ngn',
        'return_quote_ngn', 'address_change_quote_ngn',
        'declared_value_ngn', 'cod_amount_ngn', 'payment_method',
        'assigned_at_utc', 'picked_up_at_utc', 'delivered_at_utc', 'cancelled_at_utc',
      ],
      query: (range) => this.deliveryRepo.createQueryBuilder('d')
        .leftJoin('d.customer', 'c')
        .leftJoin('d.driver', 'dr')
        .leftJoin('dr.user', 'du')
        .select('d.id', 'delivery_id')
        .addSelect('d.trackingCode', 'tracking_code')
        .addSelect('d.createdAt', 'created_at')
        .addSelect('d.status', 'status')
        .addSelect('d.source', 'source')
        .addSelect('d.kind', 'kind')
        .addSelect('d.isMultiStop', 'is_multi_stop')
        .addSelect('c.id', 'customer_id')
        .addSelect('c.name', 'customer_name')
        .addSelect('c.isDemo', 'customer_is_demo')
        .addSelect('dr.id', 'driver_id')
        .addSelect('du.name', 'driver_name')
        .addSelect('d.vehicleType', 'vehicle_type')
        .addSelect('d.packageSize', 'package_size')
        .addSelect('d.urgency', 'urgency')
        .addSelect('d.categoryCode', 'category_code')
        .addSelect('d.weightKg', 'weight_kg')
        .addSelect('d.distanceKm', 'distance_km')
        .addSelect('d.quotedDistanceSource', 'quoted_distance_source')
        .addSelect('d.rateCardSnapshotId', 'rate_card_snapshot_id')
        .addSelect('d.price', 'price')
        .addSelect('d.driverEarnings', 'driver_earnings')
        .addSelect('d.nightFeeNgn', 'night_fee')
        .addSelect('d.partnerHandlingNgn', 'partner_handling')
        .addSelect('d.cancellationFeeNgn', 'cancellation_fee')
        .addSelect('d.redirectFeeNgn', 'redirect_fee')
        .addSelect('d.driverFailedTripNgn', 'driver_failed_trip')
        .addSelect('d.returnQuoteNgn', 'return_quote')
        .addSelect('d.addressChangeQuoteNgn', 'address_change_quote')
        .addSelect('d.declaredValueNgn', 'declared_value')
        .addSelect('d.codAmountNgn', 'cod_amount')
        .addSelect('d.paymentMethod', 'payment_method')
        .addSelect('d.assignedAt', 'assigned_at')
        .addSelect('d.pickedUpAt', 'picked_up_at')
        .addSelect('d.deliveredAt', 'delivered_at')
        .addSelect('d.cancelledAt', 'cancelled_at')
        .where('d.createdAt BETWEEN :start AND :end', { start: range.start, end: range.end })
        .orderBy('d.createdAt', 'ASC')
        .addOrderBy('d.id', 'ASC'),
      row: (r) => [
        r.delivery_id,
        r.tracking_code,
        isoDate(r.created_at),
        r.status,
        r.source,
        r.kind,
        bool(r.is_multi_stop),
        r.customer_id,
        r.customer_name,
        bool(r.customer_is_demo),
        r.driver_id,
        r.driver_name,
        r.vehicle_type,
        r.package_size,
        r.urgency,
        r.category_code,
        decimal(r.weight_kg),
        decimal(r.distance_km),
        r.quoted_distance_source,
        r.rate_card_snapshot_id,
        money(r.price),
        money(r.driver_earnings),
        money(r.night_fee),
        money(r.partner_handling),
        money(r.cancellation_fee),
        money(r.redirect_fee),
        money(r.driver_failed_trip),
        money(r.return_quote),
        money(r.address_change_quote),
        money(r.declared_value),
        money(r.cod_amount),
        r.payment_method,
        isoDate(r.assigned_at),
        isoDate(r.picked_up_at),
        isoDate(r.delivered_at),
        isoDate(r.cancelled_at),
      ],
    };
  }

  /**
   * 5. Drivers, operational.
   *
   * Bank details are the last 4 only, for the same reason as the payout
   * file. Every KYC document URL, the selfie, the guarantor, the vehicle
   * owner's name and phone, the live position and the wallet balance are
   * all absent: this is a roster, not a compliance dossier, and the KYC
   * queue already shows a reviewer what they need one rider at a time.
   */
  private driversDef(): ExportDefinition {
    return {
      key:        'drivers',
      label:      'Drivers',
      permission: EXPORTS_OPERATIONAL_PERMISSION,
      columns: [
        'driver_id', 'user_id', 'name', 'email', 'phone', 'is_demo',
        'status', 'vehicle_type', 'vehicle_plate', 'vehicle_ownership',
        'is_online', 'value_level', 'rating', 'total_deliveries',
        'bank_code', 'bank_account_name', 'bank_account_last4', 'bank_verified_at_utc',
        'created_at_utc',
      ],
      query: (range) => this.driversRepo.createQueryBuilder('dr')
        .leftJoin('dr.user', 'u')
        .select('dr.id', 'driver_id')
        .addSelect('u.id', 'user_id')
        .addSelect('u.name', 'name')
        .addSelect('u.email', 'email')
        .addSelect('u.phone', 'phone')
        .addSelect('u.isDemo', 'is_demo')
        .addSelect('dr.status', 'status')
        .addSelect('dr.vehicleType', 'vehicle_type')
        .addSelect('dr.vehiclePlate', 'vehicle_plate')
        .addSelect('dr.vehicleOwnership', 'vehicle_ownership')
        .addSelect('dr.isOnline', 'is_online')
        .addSelect('dr.valueLevel', 'value_level')
        .addSelect('dr.rating', 'rating')
        .addSelect('dr.totalDeliveries', 'total_deliveries')
        .addSelect('u.bankCode', 'bank_code')
        .addSelect('u.bankAccountName', 'bank_account_name')
        .addSelect('u.bankAccountNumber', 'bank_account_number')
        .addSelect('u.bankVerifiedAt', 'bank_verified_at')
        .addSelect('dr.createdAt', 'created_at')
        .where('dr.createdAt BETWEEN :start AND :end', { start: range.start, end: range.end })
        .orderBy('dr.createdAt', 'ASC')
        .addOrderBy('dr.id', 'ASC'),
      row: (r) => [
        r.driver_id,
        r.user_id,
        r.name,
        r.email,
        r.phone,
        bool(r.is_demo),
        r.status,
        r.vehicle_type,
        r.vehicle_plate,
        r.vehicle_ownership,
        bool(r.is_online),
        count(r.value_level),
        decimal(r.rating),
        count(r.total_deliveries),
        r.bank_code,
        r.bank_account_name,
        accountLast4(r.bank_account_number),
        isoDate(r.bank_verified_at),
        isoDate(r.created_at),
      ],
    };
  }

  /**
   * 6. Customers, operational.
   *
   * The most sensitive file here, so the whitelist is at its narrowest.
   * NOT written, on purpose: the password hash, the password reset token
   * and its expiry, the email verification OTP and its expiry, the FCM
   * push token, the Google and Apple subject ids, the home address, the
   * date of birth, the emergency contacts, the bank account number, and
   * the failed-login and lockout state. None of them belong in a
   * spreadsheet and several of them are credentials.
   */
  private customersDef(): ExportDefinition {
    return {
      key:        'customers',
      label:      'Customers',
      permission: EXPORTS_OPERATIONAL_PERMISSION,
      columns: [
        'user_id', 'seirs_id', 'name', 'first_name', 'middle_name', 'last_name',
        'email', 'phone', 'is_demo', 'is_active', 'email_verified',
        'identity_verified_at_utc', 'identity_doc_type', 'referred_by_code',
        'business_account_id', 'partner_store_id',
        'created_at_utc', 'deactivated_at_utc', 'deletion_scheduled_at_utc',
      ],
      query: (range) => this.usersRepo.createQueryBuilder('u')
        .select('u.id', 'user_id')
        .addSelect('u.accountId', 'seirs_id')
        .addSelect('u.name', 'name')
        .addSelect('u.firstName', 'first_name')
        .addSelect('u.middleName', 'middle_name')
        .addSelect('u.lastName', 'last_name')
        .addSelect('u.email', 'email')
        .addSelect('u.phone', 'phone')
        .addSelect('u.isDemo', 'is_demo')
        .addSelect('u.isActive', 'is_active')
        .addSelect('u.emailVerified', 'email_verified')
        .addSelect('u.identityVerifiedAt', 'identity_verified_at')
        .addSelect('u.identityDocType', 'identity_doc_type')
        .addSelect('u.referredByCode', 'referred_by_code')
        .addSelect('u.businessAccountId', 'business_account_id')
        .addSelect('u.partnerStoreId', 'partner_store_id')
        .addSelect('u.createdAt', 'created_at')
        .addSelect('u.deactivatedAt', 'deactivated_at')
        .addSelect('u.deletionScheduledAt', 'deletion_scheduled_at')
        // Customers only. Riders have their own file and admins are
        // staff, so neither belongs in a customer list.
        .where('u.role = :role', { role: UserRole.CUSTOMER })
        .andWhere('u.createdAt BETWEEN :start AND :end', { start: range.start, end: range.end })
        .orderBy('u.createdAt', 'ASC')
        .addOrderBy('u.id', 'ASC'),
      row: (r) => [
        r.user_id,
        r.seirs_id,
        r.name,
        r.first_name,
        r.middle_name,
        r.last_name,
        r.email,
        r.phone,
        bool(r.is_demo),
        bool(r.is_active),
        bool(r.email_verified),
        isoDate(r.identity_verified_at),
        r.identity_doc_type,
        r.referred_by_code,
        r.business_account_id,
        r.partner_store_id,
        isoDate(r.created_at),
        isoDate(r.deactivated_at),
        isoDate(r.deletion_scheduled_at),
      ],
    };
  }

  /**
   * 7. Support tickets.
   *
   * The ticket ROW, never the thread. Message bodies live in
   * chat_messages and are a conversation between a user and an agent; a
   * queue report needs volumes, topics and response times, not a dump of
   * what everybody said. Subject is included because it is what makes a
   * row identifiable, and the user wrote it knowing it was a summary.
   */
  private supportTicketsDef(): ExportDefinition {
    return {
      key:        'support-tickets',
      label:      'Support tickets',
      permission: EXPORTS_OPERATIONAL_PERMISSION,
      columns: [
        'ticket_id', 'created_at_utc', 'user_id', 'user_name', 'user_account_type',
        'topic', 'status', 'subject', 'linked_delivery_id', 'assigned_agent_id',
        'first_agent_reply_at_utc', 'resolved_at_utc', 'auto_closed_at_utc',
        'last_message_at_utc',
      ],
      query: (range) => this.ticketsRepo.createQueryBuilder('t')
        .leftJoin('t.user', 'u')
        .select('t.id', 'ticket_id')
        .addSelect('t.createdAt', 'created_at')
        .addSelect('u.id', 'user_id')
        .addSelect('u.name', 'user_name')
        .addSelect('t.userAccountType', 'user_account_type')
        .addSelect('t.topic', 'topic')
        .addSelect('t.status', 'status')
        .addSelect('t.subject', 'subject')
        .addSelect('t.linkedDeliveryId', 'linked_delivery_id')
        .addSelect('t.assignedAgentId', 'assigned_agent_id')
        .addSelect('t.firstAgentReplyAt', 'first_agent_reply_at')
        .addSelect('t.resolvedAt', 'resolved_at')
        .addSelect('t.autoClosedAt', 'auto_closed_at')
        .addSelect('t.lastMessageAt', 'last_message_at')
        .where('t.createdAt BETWEEN :start AND :end', { start: range.start, end: range.end })
        .orderBy('t.createdAt', 'ASC')
        .addOrderBy('t.id', 'ASC'),
      row: (r) => [
        r.ticket_id,
        isoDate(r.created_at),
        r.user_id,
        r.user_name,
        r.user_account_type,
        r.topic,
        r.status,
        r.subject,
        r.linked_delivery_id,
        r.assigned_agent_id,
        isoDate(r.first_agent_reply_at),
        isoDate(r.resolved_at),
        isoDate(r.auto_closed_at),
        isoDate(r.last_message_at),
      ],
    };
  }
}
