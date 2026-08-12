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

  // Legacy full-name field. Kept for backwards-compat with older accounts
  // and for admin/audit displays. New code should read firstName + lastName.
  // Auto-populated on write as `${firstName} ${lastName}` when those are set.
  @Column()
  name: string;

  // Split name (2026-08-08). Nigerian users often have 3+ names + varied
  // ordering (some cultures put father's given name in the middle slot).
  // Split lets us:
  //   • display only firstName to drivers/other users (data minimisation)
  //   • cross-check first + last against uploaded ID during verification
  //   • honour the SEIRS ID as the true identifier (see accountId below)
  @Column({ type: 'varchar', length: 40, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  middleName: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  lastName: string | null;

  // Date of birth. locked once set (admin override only). Used for identity
  // cross-check and age-gated features. Store as DATE (no time component).
  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date | null;

  // Emergency contact. safety-critical, no cool-down on edits so users
  // can react to changes in their support network without a wait.
  @Column({ type: 'varchar', length: 100, nullable: true })
  emergencyContactName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  emergencyContactPhone: string | null;

  // Home address. default pickup for the send flow. JSON blob to avoid
  // another table for a low-cardinality user-owned record. Structure:
  //   { label: string, street: string, city: string, state: string,
  //     coords: { lat: number, lng: number } | null }
  @Column({ type: 'jsonb', nullable: true })
  homeAddress: {
    label:  string;
    street: string;
    city:   string;
    state:  string;
    coords: { lat: number; lng: number } | null;
  } | null;

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

  // Marketing/demo account (2026-08-12). Seeded by the admin's Demo
  // Accounts button so screenshots never show a real user. Treated as
  // RADIOACTIVE by every money and dispatch path: demo drivers are
  // excluded from matching, demo stores from the public directory, and
  // withdrawals are refused outright. Without these guards a seeded
  // account with a staged wallet balance would be a real payout hole.
  @Index()
  @Column({ default: false })
  isDemo: boolean;

  // Spec V8 NDPR. soft-delete bookkeeping. Set when user calls
  // DELETE /users/me; cleared if they sign in within 30 days. The
  // daily archive cron uses this + isActive=false to decide who to
  // hard-delete and migrate to archived_users.
  @Column({ nullable: true })
  deactivatedAt: Date;

  @Column({ nullable: true })
  deactivationReason: string;

  // ── Soft-delete grace window (NDPR-defensible + Google/AD-style recycle bin) ─
  // When a user (or admin) triggers account deletion, we schedule a hard-delete
  // 30 days out instead of purging immediately. During the grace window the
  // user can log in and cancel the deletion. A daily cron picks up expired
  // schedules and runs the actual purge into archived_users.
  // NULL on both = no pending deletion.
  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  deletionRequestedAt: Date | null;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  deletionScheduledAt: Date | null;

  // 'self' when the user requested it themselves, or 'admin:<adminUserId>'
  // when an admin scheduled the deletion (e.g. via /admin/users/:id/soft-delete).
  @Column({ type: 'varchar', length: 128, nullable: true })
  deletionRequestedBy: string | null;

  // Optional user-supplied reason. Never surfaced to the deleted user;
  // stored for the audit trail so support can understand attrition patterns.
  @Column({ type: 'text', nullable: true })
  deletionReason: string | null;

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

  // Spec V8 §1.13. captured from deep-link query at registration.
  // Stored for attribution; reward fulfilment lives in a future referral module.
  @Index()
  @Column({ nullable: true })
  referredByCode: string;

  // Legacy enum-based admin sub-role. Kept for backwards compat with
  // older sessions / clients; new role assignments populate roleId
  // (Spec V8 dynamic roles) and that takes precedence.
  @Column({ nullable: true })
  adminRole: AdminSubRole;

  // Spec V8. dynamic role assignment. FK into roles table. When set,
  // overrides the adminRole enum for permission resolution.
  @Index()
  @Column({ type: 'uuid', nullable: true })
  roleId: string;

  // LEGACY. single-role business gate. Kept for backwards-compat with
  // existing accounts. New code should read `capabilities` instead.
  // 'sender' | 'partner'
  @Column({ nullable: true })
  businessRole: string;

  @Column({ nullable: true })
  businessAccountId: string;

  @Column({ nullable: true })
  partnerStoreId: string;

  /**
   * Hybrid-account capabilities (Spec V8 hybrid-business model. 2026-05-11).
   * A single User can be a Business Sender AND a Partner Store at the same
   * time (real Nigerian SME pattern: a shop owner who both ships their own
   * goods AND accepts SEIRS drop-offs from neighbours). Replaces the old
   * `businessRole` single-pick model.
   *
   *   canSend   . instant on signup, allows bulk dispatch + wallet
   *   canPartner. gated behind admin approval (PartnerStore.status must be
   *                APPROVED before this flips true). Triggered via the
   *                "Apply to become a Partner Store" Settings flow.
   */
  @Column({ type: 'jsonb', default: () => `'{"canSend": false, "canPartner": false}'` })
  capabilities: { canSend: boolean; canPartner: boolean };

  // ── Identity verification (Spec V8 identity policy 2026-08-07) ─────────
  // Optional trust tier. Everyone has full app access without this; verified
  // users unlock higher wallet/reward limits, interstate delivery, insured
  // deliveries, priority support. See [[project_seirs_identity_policy]].
  // Populated on admin approval of an IdentityVerification submission.
  @Column({ type: 'timestamptz', nullable: true })
  identityVerifiedAt: Date | null;

  // Which document type was approved (nin | drivers_licence | passport | pvc).
  // Displayed as a subtle tooltip on the trust badge. some downstream
  // partners require a specific ID type (banks want NIN, insurers accept
  // any government-issued).
  @Column({ type: 'varchar', length: 32, nullable: true })
  identityDocType: string | null;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil: Date;

  // Spec V8 §3.13. set when admin merges this account into another
  // via /admin/duplicates. The merged-out user is deactivated; their
  // login is blocked and the UI surfaces "this account was merged".
  @Index()
  @Column({ type: 'uuid', nullable: true })
  mergedIntoUserId: string;

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

  // Per-channel push/email opt-ins. Mirrors the toggles in the apps'
  // notification-settings screens. Keys not present default to true at
  // send time (see NotificationsService.shouldSend). Null entire blob
  // = all channels on (default for new users).
  @Column({ type: 'jsonb', nullable: true })
  notificationPrefs: Record<string, boolean>;

  @OneToMany(() => Delivery, (d) => d.customer)
  deliveries: Delivery[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
