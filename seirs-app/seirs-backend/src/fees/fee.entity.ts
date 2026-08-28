import { Entity, PrimaryColumn, Column, UpdateDateColumn, Index } from 'typeorm';

// How the value is interpreted by clients. Drives admin UI rendering too
// (NGN flat → "₦100", PERCENT → "30%", PER_KM → "₦80/km", PER_DAY → "₦200/day").
export enum FeeUnit {
  FLAT_NGN = 'flat_ngn',
  PERCENT  = 'percent',
  PER_KM   = 'per_km',
  PER_DAY  = 'per_day',
  PER_WEEK = 'per_week',
  PER_MONTH = 'per_month',
  // Not every policy dial is money. Eleven rows used to store a
  // duration or a count as FLAT_NGN, so the catalogue showed a 7 day
  // abandonment threshold and a 168 hour payout hold as naira amounts.
  MINUTES  = 'minutes',
  HOURS    = 'hours',
  DAYS     = 'days',
  COUNT    = 'count',
  // An hour on the 24h clock (Africa/Lagos), not a duration.
  HOUR_OF_DAY = 'hour_of_day',
}

// Logical grouping for the admin Fee Catalogue UI tabs/filters.
export enum FeeCategory {
  COMMISSION    = 'commission',
  CUSTOMER_FEE  = 'customer_fee',
  DRIVER_FEE    = 'driver_fee',
  STORAGE       = 'storage',
  SURGE         = 'surge',
  SUBSCRIPTION  = 'subscription',
  PARTNER       = 'partner',
  ZONE          = 'zone',
  POOL          = 'pool',
  FINANCIAL     = 'financial',
  DEV_PLATFORM  = 'dev_platform',
  // Points are a liability, not a fee, and burying ten of them in
  // System Config made them unfindable (founder 2026-08-18: "i couldnt
  // find a lot of it").
  LOYALTY       = 'loyalty',
  CONFIG        = 'config',
}

// Single source of truth for every editable price/multiplier in SEIRS.
// Spec V8 §3.9 - Admin Fee Catalogue.
@Entity('fees')
export class Fee {
  // Stable code-friendly identifier - referenced from backend services
  // by literal string, so renaming one silently unhooks its consumer.
  //
  // The example here used to be 'customer_booking_fee', which
  // PricingService has never read. A comment is not a consumer: that
  // key was dead, and its mention here was the only thing that made it
  // look alive during a grep (audit, 2026-08-28). Real example:
  // pricing.service.ts:1322 reads 'card_processing_pct'.
  @PrimaryColumn({ length: 64 })
  key: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Index()
  @Column({ type: 'enum', enum: FeeCategory })
  category: FeeCategory;

  @Column({ type: 'enum', enum: FeeUnit })
  unit: FeeUnit;

  // Stored as decimal string by Postgres; cast to Number in the service.
  @Column({ type: 'decimal', precision: 14, scale: 4 })
  value: number;

  @Column({ default: true })
  active: boolean;

  // Free-form admin note attached to the current value (e.g. "raised due to fuel spike Apr 2026")
  @Column({ type: 'text', nullable: true })
  currentNote: string;

  @Column({ nullable: true })
  lastUpdatedById: string;

  @Column({ nullable: true })
  lastUpdatedByName: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
