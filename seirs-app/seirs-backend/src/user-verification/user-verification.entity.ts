import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Identity verification submission. one row per submit attempt by a user.
 *
 * Policy (see docs/identity-policy.md + memory project_seirs_identity_policy):
 *   • Verification is OPTIONAL. users have full app access without it
 *   • Multi-document: NIN, driver's licence, international passport, PVC
 *   • Manual admin review, SLA 24hrs–3 business days
 *   • Rejection includes a reason; user can re-submit
 *
 * Approved submissions bump `user.identityVerifiedAt`. The user record
 * flags the verified tier; this entity is the audit trail.
 */
export type VerificationDocumentType =
  | 'nin'              // National Identification Number slip
  | 'drivers_licence'  // Nigerian driver's licence
  | 'passport'         // International passport
  | 'pvc';             // Permanent Voter's Card

export type VerificationStatus = 'submitted' | 'approved' | 'rejected' | 'withdrawn';

@Entity('identity_verifications')
@Index(['status', 'submittedAt'])       // admin queue sorting
@Index(['userId', 'submittedAt'])       // per-user history lookup
export class IdentityVerification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'varchar', length: 32 })
  documentType!: VerificationDocumentType;

  // Cloudflare R2 URL for the FRONT of the ID document.
  @Column({ type: 'text' })
  documentPhotoUrl!: string;

  // Cloudflare R2 URL for the BACK of the ID document. Required for all
  // doc types as of 2026-08-08. Passport signature page or blank back
  // pages are acceptable; presence of a back photo is itself a fraud
  // signal since spoofed IDs often only fabricate the front.
  // Legacy submissions before the policy change may have this null.
  @Column({ type: 'text', nullable: true })
  documentBackPhotoUrl!: string | null;

  // Cloudflare R2 URL for the selfie-holding-document photo.
  // Selfie is required. it's the "same person as on the ID" proof.
  @Column({ type: 'text' })
  selfiePhotoUrl!: string;

  // Optional user-provided context (e.g. name variation explanation,
  // legal-name-vs-preferred-name note). Not required but reduces
  // admin round-trips.
  @Column({ type: 'text', nullable: true })
  submitterNote!: string | null;

  @Column({ type: 'varchar', length: 24, default: 'submitted' })
  status!: VerificationStatus;

  @CreateDateColumn()
  submittedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Populated when status transitions to approved/rejected
  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  // Admin user id (from users table, role=admin) who reviewed
  @Column({ type: 'varchar', length: 64, nullable: true })
  reviewedByUserId!: string | null;

  // Required when status = 'rejected'. Shown to the user so they can
  // fix + re-submit ("blurry photo", "expired ID", "name doesn't match", etc).
  // Keep it short + specific. Admin-only prose about the case goes in
  // adminNote which the user never sees.
  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  // Internal admin-only free-text (never returned to the user)
  @Column({ type: 'text', nullable: true })
  adminNote!: string | null;
}
