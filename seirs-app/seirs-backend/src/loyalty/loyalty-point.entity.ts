import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, Index,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Loyalty points ledger.
 *
 * McDonald's-style: customers earn points for usage, redeem for SEIRS
 * service discounts. Points have NO Naira face value — they are NOT
 * money, NOT transferable, NOT withdrawable. This positioning keeps
 * SEIRS out of CBN e-money regulation.
 *
 * Append-only ledger:
 *   delta > 0  → earned (e.g. completing a delivery)
 *   delta < 0  → redeemed (e.g. ₦500 off coupon)
 *
 * Balance = SUM(delta) WHERE expiresAt > NOW()
 *
 * Points expire after 24 months of inactivity (any earn or redeem resets
 * the clock — see loyalty.service.ts for renewal logic).
 *
 * See docs/payments-spec.md §⑤.
 */
export type LoyaltyReason =
  | 'delivery_complete'
  | 'bank_transfer_bonus'
  | 'referral_bonus'
  | 'rate_driver'
  | 'monthly_streak'
  | 'redeem_discount'
  | 'redeem_free_delivery'
  | 'redeem_priority'
  | 'redeem_insurance'
  | 'admin_adjustment'
  | 'refund_clawback'
  | 'expired';

@Entity('loyalty_points')
export class LoyaltyPoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  // Positive = earn, negative = redeem. Integer points (no fractional pts).
  @Column({ type: 'int' })
  delta!: number;

  @Column({ type: 'varchar', length: 40 })
  reason!: LoyaltyReason;

  // Optional link to the delivery that triggered this entry.
  @Index()
  @Column({ name: 'related_delivery_id', type: 'uuid', nullable: true })
  relatedDeliveryId!: string | null;

  // When this entry's points expire. Default = createdAt + 24 months.
  // Resets on any subsequent earn/redeem activity (handled in service).
  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  // Free-text note (admin adjustments, refund clawbacks, etc.).
  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
