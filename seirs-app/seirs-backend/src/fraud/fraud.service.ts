import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FraudFlag, FraudFlagType, FraudFlagStatus } from './fraud-flag.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';

const CANCELLATION_THRESHOLD = 0.5;  // 50% cancellation rate triggers flag
const FAILED_PAYMENT_THRESHOLD = 5;  // 5+ failed payments triggers flag
const GPS_MAX_SPEED_KMH = 200;        // 200 km/h — impossible for ground delivery

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

  // ── GPS velocity anomaly check — called from tracking gateway ──────────────

  async checkGpsAnomaly(userId: string, prevLat: number, prevLng: number, newLat: number, newLng: number, elapsedSeconds: number) {
    const distKm = this.haversine(prevLat, prevLng, newLat, newLng);
    const speedKmh = (distKm / elapsedSeconds) * 3600;

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

  // ── Admin: list all open flags (paginated) ──────────────────────────────────

  async getFlags(page: number, limit: number, status?: string) {
    const qb = this.flagsRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.user', 'user')
      .orderBy('f.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.where('f.status = :status', { status });

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
