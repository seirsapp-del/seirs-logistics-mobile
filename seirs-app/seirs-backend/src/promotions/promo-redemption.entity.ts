import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, Index,
} from 'typeorm';
import { Promotion } from './promotion.entity';

// One row per (user, promo) so we can enforce per-user usage limits.
// Created during /promotions/redeem; the actual discount application
// to a delivery is the consumer's job (deliveries.service computes
// final price using the snapshot).
@Entity('promo_redemptions')
@Index(['userId', 'promotion'])
export class PromoRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => Promotion, p => p.redemptions, { onDelete: 'CASCADE' })
  promotion: Promotion;

  // Optional — when the redemption is bound to a specific delivery.
  @Column({ nullable: true })
  deliveryId: string;

  // Discount actually granted in kobo, for audit.
  @Column({ type: 'integer', default: 0 })
  discountAppliedKobo: number;

  @CreateDateColumn()
  createdAt: Date;
}
