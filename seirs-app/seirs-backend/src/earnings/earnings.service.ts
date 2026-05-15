import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import { DriverEarning, DriverEarningStatus } from './driver-earning.entity';
import { FlutterwaveService } from '../payments/flutterwave.service';
import { User } from '../users/user.entity';

/**
 * Driver Earnings service.
 *
 * Owns the lifecycle of driver earnings entries:
 *   pending  → available  (cron: dispute window expired)
 *   available → paid      (cron: payout via Flutterwave Transfer)
 *
 * SEIRS does NOT hold this money — it sits in the SEIRS company bank
 * account; we just track liability + initiate transfers.
 *
 * See docs/payments-spec.md §⑥.
 */

const DEFAULT_DISPUTE_WINDOW_HOURS = 24;
const DEFAULT_DRIVER_SHARE         = 0.75;
const MIN_PAYOUT_NAIRA             = 1000;
const MAX_DAILY_PAYOUT_NEW_DRIVER  = 50_000;
const MAX_DAILY_PAYOUT_ESTABLISHED = 200_000;
const NEW_DRIVER_HOLDBACK_DAYS     = 30;
const NEW_DRIVER_HOLDBACK_PERCENT  = 0.10;

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(
    @InjectRepository(DriverEarning)
    private readonly repo: Repository<DriverEarning>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly flutterwave: FlutterwaveService,
  ) {}

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
    const cutPct = params.seirsCutPercent ?? (1 - DEFAULT_DRIVER_SHARE);
    const grossAmount = params.grossNaira;
    const seirsCut    = +(grossAmount * cutPct).toFixed(2);
    const driverNet   = +(grossAmount - seirsCut).toFixed(2);

    const availableAt = new Date(Date.now() + DEFAULT_DISPUTE_WINDOW_HOURS * 3600 * 1000);

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
      .having('SUM(e.driver_net) >= :min', { min: MIN_PAYOUT_NAIRA })
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
   */
  async payoutDriver(driverId: string): Promise<{ paidAmount: number; transferId?: string; payoutEarningIds: string[] }> {
    const driver = await this.userRepo.findOneBy({ id: driverId });
    if (!driver) throw new NotFoundException('Driver not found');
    if (!driver.bankCode || !driver.bankAccountNumber || !driver.bankAccountName) {
      throw new BadRequestException('Driver bank account not configured');
    }

    // Apply new-driver cap.
    const driverAgeDays = Math.floor((Date.now() - new Date(driver.createdAt).getTime()) / (24 * 3600 * 1000));
    const dailyCap = driverAgeDays < NEW_DRIVER_HOLDBACK_DAYS
      ? MAX_DAILY_PAYOUT_NEW_DRIVER
      : MAX_DAILY_PAYOUT_ESTABLISHED;

    const available = await this.repo.find({
      where: { driverId, status: 'available' },
      order: { availableAt: 'ASC' },
    });

    let runningTotal = 0;
    const toPayoutIds: string[] = [];
    for (const e of available) {
      const next = runningTotal + Number(e.driverNet);
      if (next > dailyCap) break;  // stop at cap
      toPayoutIds.push(e.id);
      runningTotal = next;
    }

    if (runningTotal < MIN_PAYOUT_NAIRA) {
      throw new BadRequestException(`Available payout ₦${runningTotal} is below minimum ₦${MIN_PAYOUT_NAIRA}`);
    }

    // Apply new-driver 10% holdback (kept as available for next round).
    let payoutAmount = runningTotal;
    if (driverAgeDays < NEW_DRIVER_HOLDBACK_DAYS) {
      payoutAmount = +(runningTotal * (1 - NEW_DRIVER_HOLDBACK_PERCENT)).toFixed(2);
    }

    const reference = `seirs_payout_${driverId}_${Date.now()}`;
    const result = await this.flutterwave.transferToBank({
      amountNaira:   payoutAmount,
      bankCode:      driver.bankCode,
      accountNumber: driver.bankAccountNumber,
      accountName:   driver.bankAccountName,
      reference,
      narration:     `SEIRS payout for ${toPayoutIds.length} deliveries`,
    });

    if (!result.success) {
      throw new BadRequestException('Flutterwave transfer failed');
    }

    // Mark earnings as paid.
    await this.repo
      .createQueryBuilder()
      .update(DriverEarning)
      .set({ status: 'paid', paidAt: new Date(), flutterwaveTransferId: result.transferId ?? null })
      .where('id IN (:...ids)', { ids: toPayoutIds })
      .execute();

    return { paidAmount: payoutAmount, transferId: result.transferId, payoutEarningIds: toPayoutIds };
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  /**
   * Driver earnings dashboard summary.
   */
  async getDashboard(driverId: string): Promise<{
    today:     { earned: number; deliveries: number };
    week:      { earned: number; deliveries: number };
    allTime:   { earned: number; deliveries: number };
    pending:   number;
    available: number;
    nextPayoutEta: string;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

    const [todayRows, weekRows, allTimeRows, pendingRow, availableRow] = await Promise.all([
      this.sumByPeriod(driverId, todayStart),
      this.sumByPeriod(driverId, weekStart),
      this.sumByPeriod(driverId, new Date(0)),
      this.sumByStatus(driverId, 'pending'),
      this.sumByStatus(driverId, 'available'),
    ]);

    return {
      today:     todayRows,
      week:      weekRows,
      allTime:   allTimeRows,
      pending:   pendingRow,
      available: availableRow,
      nextPayoutEta: 'Daily at 2 PM Africa/Lagos',
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
