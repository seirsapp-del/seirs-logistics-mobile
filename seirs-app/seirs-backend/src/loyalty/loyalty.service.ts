import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { LoyaltyPoint, LoyaltyReason } from './loyalty-point.entity';

/**
 * Loyalty Points service.
 *
 * Append-only ledger. Balance = sum of non-expired entries.
 * See docs/payments-spec.md §⑤ for earn rates, redemption costs, and tiers.
 */

const POINTS_PER_NAIRA       = 10 / 1000;   // 10 pts per ₦1,000
const BANK_TRANSFER_BONUS    = 5;
const REFERRAL_BONUS         = 200;
const RATE_DRIVER_BONUS      = 5;
const MONTHLY_STREAK_BONUS   = 50;
const MONTHLY_STREAK_TARGET  = 5;            // 5th delivery in a calendar month
const MAX_REFERRALS_PER_MONTH = 10;
const POINT_LIFETIME_MONTHS  = 24;

// Tier thresholds (rolling 12-month points).
export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';
const TIER_THRESHOLDS: Array<{ tier: Tier; min: number }> = [
  { tier: 'platinum', min: 15000 },
  { tier: 'gold',     min: 5000  },
  { tier: 'silver',   min: 1000  },
  { tier: 'bronze',   min: 0     },
];

const TIER_EARN_MULTIPLIER: Record<Tier, number> = {
  bronze: 1.0,
  silver: 1.25,
  gold:   1.5,
  platinum: 2.0,
};

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectRepository(LoyaltyPoint)
    private readonly repo: Repository<LoyaltyPoint>,
  ) {}

  // ── Earning ──────────────────────────────────────────────────────────────

  /**
   * Award points for completing a delivery. Applies tier multiplier.
   */
  async awardDeliveryPoints(params: {
    userId:     string;
    deliveryId: string;
    naira:      number;
    paidViaBankTransfer: boolean;
  }): Promise<LoyaltyPoint> {
    const tier = await this.getTier(params.userId);
    const multiplier = TIER_EARN_MULTIPLIER[tier];

    let pts = Math.max(1, Math.floor(params.naira * POINTS_PER_NAIRA * multiplier));
    if (params.paidViaBankTransfer) pts += BANK_TRANSFER_BONUS;

    return this.recordEntry({
      userId:            params.userId,
      delta:             pts,
      reason:            'delivery_complete',
      relatedDeliveryId: params.deliveryId,
    });
  }

  async awardReferralBonus(referrerUserId: string): Promise<LoyaltyPoint | null> {
    // Anti-abuse: cap referrals per calendar month.
    const since = startOfCalendarMonth();
    const count = await this.repo.count({
      where: { userId: referrerUserId, reason: 'referral_bonus', createdAt: MoreThan(since) as any },
    });
    if (count >= MAX_REFERRALS_PER_MONTH) return null;

    return this.recordEntry({
      userId: referrerUserId,
      delta:  REFERRAL_BONUS,
      reason: 'referral_bonus',
      note:   `Referral bonus #${count + 1} this month`,
    });
  }

  async awardRateDriver(userId: string, deliveryId: string): Promise<LoyaltyPoint> {
    return this.recordEntry({
      userId,
      delta:             RATE_DRIVER_BONUS,
      reason:            'rate_driver',
      relatedDeliveryId: deliveryId,
    });
  }

  async awardMonthlyStreak(userId: string): Promise<LoyaltyPoint | null> {
    const monthStart = startOfCalendarMonth();
    const completedThisMonth = await this.repo.count({
      where: { userId, reason: 'delivery_complete', createdAt: MoreThan(monthStart) as any },
    });
    if (completedThisMonth !== MONTHLY_STREAK_TARGET) return null;
    return this.recordEntry({
      userId,
      delta:  MONTHLY_STREAK_BONUS,
      reason: 'monthly_streak',
      note:   `Streak bonus for hitting ${MONTHLY_STREAK_TARGET} deliveries this month`,
    });
  }

  // ── Redemption ───────────────────────────────────────────────────────────

  async redeem(params: {
    userId: string;
    cost:   number;
    reason: Extract<LoyaltyReason, 'redeem_discount' | 'redeem_free_delivery' | 'redeem_priority' | 'redeem_insurance'>;
    deliveryId?: string;
  }): Promise<LoyaltyPoint> {
    const balance = await this.getBalance(params.userId);
    if (balance < params.cost) {
      throw new BadRequestException(`Insufficient points. Balance: ${balance}, required: ${params.cost}.`);
    }
    return this.recordEntry({
      userId:            params.userId,
      delta:             -params.cost,
      reason:            params.reason,
      relatedDeliveryId: params.deliveryId,
    });
  }

  /**
   * Reverse loyalty points awarded for a delivery that was later refunded.
   */
  async clawbackForDelivery(deliveryId: string): Promise<void> {
    const earned = await this.repo.find({
      where: { relatedDeliveryId: deliveryId, reason: 'delivery_complete' },
    });
    for (const e of earned) {
      await this.recordEntry({
        userId:            e.userId,
        delta:             -e.delta,
        reason:            'refund_clawback',
        relatedDeliveryId: deliveryId,
        note:              `Clawback of ${e.delta} pts (delivery ${deliveryId} refunded)`,
      });
    }
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  async getBalance(userId: string): Promise<number> {
    const { sum } = await this.repo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.delta), 0)', 'sum')
      .where('p.user_id = :userId', { userId })
      .andWhere('p.expires_at > NOW()')
      .getRawOne<{ sum: string }>() ?? { sum: '0' };
    return Number(sum);
  }

  async getTier(userId: string): Promise<Tier> {
    // Tier based on earned points in last 12 months (excludes redemptions).
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const { sum } = await this.repo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.delta), 0)', 'sum')
      .where('p.user_id = :userId', { userId })
      .andWhere('p.delta > 0')
      .andWhere('p.created_at > :oneYearAgo', { oneYearAgo })
      .getRawOne<{ sum: string }>() ?? { sum: '0' };

    const earned = Number(sum);
    return TIER_THRESHOLDS.find(t => earned >= t.min)?.tier ?? 'bronze';
  }

  async getHistory(userId: string, limit = 50): Promise<LoyaltyPoint[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take:  limit,
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async recordEntry(params: {
    userId:             string;
    delta:              number;
    reason:             LoyaltyReason;
    relatedDeliveryId?: string;
    note?:              string;
  }): Promise<LoyaltyPoint> {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + POINT_LIFETIME_MONTHS);

    const entry = this.repo.create({
      userId:            params.userId,
      delta:             params.delta,
      reason:            params.reason,
      relatedDeliveryId: params.relatedDeliveryId ?? null,
      expiresAt,
      note:              params.note ?? null,
    });
    return this.repo.save(entry);
  }
}

function startOfCalendarMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
