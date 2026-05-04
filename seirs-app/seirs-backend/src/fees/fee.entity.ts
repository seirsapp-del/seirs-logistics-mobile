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
  CONFIG        = 'config',
}

// Single source of truth for every editable price/multiplier in SEIRS.
// Spec V8 §3.9 — Admin Fee Catalogue.
@Entity('fees')
export class Fee {
  // Stable code-friendly identifier — referenced from backend services
  // (e.g. PricingService reads 'customer_booking_fee'). Never rename.
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
