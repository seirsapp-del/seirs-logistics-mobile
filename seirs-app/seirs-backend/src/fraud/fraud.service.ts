import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FraudFlag, FraudFlagType, FraudFlagStatus } from './fraud-flag.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';

const CANCELLATION_THRESHOLD = 0.5;  // 50% cancellation rate triggers flag
const FAILED_PAYMENT_THRESHOLD = 5;  // 5+ failed payments triggers flag
const GPS_MAX_SPEED_KMH = 200;        // 200 km/h - impossible for ground delivery

/**
 * Noise floors, without which this detector flags GPS jitter as fraud.
 *
 * Speed is distance over elapsed time, and both inputs come from a phone
 * doing its best. Divide a few metres of receiver wobble by a few
 * milliseconds and you get a number in the thousands, every time, from a
 * device that never moved.
 *
 * Both live flags in production on 2026-08-28 were this:
 *
 *   0.006 km in 0.052 s  ->  "412 km/h".  Six metres in a twentieth of
 *   a second. Consumer GPS is accurate to roughly 5 to 20 metres on a
 *   good day, so that is a stationary phone.
 *
 *   Lagos to Berlin in 30 minutes  ->  "10,450 km/h". Real movement, but
 *   between countries: a founder testing abroad, not a courier.
 *
 * A queue whose every entry is noise is a queue nobody opens, and the
 * cost of that is missing the real one. So: ignore samples too close
 * together in time to be meaningful, and movements too small to be
 * distinguishable from receiver error.
 *
 * Deliberately NOT admin-tunable yet. These belong in the Fee Catalogue
 * by the standing rule, but FraudService would have to take FeesService,
 * and this codebase has already hit one circular-import boot crash
 * between MatchingService and FeesModule. Worth doing carefully rather
 * than three days before a pitch.
 */
