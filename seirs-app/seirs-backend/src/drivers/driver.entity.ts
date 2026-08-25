import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';

// Canonical vehicle taxonomy. Nigerian-language aliases (okada, keke,
// danfo) live UI-side and are normalized to these values before any API
// call - see `normalizeVehicleType()` in shared/services/api.ts.
//   okada  → motorcycle
//   keke   → tricycle
//   danfo  → van  (passenger bus, but cargo-class same as van)
//   truck_sm → truck_small
//   truck_lg → truck_large
export enum VehicleType {
  BICYCLE     = 'bicycle',
  MOTORCYCLE  = 'motorcycle',
  TRICYCLE    = 'tricycle',
  CAR         = 'car',
  VAN         = 'van',
  TRUCK_SMALL = 'truck_small',
  TRUCK_LARGE = 'truck_large',
}

export enum DriverStatus {
  PENDING   = 'pending',   // awaiting KYC review
  APPROVED  = 'approved',
  SUSPENDED = 'suspended',
  REJECTED  = 'rejected',
}

@Entity('drivers')
export class Driver {
  /**
   * Value level 1-10: the trust ladder that decides how valuable a
   * package this driver may carry (caps are driver_level_N_max_value_ngn
   * fee rows). Raised nightly by clean work, or manually under the
   * two-person rule in driver_level_changes.
   */
  @Column({ type: 'int', default: 1 })
  valueLevel: number;

  /**
   * Declared corridor ("on their way", founder 2026-08-21): where this
   * courier is heading anyway, and until when. Matching scores up jobs
   * whose pickup AND drop both hug the line from the courier's current
   * position to this destination. Cleared on expiry.
   */
  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  corridorDestLat: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  corridorDestLng: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  corridorLabel: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  corridorExpiresAt: Date | null;


  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { eager: true })
  @JoinColumn()
  user: User;

  @Column({ type: 'enum', enum: VehicleType })
  vehicleType: VehicleType;

  @Column({ nullable: true })
  vehiclePlate: string;

  // Display-only metadata (make/model/year/color). Not used by matching
  // - matching reads vehicleType. Edits land in "pending review" UX but
  // are persisted immediately; admin reviews via the drivers list.
  @Column({ type: 'jsonb', nullable: true })
  vehicleDetails: { make?: string; model?: string; year?: string; color?: string };

  @Column({ type: 'enum', enum: DriverStatus, default: DriverStatus.PENDING })
  status: DriverStatus;

  @Column({ default: false })
  isOnline: boolean;

  // Spec V8 §2.11 - wind-down mode. While true, the matching service
  // skips this driver for new assignments but they continue completing
  // already-accepted jobs. One-way until the driver fully signs off.
  @Column({ default: false })
  lastOrderMode: boolean;

  // Timestamp when the driver flipped lastOrderMode to true. Used to
  // detect the 30-min penalty window: enabling within 30min of going
  // online costs them next-day priority.
  @Column({ nullable: true })
  lastOrderEnabledAt: Date;

  // Timestamp when this driver last flipped online - used by the
  // 30-min "early wind-down" detector (Spec V8 §2.11).
  @Column({ nullable: true })
  lastOnlineAt: Date;

  // Spec V8 §2.11 - set if the driver triggered the early-wind-down
  // penalty. Matching service deprioritises them while this is in the
  // future. Cleared automatically when the timestamp passes.
  @Column({ type: 'timestamptz', nullable: true })
  priorityPenaltyUntil: Date | null;

  // Spec V8 §1.13 - driver referral attribution. Set when a new
  // driver provides a referredByCode at signup. Reward fulfilment is
  // a follow-up; this column anchors the relationship.
  @Index()
  @Column({ nullable: true })
  referredByCode: string;

  // Last known GPS position
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lastLat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lastLng: number;

  // Timestamp of last GPS update - used for velocity anomaly detection
  @Column({ nullable: true })
  locationUpdatedAt: Date;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;        // 0.00 – 5.00

  @Column({ default: 0 })
  totalDeliveries: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  walletBalance: number; // in local currency (kobo/pesewas stored as decimal)

  // KYC documents - Spec V8 §2.1 requires 7 mandatory + 1 optional
  // Legacy fields kept for backwards compatibility with older client builds.
  @Column({ nullable: true })
  idDocumentUrl: string;

  @Column({ nullable: true })
  vehicleDocumentUrl: string;

  @Column({ nullable: true })
  nationalIdFrontUrl: string;

  @Column({ nullable: true })
  nationalIdBackUrl: string;

  @Column({ nullable: true })
  driversLicenseUrl: string;

  @Column({ nullable: true })
  vehiclePhotoUrl: string;

  @Column({ nullable: true })
  ownershipProofUrl: string;

  @Column({ nullable: true })
  insuranceCertUrl: string;

  @Column({ nullable: true })
  selfieUrl: string;

  @Column({ nullable: true })
  guarantorUrl: string;

  // ── Who owns the vehicle (2026-08-25) ──────────────────────────────────
  //
  // Symptom this fixes: `ownershipProofUrl` above has existed since the
  // first KYC build and the app asks for "Vehicle registration or
  // ownership certificate", but nothing anywhere asked WHOSE name is on
  // it. In Nigeria a very large share of okada and keke riders ride a
  // machine they do not own: hire purchase, a relative's, or an owner who
  // fronts it for a daily return. Those riders were either handing in a
  // document with another person's name on it and being approved anyway,
  // or being rejected for being honest.
  //
  // These columns hold the LIVE, approved answer. A pending answer lives
  // on a driver_vehicle_changes row and is copied here only on approval,
  // for the same reason vehicleType is: matching and pricing read the
  // live row, so nothing here may move without a human saying yes.
  //
  // Deliberately NOT inside vehicleDetails: that jsonb goes to the
  // customer app whole via redactDriverForCustomer, and an owner's name
  // and phone number are not the sender's business.

  @Column({ type: 'varchar', length: 16, default: 'self' })
  vehicleOwnership: 'self' | 'third_party';

  @Column({ type: 'varchar', length: 120, nullable: true })
  vehicleOwnerName: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  vehicleOwnerPhone: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  vehicleOwnerRelationship: string | null;

  /** Photo of the paper authorisation the owner signed by hand. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  vehicleOwnerConsentUrl: string | null;

  /** Optional owner ID photo, ties the paper signature to a person. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  vehicleOwnerIdUrl: string | null;

  /**
   * Owner's full name typed by the owner. Nigerian Evidence Act section
   * 84 digital signature, the same standard the handoff records use.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  vehicleOwnerSignatureName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  vehicleOwnerConsentAt: Date | null;

  @OneToMany(() => Delivery, (d) => d.driver)
  deliveries: Delivery[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
