import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

// Single-row table; all reads/writes target id='singleton'.
// Spec V8 §3.4 — admin Fee Catalogue will eventually replace this with a
// per-fee row store; for now this captures the original five pricing knobs.
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

  @UpdateDateColumn()
  updatedAt: Date;
}
