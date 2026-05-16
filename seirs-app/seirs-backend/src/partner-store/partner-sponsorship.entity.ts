import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToOne, JoinColumn, Index,
} from 'typeorm';
import { PartnerStore } from '../business/partner-store.entity';

// Spec V8 §4.11 — sponsored placement subscription.
// Each PartnerStore has at most ONE PartnerSponsorship row. When
// ACTIVE, the store appears pinned at the top of the customer map
// + drop-off picker for its service area. Monthly fee is read live
// from the Fee Catalogue ("partner_sponsored_placement").

export enum SponsorshipStatus {
  ACTIVE    = 'active',
  PAUSED    = 'paused',
  CANCELLED = 'cancelled',
}

@Entity('partner_sponsorships')
@Index(['status', 'nextInvoiceAt'])
export class PartnerSponsorship {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => PartnerStore, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn()
  partnerStore: PartnerStore;

  // Denormalised for fast lookup + ensuring 1:1 with PartnerStore.
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  partnerStoreId: string;

  @Column({ type: 'enum', enum: SponsorshipStatus, default: SponsorshipStatus.ACTIVE })
  status: SponsorshipStatus;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  // When status flipped to PAUSED or CANCELLED.
  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  // Snapshot of the monthly fee at last invoice. The "live" current
  // price for the UI comes from FeesService — this is what was actually
  // billed for audit purposes.
  @Column({ type: 'integer', default: 0 })
  lastInvoicedFeeKobo: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastInvoicedAt: Date | null;

  // The cron picks up rows whose nextInvoiceAt <= now. Skipped while
  // status != ACTIVE. Set to startedAt + 30 days on activate.
  @Column({ type: 'timestamptz' })
  nextInvoiceAt: Date;

  // Audit: how many monthly invoices have fired against this row.
  @Column({ default: 0 })
  invoiceCount: number;

  // Audit: count of failed Flutterwave subscription pulls. We do NOT
  // auto-pause on first failure — many failures are transient (3DS
  // re-auth, network). After 3 consecutive fails the cron pauses
  // the row and emails the partner.
  @Column({ default: 0 })
  consecutiveFailures: number;

  @Column({ type: 'text', nullable: true })
  lastFailureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
