import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { LoyaltyPoint, LoyaltyReason } from './loyalty-point.entity';
import { User } from '../users/user.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { MailService } from '../mail/mail.service';

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

// Referral anti-fraud gates (Spec V8. bootstrapped platform, sybil attack
// would be existential). All must pass before a referral bonus is paid out:
const REFERRAL_MIN_DELIVERY_NAIRA = 1000;    // referred user must complete a real ₦1000+ delivery first
const REFERRAL_FLAG_THRESHOLD     = 5;       // flag for admin review if referrer hits this many in 7 days
const REFERRAL_FLAG_WINDOW_MS     = 7 * 24 * 60 * 60 * 1000;

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
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    @InjectRepository(LoyaltyPoint)
    private readonly repo: Repository<LoyaltyPoint>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Delivery)
    private readonly deliveriesRepo: Repository<Delivery>,
    private readonly mailService: MailService,
  ) {}

  // ── Tier-drop warning cron ────────────────────────────────────────────────
  // Runs daily at 6 AM. Finds users whose next-30-days point expirations
  // would drop them to a lower tier and emails a warning. Only sends one
  // warning per user per 30-day window (deduped via the note field).
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async warnTierDrops() {
    const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Users with any positive points entry that expires in next 30 days.
    // We only care about users whose tier is at risk, so we join back to
    // sum the balance minus what's about to expire.
    const rows = await this.repo
      .createQueryBuilder('lp')
      .select('lp.userId', 'userId')
      .addSelect('SUM(CASE WHEN lp.expiresAt <= :in30 AND lp.delta > 0 THEN lp.delta ELSE 0 END)', 'expiring')
      .addSelect('SUM(lp.delta)', 'currentBalance')
      .where('lp.userId IS NOT NULL')
      .groupBy('lp.userId')
      .having('SUM(CASE WHEN lp.expiresAt <= :in30 AND lp.delta > 0 THEN lp.delta ELSE 0 END) > 0', { in30 })
      .setParameter('in30', in30)
      .getRawMany()
      .catch(() => [] as any[]);

    if (rows.length === 0) {
      this.logger.debug('Tier-drop cron: no expiring points');
      return;
    }

    let warned = 0;
    for (const r of rows) {
      try {
        const userId  = r.userId as string;
        const current = Number(r.currentBalance ?? 0);
        const expiring = Number(r.expiring ?? 0);
        const projected = current - expiring;

        const currentTier   = this.tierForPoints(current);
        const projectedTier = this.tierForPoints(projected);
        if (currentTier === projectedTier) continue;

        // Dedupe: skip if we already warned this user in the last 30 days
        const alreadyWarned = await this.repo.count({
          where: {
            userId,
            reason: 'tier_warning' as any,
            createdAt: MoreThan(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) as any,
          },
        }).catch(() => 0);
        if (alreadyWarned > 0) continue;

        const user = await this.usersRepo.findOne({ where: { id: userId } });
        if (!user?.email) continue;

        await this.mailService.sendGeneric?.(user.email, user.name, 'Your SEIRS tier is about to drop', `
          Hi ${user.name},

          Some of your loyalty points expire in the next 30 days. If you don't earn ${expiring - (current - this.tierThreshold(currentTier)) + 1} more points before then, your tier will drop from ${currentTier} to ${projectedTier}.

          Points expiring: ${expiring.toLocaleString()}
          Current balance: ${current.toLocaleString()}
          Projected after expiry: ${projected.toLocaleString()}

          Book a delivery to keep your ${currentTier} tier and the earning multiplier that comes with it.

          -- SEIRS
        `).catch(() => {});

        // Record a zero-delta ledger entry marking the warning so we don't
        // send it again this cycle. Note field carries the projection.
        await this.repo.save(this.repo.create({
          userId,
          delta:     0,
          reason:    'tier_warning' as any,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          note:      `warn:${currentTier}->${projectedTier};expiring:${expiring}`,
        })).catch(() => {});

        warned++;
      } catch (e: any) {
        this.logger.warn(`Tier-drop warn failed for ${r.userId}: ${e?.message ?? e}`);
      }
    }
    this.logger.log(`Tier-drop cron: warned ${warned} of ${rows.length} candidates`);
  }

  private tierForPoints(pts: number): Tier {
    return TIER_THRESHOLDS.find(t => pts >= t.min)?.tier ?? 'bronze';
  }

  private tierThreshold(tier: Tier): number {
    return TIER_THRESHOLDS.find(t => t.tier === tier)?.min ?? 0;
  }

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

  /**
   * @deprecated Use `awardReferralBonusIfEligible` for safe payouts.
   * This bare method only checks the per-month cap and is vulnerable to
   * sybil attacks (self-referral, disposable-email farming). Kept for
   * backwards-compat with any legacy callers.
   */
  async awardReferralBonus(referrerUserId: string): Promise<LoyaltyPoint | null> {
    const since = startOfCalendarMonth();
    const count = await this.repo.count({
      where: { userId: referrerUserId, reason: 'referral_bonus', createdAt: MoreThan(since) as any },
    });
    if (count >= MAX_REFERRALS_PER_MONTH) return null;

    return this.recordEntry({
      userId: referrerUserId,
      delta:  REFERRAL_BONUS,
      reason: 'referral_bonus',
      note:   `Referral bonus #${count + 1} this month (LEGACY. no sybil checks)`,
    });
  }

  /**
   * Award the referrer bonus for a successful referral, with full sybil
   * defence. Call this from the delivery-completion webhook once the
   * referred user completes their first qualifying delivery. NOT at
   * signup time (that's when abuse patterns cash out fastest).
   *
   * Gate stack (all must pass):
   *   1. Per-month cap (10 payouts / referrer / month)
   *   2. Not a self-referral (referrer !== referred)
   *   3. Referred user has completed at least one delivery worth ≥ ₦1000
   *   4. This referred user has not already earned bonus for this referrer
   *      (idempotent. safe to call multiple times)
   *   5. Referrer + referred don't share the same email domain when it's a
   *      disposable one (bare check. sophisticated attackers rotate domains
   *      but this catches the low-effort ones)
   *
   * NOT covered yet. pending Batch 4 continuation:
   *   • Device fingerprint match (needs DeviceRegistration entity)
   *   • IP address dedupe within 30 days (needs IP capture at signup)
   *   • Payment card / bank account match (needs cross-user card fingerprint)
   *
   * Returns null when a gate blocks the payout. Logs the reason so ops
   * can audit "why didn't Adebayo get his bonus?"
   */
  async awardReferralBonusIfEligible(params: {
    referrerUserId: string;
    referredUserId: string;
    triggerDeliveryId?: string;
  }): Promise<{ awarded: LoyaltyPoint | null; reason: string; flaggedForReview: boolean }> {
    const { referrerUserId, referredUserId, triggerDeliveryId } = params;

    // Gate 1: self-referral
    if (referrerUserId === referredUserId) {
      this.logger.warn(`Referral blocked: self-referral attempt by user ${referrerUserId}`);
      return { awarded: null, reason: 'self_referral', flaggedForReview: true };
    }

    // Gate 2: users exist
    const [referrer, referred] = await Promise.all([
      this.usersRepo.findOne({ where: { id: referrerUserId } }),
      this.usersRepo.findOne({ where: { id: referredUserId } }),
    ]);
    if (!referrer || !referred) {
      return { awarded: null, reason: 'user_not_found', flaggedForReview: false };
    }

    // Gate 3: same email domain when domain is a known-disposable one.
    // (Full disposable-email list is a moving target. this catches the
    // trivial "same-domain sybil" pattern and defers the deeper check.)
    const rDomain = referrer.email.split('@')[1]?.toLowerCase();
    const eDomain = referred.email.split('@')[1]?.toLowerCase();
    const DISPOSABLE = new Set([
      'mailinator.com','tempmail.com','10minutemail.com','guerrillamail.com',
      'yopmail.com','trashmail.com','maildrop.cc','sharklasers.com',
    ]);
    if (rDomain && rDomain === eDomain && DISPOSABLE.has(rDomain)) {
      this.logger.warn(`Referral blocked: same disposable email domain (${rDomain})`);
      return { awarded: null, reason: 'disposable_domain_match', flaggedForReview: true };
    }

    // Gate 4: dedupe. has this referred user already generated a payout
    // for this referrer? If yes, no-op (idempotent).
    const already = await this.repo.findOne({
      where: {
        userId:            referrerUserId,
        reason:            'referral_bonus',
        // We stuff the referred user id into `note` for lookup.
        // relatedDeliveryId is reserved for the delivery reason.
      },
    });
    // Cheap prefix match on the note pattern below
    const priorNotes = await this.repo.find({
      where: { userId: referrerUserId, reason: 'referral_bonus' },
      select: ['note'],
    });
    if (priorNotes.some(p => p.note?.includes(`referred:${referredUserId}`))) {
      return { awarded: null, reason: 'already_paid_for_this_referral', flaggedForReview: false };
    }

    // Gate 5: referred user has completed a qualifying delivery.
    // We look for at least one DELIVERED delivery where price ≥ threshold.
    const qualifyingCount = await this.deliveriesRepo
      .createQueryBuilder('d')
      .where('d.customerId = :uid', { uid: referredUserId })
      .andWhere('d.status = :st', { st: DeliveryStatus.DELIVERED })
      .andWhere('d.price >= :min', { min: REFERRAL_MIN_DELIVERY_NAIRA })
      .getCount()
      .catch(() => 0);
    if (qualifyingCount === 0) {
      return { awarded: null, reason: 'no_qualifying_delivery_yet', flaggedForReview: false };
    }

    // Gate 6: per-month cap
    const monthStart = startOfCalendarMonth();
    const monthCount = await this.repo.count({
      where: {
        userId:    referrerUserId,
        reason:    'referral_bonus',
        createdAt: MoreThan(monthStart) as any,
      },
    });
    if (monthCount >= MAX_REFERRALS_PER_MONTH) {
      return { awarded: null, reason: 'monthly_cap_reached', flaggedForReview: false };
    }

    // Gate 7: high-velocity flag. if this referrer has earned >N referral
    // bonuses in the last 7 days, still award but flag for admin review.
    const weekCutoff = new Date(Date.now() - REFERRAL_FLAG_WINDOW_MS);
    const weekCount = await this.repo.count({
      where: {
        userId:    referrerUserId,
        reason:    'referral_bonus',
        createdAt: MoreThan(weekCutoff) as any,
      },
    });
    const flagged = weekCount >= REFERRAL_FLAG_THRESHOLD;

    const awarded = await this.recordEntry({
      userId:            referrerUserId,
      delta:             REFERRAL_BONUS,
      reason:            'referral_bonus',
      relatedDeliveryId: triggerDeliveryId ?? null,
      note:              `Referral bonus #${monthCount + 1} this month; referred:${referredUserId}${flagged ? ' [FLAG:high_velocity]' : ''}`,
    });

    if (flagged) {
      this.logger.warn(
        `Referrer ${referrerUserId} awarded bonus #${weekCount + 1} in 7 days. flagged for admin review`,
      );
      // TODO: emit event to /admin/fraud queue for manual review.
    }

    return { awarded, reason: 'ok', flaggedForReview: flagged };
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
    // Deliberate: deliveryId is REQUIRED. A redemption without a delivery
    // to apply to would just deduct points with no user-visible benefit —
    // that was the original silent-loss bug. Callers must scope the
    // redemption to a specific booking.
    if (!params.deliveryId) {
      throw new BadRequestException('Redemption requires a delivery. Book a delivery first, then apply the reward.');
    }

    // Validate the delivery: belongs to user, in a state where redemption
    // is still meaningful (before the driver has picked up). After pickup
    // the customer has already committed to the transaction.
    const delivery = await this.deliveriesRepo.findOne({
      where: { id: params.deliveryId },
      relations: ['customer'],
    });
    if (!delivery) throw new BadRequestException('Delivery not found.');
    if (delivery.customer?.id !== params.userId) {
      throw new BadRequestException('That delivery belongs to another account.');
    }
    if (![DeliveryStatus.PENDING, DeliveryStatus.ASSIGNED].includes(delivery.status)) {
      throw new BadRequestException(`Rewards can only be applied to pending or assigned deliveries. This one is ${delivery.status}.`);
    }

    // Idempotency: no double-application of the same reward type to one
    // delivery. Cheap query on the ledger.
    const existing = await this.repo.findOne({
      where: {
        userId:            params.userId,
        reason:            params.reason,
        relatedDeliveryId: params.deliveryId,
      },
    });
    if (existing) {
      throw new BadRequestException('This reward is already applied to this delivery.');
    }

    const balance = await this.getBalance(params.userId);
    if (balance < params.cost) {
      throw new BadRequestException(`Insufficient points. Balance: ${balance}, required: ${params.cost}.`);
    }

    // Apply the reward to the delivery. Currently only the two NGN-value
    // redemptions mutate price; priority + insurance are recorded on the
    // ledger but need dispatcher + insurance-partner wiring to actually
    // deliver value. Kept as recorded intents until that ships.
    let newPrice = Number(delivery.price);
    if (params.reason === 'redeem_discount') {
      newPrice = Math.max(0, newPrice - 500);
    } else if (params.reason === 'redeem_free_delivery') {
      newPrice = 0;
    }
    if (newPrice !== Number(delivery.price)) {
      await this.deliveriesRepo.update(delivery.id, { price: newPrice });
    }

    return this.recordEntry({
      userId:            params.userId,
      delta:             -params.cost,
      reason:            params.reason,
      relatedDeliveryId: params.deliveryId,
      note:              `Applied to delivery ${delivery.trackingCode}. price ${delivery.price} -> ${newPrice}`,
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

  /**
   * Return the current user's referral history: each person they referred
   * (matched by our accountId in the referredByCode column) plus whether
   * a referral bonus has actually been paid to us for them (checked via
   * the LoyaltyPoint note field which stores `referred:<userId>`).
   */
  async getMyReferrals(userId: string): Promise<Array<{
    id: string;
    name: string;
    accountId: string | null;
    joinedAt: Date;
    bonusPaid: boolean;
    bonusPoints: number | null;
    paidAt: Date | null;
  }>> {
    const me = await this.usersRepo.findOne({ where: { id: userId } });
    if (!me?.accountId) return [];

    const [referred, myBonuses] = await Promise.all([
      this.usersRepo.find({
        where: { referredByCode: me.accountId },
        select: ['id', 'name', 'accountId', 'createdAt'],
        order: { createdAt: 'DESC' },
        take: 50,
      }),
      this.repo.find({
        where: { userId, reason: 'referral_bonus' },
        select: ['delta', 'note', 'createdAt'],
      }),
    ]);

    const byReferredId = new Map<string, { delta: number; createdAt: Date }>();
    for (const b of myBonuses) {
      const match = b.note?.match(/referred:([a-f0-9-]+)/i);
      if (match) byReferredId.set(match[1], { delta: b.delta, createdAt: b.createdAt });
    }

    return referred.map((r) => {
      const bonus = byReferredId.get(r.id);
      return {
        id:          r.id,
        name:        r.name ?? '(no name)',
        accountId:   r.accountId ?? null,
        joinedAt:    r.createdAt,
        bonusPaid:   !!bonus,
        bonusPoints: bonus?.delta ?? null,
        paidAt:      bonus?.createdAt ?? null,
      };
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
