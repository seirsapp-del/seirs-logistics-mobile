import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToMany, Index,
} from 'typeorm';
import { PromoRedemption } from './promo-redemption.entity';

export enum PromoType {
  FLAT_DISCOUNT = 'flat_discount', // ₦ off
  PERCENT       = 'percent',       // % off
  FREE_DELIVERY = 'free_delivery', // 100% off delivery
}

export enum PromoStatus {
  ACTIVE    = 'active',
  SCHEDULED = 'scheduled',
  EXPIRED   = 'expired',
  PAUSED    = 'paused',
}

// Spec V8 §3.13 + customer §1.13 — promo code redemption store.
@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Customer-visible code, uppercased + unique (WELCOME50, FREESHIP).
  @Index({ unique: true })
  @Column()
  code: string;

  @Column({ type: 'enum', enum: PromoType })
  type: PromoType;

  // Interpretation depends on type:
  //   FLAT_DISCOUNT  → naira amount  (e.g. 500 = ₦500 off)
  //   PERCENT        → 0-100         (e.g. 20  = 20% off, capped by maxDiscountKobo)
  //   FREE_DELIVERY  → ignored (always 100%)
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value: number;

  // Optional cap for % discounts so a 50% promo on a ₦40k delivery
  // doesn't haemorrhage margin. Null = no cap.
  @Column({ type: 'integer', nullable: true })
  maxDiscountKobo: number | null;

  // Optional floor — promo only applies if subtotal >= this kobo amount.
  @Column({ type: 'integer', default: 0 })
  minSubtotalKobo: number;

  @Column({ type: 'timestamptz' })
  validFrom: Date;

  @Column({ type: 'timestamptz' })
  validTo: Date;

  // Platform-wide usage cap (0 = unlimited).
  @Column({ default: 0 })
  usageLimit: number;

  @Column({ default: 0 })
  usageCount: number;

  // Per-user usage cap (0 = unlimited per user).
  @Column({ default: 1 })
  perUserLimit: number;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: PromoStatus, default: PromoStatus.SCHEDULED })
  status: PromoStatus;

  @Column({ nullable: true })
  createdByUserId: string;

  @OneToMany(() => PromoRedemption, r => r.promotion)
  redemptions: PromoRedemption[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