const GPS_MIN_ELAPSED_SECONDS = 10;   // below this, jitter dominates the ratio
const GPS_MIN_DISTANCE_KM     = 0.05; // 50 m, comfortably outside receiver error

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(
    @InjectRepository(FraudFlag)  private flagsRepo:      Repository<FraudFlag>,
    @InjectRepository(Delivery)   private deliveriesRepo: Repository<Delivery>,
    @InjectRepository(User)       private usersRepo:      Repository<User>,
  ) {}

  // ── Run all checks for a specific user ─────────────────────────────────────

  async runChecksForUser(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) return;

    await Promise.all([
      this.checkCancellationRate(user),
    ]);
  }

  // ── Check driver/customer cancellation rate ─────────────────────────────────

  async checkCancellationRate(user: User) {
    const [total, cancelled] = await Promise.all([
      this.deliveriesRepo.count({ where: { customer: { id: user.id } } }),
      this.deliveriesRepo.count({ where: { customer: { id: user.id }, status: DeliveryStatus.CANCELLED } }),
    ]);

    if (total < 5) return; // not enough data
    const rate = cancelled / total;

    if (rate >= CANCELLATION_THRESHOLD) {
      await this.createFlagIfNew(user, FraudFlagType.HIGH_CANCELLATION_RATE, {
        totalDeliveries: total,
        cancelledCount:  cancelled,
        cancellationRate: `${(rate * 100).toFixed(1)}%`,
      });
    }
  }

  // ── GPS velocity anomaly check - called from tracking gateway ──────────────

  async checkGpsAnomaly(userId: string, prevLat: number, prevLng: number, newLat: number, newLng: number, elapsedSeconds: number) {
    /**
     * Guard the inputs before dividing by them.
     *
     * elapsedSeconds arrives from a subtraction of two timestamps, so it
     * can be zero or negative on a retry, a clock adjustment or two
     * pings processed out of order. Zero makes the speed Infinity, which
     * is greater than any threshold, so the flag was one bad sample
     * away at all times.
     */
    const elapsed = Number(elapsedSeconds);
    const distKm  = this.haversine(prevLat, prevLng, newLat, newLng);

    if (!Number.isFinite(elapsed) || elapsed < GPS_MIN_ELAPSED_SECONDS) return;
    if (!Number.isFinite(distKm)  || distKm  < GPS_MIN_DISTANCE_KM)     return;

    const speedKmh = (distKm / elapsed) * 3600;

    if (speedKmh > GPS_MAX_SPEED_KMH) {
      const user = await this.usersRepo.findOne({ where: { id: userId } });
      if (!user) return;

      await this.createFlagIfNew(user, FraudFlagType.GPS_VELOCITY_ANOMALY, {
        distanceKm:  distKm.toFixed(3),
        speedKmh:    speedKmh.toFixed(1),
        from:        { lat: prevLat, lng: prevLng },
        to:          { lat: newLat,  lng: newLng  },
        elapsedSecs: elapsedSeconds,
      });
    }
  }

  // ── Suspicious withdrawal check ────────────────────────────────────────────

  async checkWithdrawal(userId: string, amountKobo: number) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) return;

    if (amountKobo > 5_000_000) { // > ₦50,000 in a single withdrawal
      await this.createFlagIfNew(user, FraudFlagType.SUSPICIOUS_WITHDRAWAL, {
        amountNaira: amountKobo / 100,
      });
    }
  }

  // ── Vehicle churn ──────────────────────────────────────────────────

  /**
   * A rider changing vehicle again and again.
   *
   * FLAGS, NEVER BLOCKS, and that is the whole design. A rider whose okada
   * is stolen twice in a quarter and a rider laundering plates produce the
   * identical count, and only a person can tell them apart. Blocking the
   * first one costs us a courier who has already had a terrible month.
   *
   * The submit path enforces a cooldown separately; this is the pattern
   * that survives the cooldown, which is the interesting case.
   */
  async checkVehicleChurn(userId: string, changesInWindow: number, windowDays: number) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) return;

    if (changesInWindow >= 3) {
      await this.createFlagIfNew(user, FraudFlagType.VEHICLE_CHURN, {
        changesInWindow,
        windowDays,
        note: 'Approved vehicle changes in the window. Not evidence of anything on its own: check whether the plates trace to one owner.',
      });
    }
  }

  // ── Admin: list all open flags (paginated) ──────────────────────────────────

  /**
   * from and to are YYYY-MM-DD, and both are optional.
   *
   * Keyed on f.createdAt, which is the column this list is ORDERED by. A
   * window on one column while the list is sorted by another gives paging
   * that jumps about, because rows arrive in an order the filter has no
   * relationship to.
   *
   * `to` covers the WHOLE of its day. A range ending on the 5th that stops at
   * midnight silently drops everything raised on the 5th, and the result
   * still looks like a plausible list, which is exactly why nobody notices.
   */
  async getFlags(
    page: number,
    limit: number,
    status?: string,
    from?: string,
    to?: string,
  ) {
    /**
     * Narrow select (2026-08-28). leftJoinAndSelect returned the flagged
     * user's whole record, so the fraud queue was serving bank account
     * name, number and code, date of birth, home address, next of kin
     * and device hashes for every flag on the page.
     *
     * Tempting to argue a fraud desk wants exactly those. It does not
     * get them this way: the page renders the flag type, its details
     * and the user's name and email, and nothing else. A signal that
     * two accounts share a bank account is a comparison the DETECTOR
     * should make and state in the flag's details, not twenty raw bank
     * records shipped to a browser in the hope somebody notices.
     */
    const qb = this.flagsRepo
      .createQueryBuilder('f')
      .leftJoin('f.user', 'user')
      .addSelect([
        'user.id', 'user.name', 'user.email', 'user.phone',
        'user.accountId', 'user.role', 'user.isActive', 'user.createdAt',
      ])
      .orderBy('f.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.where('f.status = :status', { status });

    // An unparseable date is IGNORED rather than rejected: a filter that 500s
    // on a typo is worse than one that shows too much.
    const day = (v?: string) => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const fromAt = day(from);
    const toAt   = day(to);
    if (fromAt) qb.andWhere('f."createdAt" >= :fraudFrom', { fraudFrom: fromAt });
    if (toAt) {
      // Whole of the closing day, not up to its midnight.
      const end = new Date(toAt.getTime() + 24 * 60 * 60 * 1000);
      qb.andWhere('f."createdAt" < :fraudTo', { fraudTo: end });
    }

    const [flags, total] = await qb.getManyAndCount();
    return { flags, total, page, limit };
  }

  async resolveFlag(flagId: string, adminId: string, newStatus: FraudFlagStatus) {
    await this.flagsRepo.update(flagId, { status: newStatus, resolvedBy: adminId });
    return this.flagsRepo.findOne({ where: { id: flagId } });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async createFlagIfNew(user: User, type: FraudFlagType, details: Record<string, any>) {
    const existing = await this.flagsRepo.findOne({
      where: { user: { id: user.id }, type, status: FraudFlagStatus.OPEN },
    });

    if (existing) return; // already flagged and open

    const flag = this.flagsRepo.create({ user, type, details });
    await this.flagsRepo.save(flag);
    this.logger.warn(`Fraud flag raised: ${type} for user ${user.email}`);
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
