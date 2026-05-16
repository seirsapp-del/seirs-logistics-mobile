import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index, Unique,
} from 'typeorm';

// Spec V8 §3.13 — admin-side duplicate account candidate. Created by
// AdminService.scanForDuplicates() and resolved manually by an admin
// reviewing the /duplicates page (merge → loser is soft-flagged
// merged_into the primary; dismiss → leave both untouched).

export enum DuplicateStatus {
  OPEN      = 'open',
  CONFIRMED = 'confirmed',   // admin reviewed + accepted but hasn't merged yet
  MERGED    = 'merged',
  DISMISSED = 'dismissed',
}

export enum DuplicateReason {
  EMAIL_LOOKALIKE   = 'email_lookalike',     // same domain, similar local-part
  SAME_PHONE        = 'same_phone',
  NAME_PHONE_MATCH  = 'name_phone_match',
  NIN_MATCH         = 'nin_match',           // future — when NIN ingested
}

@Entity('duplicate_accounts')
@Unique(['primaryUserId', 'duplicateUserId'])
@Index(['status', 'createdAt'])
export class DuplicateAccountCandidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The older account — the one the admin should keep on merge.
  // Convention: lower createdAt = primary.
  @Index()
  @Column({ type: 'uuid' })
  primaryUserId: string;

  @Index()
  @Column({ type: 'uuid' })
  duplicateUserId: string;

  // Denormalised for fast list rendering — kept in sync on scan.
  @Column() primaryName:      string;
  @Column() primaryEmail:     string;
  @Column({ nullable: true }) primaryPhone: string;
  @Column() duplicateName:    string;
  @Column() duplicateEmail:   string;
  @Column({ nullable: true }) duplicatePhone: string;

  // 0.0 - 1.0 — higher = more confident the match is a real duplicate.
  @Column({ type: 'decimal', precision: 3, scale: 2 })
  matchScore: number;

  @Column({ type: 'enum', enum: DuplicateReason })
  reason: DuplicateReason;

  @Column({ type: 'enum', enum: DuplicateStatus, default: DuplicateStatus.OPEN })
  status: DuplicateStatus;

  @Column({ type: 'uuid', nullable: true })
  resolvedByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
