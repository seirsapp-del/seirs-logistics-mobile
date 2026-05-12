import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * Partner Store lifecycle (Spec V8 hybrid-business — 2026-05-11).
 * Stores moved from instant-active to admin-gated. New applications start
 * PENDING_REVIEW and only flip to APPROVED when an admin reviews KYC docs
 * (storefront photo, CAC reg, address proof) and toggles approval.
 *
 * SUSPENDED — admin temporarily disables (e.g. customer complaints, capacity
 * abuse). REJECTED — application denied; user can re-apply.
 */
export enum PartnerStoreStatus {
  PENDING_REVIEW = 'pending_review',
  APPROVED       = 'approved',
  SUSPENDED      = 'suspended',
  REJECTED       = 'rejected',
}

@Entity('partner_stores')
@Index(['status'])
export class PartnerStore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  storeName: string;

  @Column({ default: '' })
  storeAddress: string;

  @Column({ default: '' })
  phone: string;

  @Column({ default: 50 })
  maxCapacity: number;

  @Column({ type: 'jsonb', default: () => "'[\"Mon\",\"Tue\",\"Wed\",\"Thu\",\"Fri\",\"Sat\"]'" })
  operatingDays: string[];

  @Column({ default: '08:00' })
  openTime: string;

  @Column({ default: '18:00' })
  closeTime: string;

  @Column({ default: true })
  notifyNewPackage: boolean;

  @Column({ default: true })
  notifyPickup: boolean;

  @Column({ default: true })
  notifyPayout: boolean;

  // 2026-05-11 — two orthogonal flags split from the old single 'status':
  //   status        — admin-managed approval lifecycle (KYC gate)
  //   acceptingNew  — partner-managed on/off toggle (operational pause)
  //
  // Old rows with status='active' coexist because we kept varchar; service
  // code treats 'active' as APPROVED. New rows default to PENDING_REVIEW.
  @Column({ default: PartnerStoreStatus.PENDING_REVIEW })
  status: PartnerStoreStatus | 'active';

  // Partner's day-to-day on/off toggle. true = taking new drop-offs.
  // false = paused (e.g. over capacity, closing early). Independent of
  // approval status; an unapproved store can't toggle this either way.
  @Column({ default: true })
  acceptingNew: boolean;

  // KYC docs the user uploads at "Apply to be a Partner Store" time.
  // Admin reviews these in the dashboard before flipping to APPROVED.
  @Column({ nullable: true })
  storefrontPhotoUrl: string;

  @Column({ nullable: true })
  cacRegUrl: string;

  @Column({ nullable: true })
  ownerIdUrl: string;

  // Admin's note when approving / rejecting / suspending. Visible to user.
  @Column({ nullable: true })
  reviewNote: string;

  @Column({ nullable: true })
  reviewedAt: Date;

  @Column({ nullable: true })
  reviewedBy: string; // adminUserId

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
