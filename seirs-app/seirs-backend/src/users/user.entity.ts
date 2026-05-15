import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Delivery } from '../deliveries/delivery.entity';

export enum UserRole {
  CUSTOMER = 'customer',
  DRIVER   = 'driver',
  ADMIN    = 'admin',
}

export enum AdminSubRole {
  SUPER_ADMIN       = 'super_admin',
  OPS_MANAGER       = 'ops_manager',
  SUPPORT_AGENT     = 'support_agent',
  FINANCE_OFFICER   = 'finance_officer',
  DRIVER_COMPLIANCE = 'driver_compliance',
  MEDIA_CONTENT     = 'media_content',
  ANALYST           = 'analyst',
  PARTNER_MANAGER   = 'partner_manager',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Index()
  @Column({ unique: true })
  email: string;

  @Column()
  phone: string;

  @Column({ select: false })
  password: string;

  @Index()
  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  fcmToken: string;

  @Column({ nullable: true })
  profilePhoto: string;

  @Column({ nullable: true, select: false })
  passwordResetToken: string;

  @Column({ nullable: true })
  passwordResetExpiry: Date;

  @Column({ default: false })
  emailVerified: boolean;

  // Spec V8 NDPR — soft-delete bookkeeping. Set when user calls
  // DELETE /users/me; cleared if they sign in within 30 days. The
  // daily archive cron uses this + isActive=false to decide who to
  // hard-delete and migrate to archived_users.
  @Column({ nullable: true })
  deactivatedAt: Date;

  @Column({ nullable: true })
  deactivationReason: string;

  @Column({ nullable: true, select: false })
  emailVerificationOtp: string;

  @Column({ nullable: true })
  emailVerificationExpiry: Date;

  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({ nullable: true, unique: true })
  appleId: string;

  @Index()
  @Column({ nullable: true, unique: true })
  accountId: string;

  // Spec V8 §1.13 — captured from deep-link query at registration.
  // Stored for attribution; reward fulfilment lives in a future referral module.
  @Index()
  @Column({ nullable: true })
  referredByCode: string;

  // Legacy enum-based admin sub-role. Kept for backwards compat with
  // older sessions / clients; new role assignments populate roleId
  // (Spec V8 dynamic roles) and that takes precedence.
  @Column({ nullable: true })
  adminRole: AdminSubRole;

  // Spec V8 — dynamic role assignment. FK into roles table. When set,
  // overrides the adminRole enum for permission resolution.
  @Index()
  @Column({ type: 'uuid', nullable: true })
  roleId: string;

  // LEGACY — single-role business gate. Kept for backwards-compat with
  // existing accounts. New code should read `capabilities` instead.
  // 'sender' | 'partner'
  @Column({ nullable: true })
  businessRole: string;

  @Column({ nullable: true })
  businessAccountId: string;

  @Column({ nullable: true })
  partnerStoreId: string;

  /**
   * Hybrid-account capabilities (Spec V8 hybrid-business model — 2026-05-11).
   * A single User can be a Business Sender AND a Partner Store at the same
   * time (real Nigerian SME pattern: a shop owner who both ships their own
   * goods AND accepts SEIRS drop-offs from neighbours). Replaces the old
   * `businessRole` single-pick model.
   *
   *   canSend    — instant on signup, allows bulk dispatch + wallet
   *   canPartner — gated behind admin approval (PartnerStore.status must be
   *                APPROVED before this flips true). Triggered via the
   *                "Apply to become a Partner Store" Settings flow.
   */
  @Column({ type: 'jsonb', default: () => `'{"canSend": false, "canPartner": false}'` })
  capabilities: { canSend: boolean; canPartner: boolean };

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil: Date;

  // ── Driver payout bank account ─────────────────────────────────────────
  // Captured during driver onboarding; verified via FlutterwaveService
  // .verifyBankAccount() before any payout is allowed. Never used by
  // customers (they pay via Flutterwave Inline, not direct debit).
  @Column({ nullable: true })
  bankCode: string;            // CBN bank code, e.g. "044" for Access Bank

  @Column({ nullable: true })
  bankAccountNumber: string;   // 10-digit NUBAN

  @Column({ nullable: true })
  bankAccountName: string;     // resolved name from Flutterwave

  @Column({ nullable: true })
  bankVerifiedAt: Date;

  @OneToMany(() => Delivery, (d) => d.customer)
  deliveries: Delivery[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
