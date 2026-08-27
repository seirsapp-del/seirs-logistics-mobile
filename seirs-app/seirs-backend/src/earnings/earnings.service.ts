import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import { DriverEarning, DriverEarningStatus } from './driver-earning.entity';
import { FlutterwaveService } from '../payments/flutterwave.service';
import { FeesService } from '../fees/fees.service';
import { User } from '../users/user.entity';
import { PLATFORM_COMMISSION } from '../common/constants/pricing';

/**
 * Driver Earnings service.
 *
 * Owns the lifecycle of driver earnings entries:
 *   pending  → available  (cron: dispute window expired)
 *   available → paid      (cron: payout via Flutterwave Transfer)
 *
 * SEIRS does NOT hold this money - it sits in the SEIRS company bank
 * account; we just track liability + initiate transfers.
 *
 * See docs/payments-spec.md §⑥.
 */

/**
 * Earnings clear in BUSINESS days after delivery: the dispute window
 * (founder decision 2026-08-09, replacing an older 24 clock-hour rule).
 *
 * Instant withdrawal, which sold riders a way past this window for 5%,
 * was deleted on 2026-08-27. It could never have worked as sold: the
 * eligible set is earnings still in `pending`, and production has
 * driver_clearance_business_days set to 0, so rows reach `available`
 * immediately and nothing was ever eligible. The screen said so itself,
 * under a heading advertising the fee. Charging to skip a wait that does
 * not exist is a promise we cannot keep, and creating the wait in order
 * to sell the way out of it would be worse: SEIRS does not front this
 * money, Flutterwave already holds it, so the fee prices no real cost.
 *
 * The live value is 0 on purpose: the money test needs a payout, a
 * failed payout and a pay-in inside one sitting rather than across a
 * weekend, which is exactly why this moved out of code and into the
 * catalogue (see the note beside the seed row). It is not an open
 * policy question. The only real risk is shipping with it still at 0,
 * because 0 means no dispute buffer: a rider can withdraw the moment a
 * trip completes, and a later chargeback lands on SEIRS with the money
 * already gone. Raise it before launch.
 */
const STANDARD_CLEARANCE_BUSINESS_DAYS = 2;
// Single source of truth for the cut: common/constants/pricing.ts
// (30%). This used to be a hardcoded 0.75 fallback (25% cut) that
// silently disagreed with the payment path's 30%.
const DEFAULT_DRIVER_SHARE         = 1 - PLATFORM_COMMISSION;
const MIN_PAYOUT_NAIRA             = 1000;
const MAX_DAILY_PAYOUT_NEW_DRIVER  = 50_000;
const MAX_DAILY_PAYOUT_ESTABLISHED = 200_000;
const NEW_DRIVER_HOLDBACK_DAYS     = 30;
const NEW_DRIVER_HOLDBACK_PERCENT  = 0.10;

