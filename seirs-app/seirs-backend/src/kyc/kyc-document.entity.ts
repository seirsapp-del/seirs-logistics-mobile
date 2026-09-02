import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Who a document belongs to.
 *
 * The founder has asked for reviewed documents on all four, so this is the
 * shape from the start rather than a driver table with three copies bolted
 * on later. Two document tables with two review flows is precisely the
 * duplication the first week of September was spent removing.
 */
export type KycOwnerType = 'driver' | 'partner_store' | 'business' | 'customer';

/**
 * needs_replacing is the state between approved and rejected.
 *
 * Added on the driver side 2026-09-02 and carried here from the start.
 * Only approved and rejected existed, so an expired licence could be dealt
 * with in exactly two ways: leave it approved and pretend it is valid, or
 * reject it, which tells somebody they did something wrong when they did
 * not. A CAC certificate that was perfectly good and has simply run out is
 * neither, and calling a shop owner a liar because time passed is how you
 * lose partners who have done nothing.
 *
 * It behaves like rejected for access (they can re-upload) and like
 * approved for tone (nobody is accused). Amber, not red, in both apps.
 * A varchar column, so a new value needs no enum DDL.
 */
export type KycDocStatus = 'submitted' | 'approved' | 'rejected' | 'needs_replacing';

/**
 * One row per KYC document, with its own review state, for any owner.
 *
 * Generalised from driver_documents on 2026-09-02. That table was keyed on
 * driver_id and served riders well; partner stores had nothing comparable.
 * A partner's three documents lived as three URL columns on partner_stores
 * behind ONE status and ONE review note, so a blurry CAC certificate meant
 * the whole application was refused, in a single sentence, with no way to
 * replace the one bad photograph and no field anywhere for the date a
 * certificate runs out.
 *
 * ownerUserId is denormalised on purpose and is what makes the polymorphic
 * key workable. Every owner resolves to exactly one user (drivers.userId,
 * partner_stores.userId, business_accounts.ownerId, the customer
 * themselves), so notifications need no join at all and the expiry sweep
 * joins users once for every owner type rather than once per type. It also
 * makes the erase-on-account-deletion path a single indexed delete.
 *
 * There is deliberately NO foreign key. A polymorphic owner cannot have
 * one, and the cascade that driver_documents relied on is replaced by an
 * explicit delete in the hard-delete path. That trade was made knowingly:
 * see the note on the audit trail in kyc-documents.service.
 */
@Entity('kyc_documents')
@Index(['ownerType', 'ownerId', 'docId'], { unique: true })
@Index(['status', 'createdAt'])
@Index(['ownerUserId'])
export class KycDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  ownerType: KycOwnerType;

  /** The driver id, partner store id, business account id, or user id. */
  @Column({ type: 'uuid' })
  ownerId: string;

  /**
   * The person behind the owner, resolved once at write time.
   *
   * Not a convenience. It is how one expiry sweep serves four owner types,
   * and how a deleted account's documents are found without knowing which
   * kind of owner they belonged to.
   */
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;

  /** e.g. drivers_license, cac_registration, owner_id, storefront_photo. */
  @Column()
  docId: string;

  @Column()
  url: string;

  @Column({ type: 'varchar', length: 20, default: 'submitted' })
  status: KycDocStatus;

  /**
   * Why a document was refused, shown to the owner so they know what to
   * fix rather than re-uploading the same unreadable photo. Required on a
   * rejection, for exactly that reason.
   */
  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy: User | null;

  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  /**
   * Bumped every time the owner re-uploads. A replacement always returns to
   * 'submitted', which is the whole point: approval attaches to a specific
   * file, not to the slot it sits in.
   */
  @Column({ type: 'int', default: 1 })
  version: number;

  /**
   * When the document itself stops being valid: a licence expiry, a CAC
   * certificate's end date. Set by the reviewer from what the document
   * actually says, because nothing else knows it.
   *
   * Settable at ANY time, not only at approval. A reviewer who approved
   * yesterday and reads the date today must be able to record it without
   * firing a second "approved" notice at somebody for a decision already
   * made.
   *
   * Expiry FLAGS, it never enforces. Nothing auto-suspends anybody: a
   * person decides (founder, settled).
   */
  @Column({ type: 'date', nullable: true })
  expiresAt: string | null;

  /**
   * When the owner was warned this is about to lapse.
   *
   * Stamped once, cleared on every new review decision and on every new
   * upload, so replacing a document re-arms the warning and nobody is told
   * the same thing every morning for thirty days.
   */
  @Column({ type: 'timestamptz', nullable: true })
  expiryWarnedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
