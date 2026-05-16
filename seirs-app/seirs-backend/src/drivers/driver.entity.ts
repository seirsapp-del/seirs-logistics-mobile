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
// call — see `normalizeVehicleType()` in shared/services/api.ts.
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
  // — matching reads vehicleType. Edits land in "pending review" UX but
  // are persisted immediately; admin reviews via the drivers list.
  @Column({ type: 'jsonb', nullable: true })
  vehicleDetails: { make?: string; model?: string; year?: string; color?: string };

  @Column({ type: 'enum', enum: DriverStatus, default: DriverStatus.PENDING })
  status: DriverStatus;

  @Column({ default: false })
  isOnline: boolean;

  // Spec V8 §2.11 — wind-down mode. While true, the matching service
  // skips this driver for new assignments but they continue completing
  // already-accepted jobs. One-way until the driver fully signs off.
  @Column({ default: false })
  lastOrderMode: boolean;

  // Timestamp when the driver flipped lastOrderMode to true. Used to
  // detect the 30-min penalty window: enabling within 30min of going
  // online costs them next-day priority.
  @Column({ nullable: true })
  lastOrderEnabledAt: Date;

  // Timestamp when this driver last flipped online — used by the
  // 30-min "early wind-down" detector (Spec V8 §2.11).
  @Column({ nullable: true })
  lastOnlineAt: Date;

  // Spec V8 §2.11 — set if the driver triggered the early-wind-down
  // penalty. Matching service deprioritises them while this is in the
  // future. Cleared automatically when the timestamp passes.
  @Column({ type: 'timestamptz', nullable: true })
  priorityPenaltyUntil: Date | null;

  // Spec V8 §1.13 — driver referral attribution. Set when a new
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

  // Timestamp of last GPS update — used for velocity anomaly detection
  @Column({ nullable: true })
  locationUpdatedAt: Date;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;        // 0.00 – 5.00

  @Column({ default: 0 })
  totalDeliveries: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  walletBalance: number; // in local currency (kobo/pesewas stored as decimal)

  // KYC documents — Spec V8 §2.1 requires 7 mandatory + 1 optional
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

  @OneToMany(() => Delivery, (d) => d.driver)
  deliveries: Delivery[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
