import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

// Single-row table; all reads/writes target id='singleton'.
// Spec V8 §3.4 — admin Fee Catalogue will eventually replace this with a
// per-fee row store; for now this captures the full pricing surface
// the admin page already exposes (vehicles, surge, fuel/fx, zones).
@Entity('pricing_config')
export class PricingConfig {
  @PrimaryColumn({ length: 16 })
  id: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  baseFare: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  perKmRate: number;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  platformCut: number;

  @Column({ default: false })
  surgeActive: boolean;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1.0 })
  surgeMultiplier: number;

  // Per-vehicle base + per-km + per-min rates (replaces the single global pair)
  @Column({ type: 'jsonb', nullable: true })
  vehicles: Array<{ vehicleType: string; baseFare: number; perKmRate: number; perMinRate: number }>;

  // Named-zone surcharges (e.g. Lekki +30%)
  @Column({ type: 'jsonb', nullable: true })
  zones: Array<{ name: string; surchargePercent: number }>;

  // Auto-adjust percentages applied on top of base fare (Spec V8 fuel-index)
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  fuelAdjustPercent: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  fxAdjustPercent: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
