import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * Partner Store lifecycle (Spec V8 hybrid-business - 2026-05-11).
 * Stores moved from instant-active to admin-gated. New applications start
 * PENDING_REVIEW and only flip to APPROVED when an admin reviews KYC docs
 * (storefront photo, CAC reg, address proof) and toggles approval.
 *
 * SUSPENDED - admin temporarily disables (e.g. customer complaints, capacity
 * abuse). REJECTED - application denied; user can re-apply.
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

  // Public store code (founder 2026-08-12), e.g. PART-4KX9. Identifies
  // the PHYSICAL SHOP, not its owner: the owner keeps their BIZ- SEIRS
  // ID, which never mutates. Printed on shelf labels, shown in the
  // customer's store picker, and quoted to support, so a shop can be
  // referenced without exposing the owner's account. Random rather than
  // derived from name or area, so it survives a rename or a move.
  // Minted on admin approval; NULL while an application is pending.
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 12, nullable: true })
  storeCode: string | null;

  @Column()
  storeName: string;

  @Column({ default: '' })
  storeAddress: string;

  // Optional coordinates. Nullable so existing rows keep working; the
  // partner apply form captures these when the storefront address is
  // picked from a places autocomplete. When set they let the public
  // /find-a-partner page sort by distance from the visitor.
  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  storeLat: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  storeLng: string | null;

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

  // 2026-05-11 - two orthogonal flags split from the old single 'status':
  //   status        - admin-managed approval lifecycle (KYC gate)
  //   acceptingNew  - partner-managed on/off toggle (operational pause)
  //
  // Old rows with status='active' coexist because we kept varchar; service
  // code treats 'active' as APPROVED. New rows default to PENDING_REVIEW.
  @Column({ default: PartnerStoreStatus.PENDING_REVIEW })
  status: PartnerStoreStatus | 'active';

  /**
   * When the shop is actually open, per day.
   *
   * Replaces operatingDays + openTime + closeTime, which could describe
   * only ONE window applied to every open day, and could not describe a
   * shop open past midnight at all: isOpenNow tested
   * `mins >= open && mins < close`, so an 18:00 to 02:00 kiosk computed
   * as closed forever.
   *
   * Same shape drivers use, and read by the same withinWorkingHours, so
   * there is one answer to "are they open now" rather than two that
   * disagree.
   *
   * NULL means never answered, and never answered means OPEN. That is
   * not laziness: every existing store carries DEFAULT operating days
   * that no shop owner ever chose, and migrating a default into this
   * column would turn it into a statement. A store that has genuinely
   * never set hours must keep getting parcels it can refuse, rather than
   * silently vanishing from the directory on a rule nobody made.
   *
   * The three legacy columns stay for now: the app still writes them and
   * the settings screen still reads them.
   */
  @Column({ type: 'jsonb', nullable: true })
  workingHours: Record<string, { enabled: boolean; start: string; end: string }> | null;

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

  /**
   * Where the shop's counter earnings are sent.
   *
   * There was nowhere. partner_payouts held an amount, a period and a
   * status and no destination at all, and nothing in the codebase ever
   * set that status to 'paid'. A shop accrued handling fees into a ledger
   * that could not be settled, while the statement screen rendered
   * "Counter earnings paid" for a state no code could reach.
   *
   * Same four columns drivers keep on their wallet, deliberately, so one
   * transfer path serves both. bankCode is the CBN code the provider
   * needs; bankAccountName is what the bank returned when we resolved the
   * number, NOT what the shop typed, because the whole point of resolving
   * it is that people mistype their own account numbers.
   *
   * On the STORE rather than the owner's user, because the money belongs
   * to the shop. partner_payouts is keyed on partnerStoreId, and a shop
   * that changes hands should keep its own account rather than follow the
   * person who used to run it.
   */
  @Column({ nullable: true })
  bankName: string;

  @Column({ nullable: true })
  bankCode: string;

  @Column({ nullable: true })
  bankAccountNumber: string;

  /** As the bank returned it, not as the partner typed it. */
  @Column({ nullable: true })
  bankAccountName: string;

  @Column({ type: 'timestamptz', nullable: true })
  bankVerifiedAt: Date;

  /**
   * A REPLACEMENT account, waiting for a human.
   *
   * Same policy drivers have had since 2026-08-09: the first account
   * saves instantly, because a shop with no account cannot be paid and
   * making them wait helps nobody. Replacing one is the step an attacker
   * wants, so it queues for review and the live account keeps paying
   * until somebody approves the change.
   */
  @Column({ nullable: true })
  pendingBankName: string;

  @Column({ nullable: true })
  pendingBankCode: string;

  @Column({ nullable: true })
  pendingBankAccountNumber: string;

  @Column({ nullable: true })
  pendingBankAccountName: string;

  @Column({ type: 'timestamptz', nullable: true })
  pendingBankRequestedAt: Date;

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
