import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

// Spec V8 — NDPR Article 17 right to erasure. After 30 days in
// soft-deleted state (isActive=false), the daily cron migrates a user
// here with reduced PII and hard-deletes from the main `users` table.
//
// What we keep (legal hold):
//   - originalUserId   — link audit_logs / disputes still referencing them
//   - emailHash        — sha256 of original email; lets us answer
//                        "did this address ever have an account?" without
//                        retaining the address itself (NDPR pseudonymisation)
//   - role + accountId — needed for ops queries about historical activity
//   - timestamps       — when they joined, when soft-deleted, when archived
//
// What we discard (NDPR purge):
//   - Real name, phone, address, profile photo, any free-text PII
//   - Password hash, session tokens, OTP secrets
//   - Wallet balance (must be zeroed at deletion time anyway)
@Entity('archived_users')
export class ArchivedUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  originalUserId: string;

  @Index()
  @Column({ length: 64 })
  emailHash: string;

  @Column({ nullable: true })
  accountId: string;

  @Column({ length: 16 })
  role: string;

  @Column({ nullable: true })
  reason: string;

  @Column()
  originalCreatedAt: Date;

  @Column()
  deactivatedAt: Date;

  @CreateDateColumn()
  archivedAt: Date;
}
