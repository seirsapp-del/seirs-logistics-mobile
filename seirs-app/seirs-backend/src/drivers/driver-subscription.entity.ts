import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Driver } from './driver.entity';

// Spec V8 §2.13 — Driver Premium (D35).
// Drivers opt into a weekly flat fee (fee catalogue key:
// driver_premium_subscription, ₦5,000/week at launch) in exchange for:
//   - Priority matching (+0.15 score boost — outranks rating gap)
//   - "Verified Pro" badge on customer-facing rating screen
//   - (Future) commission swap — keep 100% of fares
//
// Lifecycle:
//   active   → cron pulls fee from wallet weekly; failure on insufficient
//              balance flips to past_due after 1 retry, then paused
//              after 3 consecutive failures (emails driver to fund wallet)
//   paused   → benefits OFF, no charges, can re-activate any time
//   cancelled → terminal; create new row to re-subscribe

export enum DriverSubscriptionStatus {
  ACTIVE    = 'active',
  PAUSED    = 'paused',
  PAST_DUE  = 'past_due',
  CANCELLED = 'cancelled',
}

@Entity('driver_subscriptions')
@Index(['status', 'nextInvoiceAt'])
export class DriverSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Driver, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn()
  driver: Driver;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  driverId: string;

  @Column({ type: 'enum', enum: DriverSubscriptionStatus, default: DriverSubscriptionStatus.ACTIVE })
  status: DriverSubscriptionStatus;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  // Set when status flipped to PAUSED or CANCELLED.
  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  // Snapshot of what was charged last invoice (in kobo). Live current
  // price comes from FeesService; this is what actually billed.
  @Column({ type: 'integer', default: 0 })
  lastInvoicedFeeKobo: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastInvoicedAt: Date | null;

  // Weekly cron picks rows whose nextInvoiceAt <= now AND status=ACTIVE.
  // Set to startedAt + 7 days on activate.
  @Column({ type: 'timestamptz' })
  nextInvoiceAt: Date;

  // Total successful weekly charges so far.
  @Column({ default: 0 })
  invoiceCount: number;

  // After 3 consecutive failures the cron flips to PAUSED + emails.
  @Column({ default: 0 })
  consecutiveFailures: number;

  @Column({ type: 'text', nullable: true })
  lastFailureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