/** Advance `days` business days (Mon-Fri) from `from`, keeping the time of day. */
function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(
    @InjectRepository(DriverEarning)
    private readonly repo: Repository<DriverEarning>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly flutterwave: FlutterwaveService,
    private readonly fees: FeesService,
  ) {}

  /**
   * How long a driver's earning sits before it can be withdrawn.
   *
   * Was a hard-coded 2 business days, which is right for live but makes
   * a payout test unwatchable: the founder wanted to see a real payout,
   * a failed payout and a pay-in inside one sitting rather than waiting
   * out a weekend (2026-08-18). Now a Fee Catalogue row, so the delay is
   * dialled from the dashboard and set back to 2 for launch without a
   * deploy. 0 clears immediately.
   */
  private async clearanceBusinessDays(): Promise<number> {
    return this.fees.getValueOr('driver_clearance_business_days', STANDARD_CLEARANCE_BUSINESS_DAYS);
  }

  /**
   * Payout policy, from the Fee Catalogue.
   *
   * These were constants: the minimum withdrawal, the daily ceilings, and
   * how long a new driver counts as new. They are risk controls, and risk
   * controls need tuning the week fraud shows up, not at the next deploy
   * (audit 2026-08-18). Every one keeps its old value as a code fallback,
   * so behaviour is unchanged until somebody deliberately changes it.
   */
  private async payoutPolicy() {
    const [minPayout, capNew, capEstablished, newDriverDays, holdbackPct] =
      await Promise.all([
        this.fees.getValueOr('driver_min_payout_ngn',        MIN_PAYOUT_NAIRA),
        this.fees.getValueOr('driver_daily_cap_new_ngn',     MAX_DAILY_PAYOUT_NEW_DRIVER),
        this.fees.getValueOr('driver_daily_cap_ngn',         MAX_DAILY_PAYOUT_ESTABLISHED),
        this.fees.getValueOr('driver_new_period_days',       NEW_DRIVER_HOLDBACK_DAYS),
        this.fees.getValueOr('driver_new_holdback_pct',      NEW_DRIVER_HOLDBACK_PERCENT * 100),
      ]);
    return { minPayout, capNew, capEstablished, newDriverDays, holdbackPct };
  }

  // ── Recording earnings (called from delivery-completion handler) ─────────

  /**
   * Record a driver earning entry for a completed delivery.
   * Status starts as 'pending'; will flip to 'available' after the dispute window.
   */
  async recordForDelivery(params: {
    driverId:    string;
    deliveryId:  string;
    grossNaira:  number;
    seirsCutPercent?: number;  // default 25%
  }): Promise<DriverEarning> {
    /**
     * One delivery, one earning row.
     *
     * This created a fresh row on every call with no check on
     * deliveryId, so any second call, a retry, a replayed webhook, a
     * redelivered status event, paid the rider for the same job twice
     * (2026-08-27). releaseEscrow guards on escrowStatus, which made it
     * unlikely rather than impossible, and "unlikely" is not a control
     * to have on the path that moves money.
     */
    const already = await this.repo.findOne({ where: { deliveryId: params.deliveryId } });
    if (already) {
      this.logger?.warn?.(
        `Earning already recorded for delivery ${params.deliveryId}; returning the existing row.`,
      );
      return already;
    }

    const cutPct = params.seirsCutPercent ?? (1 - DEFAULT_DRIVER_SHARE);
    const grossAmount = params.grossNaira;
    const seirsCut    = +(grossAmount * cutPct).toFixed(2);
    const driverNet   = +(grossAmount - seirsCut).toFixed(2);

    const availableAt = addBusinessDays(new Date(), await this.clearanceBusinessDays());

    const entry = this.repo.create({
      driverId:    params.driverId,
      deliveryId:  params.deliveryId,
      grossAmount: grossAmount.toFixed(2),
      seirsCut:    seirsCut.toFixed(2),
      driverNet:   driverNet.toFixed(2),
      status:      'pending',
      availableAt,
    });
    return this.repo.save(entry);
  }

  // ── State transitions ────────────────────────────────────────────────────

  /** Move pending earnings whose dispute window has expired to 'available'. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async flipPendingToAvailable(): Promise<{ flipped: number }> {
    const result = await this.repo
      .createQueryBuilder()
      .update(DriverEarning)
      .set({ status: 'available' })
      .where('status = :status', { status: 'pending' })
      .andWhere('available_at <= NOW()')
      .execute();

    if (result.affected) {
      this.logger.log(`Flipped ${result.affected} earnings: pending → available`);
    }
    return { flipped: result.affected ?? 0 };
  }

  /**
   * Hold an earning (fraud review or active dispute). Admin or fraud system.
   * Only valid from pending or available.
   */
  async hold(earningId: string, reason: string): Promise<DriverEarning> {
    const e = await this.repo.findOneBy({ id: earningId });
    if (!e) throw new NotFoundException('Earning not found');
    if (e.status === 'paid' || e.status === 'held') {
      throw new BadRequestException(`Cannot hold earning in status=${e.status}`);
    }
    e.status = 'held';
    e.holdReason = reason;
    return this.repo.save(e);
  }

  async releaseHold(earningId: string): Promise<DriverEarning> {
    const e = await this.repo.findOneBy({ id: earningId });
    if (!e) throw new NotFoundException('Earning not found');
    if (e.status !== 'held') {
      throw new BadRequestException(`Earning not held (status=${e.status})`);
    }
    // Release back to wherever it should be based on availableAt.
    e.status = e.availableAt <= new Date() ? 'available' : 'pending';
    e.holdReason = null;
    return this.repo.save(e);
  }

  // ── Payouts ──────────────────────────────────────────────────────────────

  /**
   * Daily payout cron (2 PM Africa/Lagos = 13:00 UTC). Sums available
   * earnings per driver, applies new-driver caps + holdback, fires
   * Flutterwave Transfer.
   */
  @Cron('0 13 * * *', { timeZone: 'Africa/Lagos' })
  async runDailyPayouts(): Promise<{ processed: number }> {
    const drivers = await this.repo
      .createQueryBuilder('e')
      .select('e.driver_id', 'driverId')
      .addSelect('SUM(e.driver_net)', 'total')
      .where('e.status = :s', { s: 'available' })
      .groupBy('e.driver_id')
      .having('SUM(e.driver_net) >= :min', {
        min: await this.fees.getValueOr('driver_min_payout_ngn', MIN_PAYOUT_NAIRA),
      })
      .getRawMany<{ driverId: string; total: string }>();

    let processed = 0;
    for (const row of drivers) {
      try {
        await this.payoutDriver(row.driverId);
        processed++;
      } catch (e: any) {
        this.logger.error(`Payout failed for driver ${row.driverId}: ${e.message}`);
      }
    }
    if (processed) this.logger.log(`Daily payout: ${processed} drivers paid`);
    return { processed };
  }

  /**
   * Pay out a single driver's available earnings (also exposed for "request payout now").
   * `requestedNaira` (optional) caps the payout below the daily cap: earnings
   * rows are matched FIFO and never split, so the paid amount is the largest
   * whole-delivery total not exceeding the request.
   * Paid-early-for-a-fee was removed on 2026-08-27. See the note on
   * clearanceBusinessDays below for why it could never have worked.
   */
  async payoutDriver(driverId: string, requestedNaira?: number): Promise<{ paidAmount: number; feeNgn: number; transferId?: string; payoutEarningIds: string[] }> {
    const driver = await this.userRepo.findOneBy({ id: driverId });

    /**
     * Demo accounts never receive real money.
     *
     * This guard existed on the wallet path and on admin manual-assign,
     * but NOT here, and not in runDailyPayouts which calls this. The
     * seeded demo driver carries a real payout account and Flutterwave
     * runs in live mode, so the 13:00 Lagos cron would have attempted an
     * actual bank transfer the moment a demo or marketing account
     * accrued the minimum. Found 2026-08-24 by a scenario agent that
     * deliberately refused to complete a delivery in case it fired.
     *
     * payoutDriver is the single choke point for both the manual request
     * and the cron, so one check covers both.
     */
    if ((driver as any)?.isDemo) {
      throw new BadRequestException(
        'Demo accounts cannot withdraw. This is a staged account, not a real one.',
      );
    }
    if (!driver) throw new NotFoundException('Driver not found');
    if (!driver.bankCode || !driver.bankAccountNumber || !driver.bankAccountName) {
      throw new BadRequestException('Driver bank account not configured');
    }

    // Fraud guard (founder decision 2026-08-09): a pending bank change
    // freezes ALL withdrawals (manual and daily cron) until support
    // resolves the review ticket. Otherwise a hijacker could request a
    // bank swap and still drain earnings to the old account race-style,
    // or social-engineer approval mid-flight.
    try {
      const pend: Array<{ pendingBankAccountNumber: string | null }> = await this.repo.manager.query(
        `SELECT "pendingBankAccountNumber" FROM wallets WHERE "userId" = $1 LIMIT 1`,
        [driverId],
      );
      if (pend?.[0]?.pendingBankAccountNumber) {
        throw new BadRequestException(
          'WITHDRAWALS_FROZEN: your bank account change is under review. ' +
          'Withdrawals resume once support resolves it (up to 3 business days).',
        );
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      // wallets table missing the column yet (pre-self-heal): no freeze.
    }

    // Apply new-driver cap. Every threshold comes from the catalogue.
    const policy = await this.payoutPolicy();
    const driverAgeDays = Math.floor((Date.now() - new Date(driver.createdAt).getTime()) / (24 * 3600 * 1000));
    const isNewDriver = driverAgeDays < policy.newDriverDays;
    const dailyCap = isNewDriver ? policy.capNew : policy.capEstablished;

    // A driver-requested amount tightens the cap; it can never widen it.
    if (requestedNaira !== undefined) {
      const req = Number(requestedNaira);
      if (!Number.isFinite(req) || req < policy.minPayout) {
        throw new BadRequestException(`Minimum withdrawal is ₦${policy.minPayout.toLocaleString()}`);
      }
    }
    const effectiveCap = requestedNaira !== undefined
      ? Math.min(dailyCap, Number(requestedNaira))
      : dailyCap;

    // Cleared earnings only, FIFO. Pending and held rows are never
    // eligible: waiting out the clearance window is the only way past it.
    const eligible = await this.repo.find({
      where: { driverId, status: 'available' },
      order: { availableAt: 'ASC' },
    });

    let runningTotal = 0;
    const toPayoutIds: string[] = [];
    for (const e of eligible) {
      const next = runningTotal + Number(e.driverNet);
      if (next > effectiveCap) break;  // stop at cap
      toPayoutIds.push(e.id);
      runningTotal = next;
    }

    if (runningTotal < policy.minPayout) {
      throw new BadRequestException(`Available payout ₦${runningTotal} is below minimum ₦${policy.minPayout.toLocaleString()}`);
    }

    // Apply new-driver 10% holdback (kept as available for next round).
    let payoutAmount = runningTotal;
    if (isNewDriver) {
      payoutAmount = +(runningTotal * (1 - policy.holdbackPct / 100)).toFixed(2);
    }

    // No fee is taken from a payout. A rider's earnings reach them whole.
    const feeNgn = 0;
    if (payoutAmount <= 0) {
      throw new BadRequestException('Nothing to pay out after fees.');
    }

    const reference = `seirs_payout_${driverId}_${Date.now()}`;

    /**
     * Claim the rows BEFORE the money moves.
     *
     * This used to transfer first and mark the rows paid afterwards. If
     * Flutterwave succeeded and that second write did not, because the
     * connection dropped or Railway recycled the container mid-request,
     * the money had left and the rows were still `available`: the same
     * balance could be withdrawn again. The window is small and the loss
     * is total, which is the worst pair of properties a money bug can
     * have.
     *
     * The claim is conditional on the rows still being `available`, so
     * two concurrent payout requests cannot both take the same earnings:
     * the second claims zero rows and stops here. If the count does not
     * match what we intended to pay, something else moved underneath us
     * and we abort without calling Flutterwave at all.
     */
    const claim = await this.repo
      .createQueryBuilder()
      .update(DriverEarning)
      .set({ status: 'paying' })
      .where('id IN (:...ids)', { ids: toPayoutIds })
      .andWhere('status = :expected', { expected: 'available' })
      .execute();

    if ((claim.affected ?? 0) !== toPayoutIds.length) {
      // Put back whatever we did claim, then refuse. Better a failed
      // withdrawal the rider can retry than a partial one nobody can
      // reconstruct.
      await this.repo
        .createQueryBuilder()
        .update(DriverEarning)
        .set({ status: 'available' })
        .where('id IN (:...ids)', { ids: toPayoutIds })
        .andWhere('status = :paying', { paying: 'paying' })
        .execute()
        .catch(() => undefined);
      throw new BadRequestException(
        'Your earnings changed while this withdrawal was being prepared. Please try again.',
      );
    }

    let result: { success: boolean; transferId?: string };
    try {
      result = await this.flutterwave.transferToBank({
        amountNaira:   payoutAmount,
        bankCode:      driver.bankCode,
        accountNumber: driver.bankAccountNumber,
        accountName:   driver.bankAccountName,
        reference,
        narration:     `SEIRS payout for ${toPayoutIds.length} deliveries`,
      });
    } catch (e: any) {
      /**
       * A thrown transfer is ambiguous: the request may never have
       * reached Flutterwave, or it may have succeeded and the response
       * been lost. Releasing the claim here would risk paying twice, so
       * the rows stay `paying` and out of the withdrawable balance until
       * someone checks the reference against Flutterwave.
       */
      this.logger.error(
        `Payout ${reference} threw after claiming ${toPayoutIds.length} earning(s). ` +
        `Rows left in 'paying' pending manual reconciliation: ${e?.message}`,
      );
      throw new BadRequestException(
        'We could not confirm the transfer. Your earnings are safe and on hold while we check. ' +
        'Contact support if this is not resolved shortly.',
      );
    }

    if (!result.success) {
      // A clean "no" from Flutterwave: nothing left, so release the claim.
      await this.repo
        .createQueryBuilder()
        .update(DriverEarning)
        .set({ status: 'available' })
        .where('id IN (:...ids)', { ids: toPayoutIds })
        .execute()
        .catch(() => undefined);
      throw new BadRequestException('Flutterwave transfer failed');
    }

    // Confirm the claim.
    await this.repo
      .createQueryBuilder()
      .update(DriverEarning)
      .set({ status: 'paid', paidAt: new Date(), flutterwaveTransferId: result.transferId ?? null })
      .where('id IN (:...ids)', { ids: toPayoutIds })
      .execute();

    return { paidAmount: payoutAmount, feeNgn, transferId: result.transferId, payoutEarningIds: toPayoutIds };
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  /**
   * Driver earnings dashboard summary.
   */
  async getDashboard(driverId: string): Promise<{
    today:     { earned: number; deliveries: number };
    week:      { earned: number; deliveries: number };
    month:     { earned: number; deliveries: number };
    allTime:   { earned: number; deliveries: number };
    pending:   number;
    available: number;
    clearanceBusinessDays: number;
    nextPayoutEta: string;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [todayRows, weekRows, monthRows, allTimeRows, pendingRow, availableRow] = await Promise.all([
      this.sumByPeriod(driverId, todayStart),
      this.sumByPeriod(driverId, weekStart),
      this.sumByPeriod(driverId, monthStart),
      this.sumByPeriod(driverId, new Date(0)),
      this.sumByStatus(driverId, 'pending'),
      this.sumByStatus(driverId, 'available'),
    ]);

    return {
      today:     todayRows,
      week:      weekRows,
      month:     monthRows,
      allTime:   allTimeRows,
      pending:   pendingRow,
      available: availableRow,
      clearanceBusinessDays: await this.clearanceBusinessDays(),
      nextPayoutEta: 'Automatic payout daily at 2 PM (Lagos time)',
    };
  }

  async getHistory(driverId: string, limit = 50): Promise<DriverEarning[]> {
    return this.repo.find({
      where:    { driverId },
      order:    { createdAt: 'DESC' },
      take:     limit,
      relations: ['delivery'],
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async sumByPeriod(driverId: string, since: Date): Promise<{ earned: number; deliveries: number }> {
    const row = await this.repo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.driver_net), 0)', 'earned')
      .addSelect('COUNT(*)', 'deliveries')
      .where('e.driver_id = :driverId', { driverId })
      .andWhere('e.created_at >= :since', { since })
      .andWhere('e.status IN (:...statuses)', { statuses: ['available', 'paid'] })
      .getRawOne<{ earned: string; deliveries: string }>();
    return { earned: Number(row?.earned ?? 0), deliveries: Number(row?.deliveries ?? 0) };
  }


  private async sumByStatus(driverId: string, status: DriverEarningStatus): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.driver_net), 0)', 'sum')
      .where('e.driver_id = :driverId', { driverId })
      .andWhere('e.status = :status', { status })
      .getRawOne<{ sum: string }>();
    return Number(row?.sum ?? 0);
  }
}
