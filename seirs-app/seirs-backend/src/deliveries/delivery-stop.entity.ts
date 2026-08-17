import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Delivery } from './delivery.entity';

export enum DeliveryStopStatus {
  PENDING   = 'pending',     // not yet visited
  EN_ROUTE  = 'en_route',    // driver heading to this stop
  ARRIVED   = 'arrived',     // driver tapped "Arrived at stop"
  DELIVERED = 'delivered',   // recipient confirmed
  FAILED    = 'failed',      // unreachable / refused / wrong address
  // The run itself was cancelled, so nobody ever attempted this parcel.
  // Distinct from FAILED, which means a real delivery attempt did not
  // succeed: a cancelled run left its packages reading "pending" forever
  // on the sender's screen (founder 2026-08-17).
  CANCELLED = 'cancelled',
}

/**
 * One drop-off in a multi-stop booking. A booking with N stops has N
 * `DeliveryStop` rows linked to a single `Delivery`. Single-stop bookings
 * may still have one DeliveryStop row (cleaner) or store dropoff on the
 * Delivery itself (legacy single-leg path); the dispatcher reads stops
 * if present, falls back to delivery.dropoffAddress otherwise.
 *
 * `sequenceOrder` is the visit order - set either by the user or by
 * Google Directions' `waypoint_order` (auto-optimised route). Driver app
 * walks through these in ascending sequenceOrder.
 *
 * Stop-level status + timestamps support Spec V8 §2's per-stop signature
 * + proof-of-delivery + partial-completion fee logic.
 */
@Entity('delivery_stops')
@Index(['deliveryId', 'sequenceOrder'])
export class DeliveryStop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  deliveryId: string;

  @ManyToOne(() => Delivery, (d) => d.stops, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deliveryId' })
  delivery: Delivery;

  // Visit order (1-indexed). May differ from the order the user entered
  // if auto-optimization reordered them.
  @Column({ type: 'int' })
  sequenceOrder: number;

  // Per-stop verification code (2026-08-09): each drop in a multi-stop
  // run gets its own short code so recipient N can only claim stop N,
  // not the whole run's trackingCode. Shown as a QR by the recipient /
  // sender share message; driver scans at each door. Nullable so legacy
  // stops keep working; generated for all new stops.
  @Index()
  @Column({ type: 'varchar', length: 12, nullable: true })
  stopCode: string | null;

  @Column()
  address: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng: number;

  /**
   * Per-package fields (multi-package rebuild, founder spec 2026-08-15:
   * packages are FIRST-CLASS: each stop carries one package with its own
   * photo, description, category, weight and a PUBLIC tracking code).
   * Nullable so legacy single-category runs keep working; the business
   * Send rebuild writes them for every new booking.
   */
  @Column({ type: 'jsonb', nullable: true })
  packagePhotoUrls: string[] | null;

  @Column({ type: 'text', nullable: true })
  packageDescription: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  categoryCode: string | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  weightKg: number | null;

  // Public per-package tracking code (SRS-XXXXXXXX; some early rows hold
  // the old SRS-P- shape and still resolve). Unlike stopCode
  // (a claim code the recipient shows at the door), this one resolves on
  // the public /track page so each receiver can follow their own parcel.
  @Index()
  @Column({ type: 'varchar', length: 16, nullable: true })
  packageTrackingCode: string | null;

  // Price attributed to this package by the rate card at booking time
  // (its category surcharge + weight tier + its share of labour/fuel).
  // Sums to the delivery's total; feeds the itemized receipt.
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  packagePriceNgn: number | null;

  /**
   * Customer-parity fields (2026-08-16): the customer Send form asks
   * these per package, so a business run must carry them per package
   * too, not once for the whole run. Receiver first/last drive the
   * handoff name check; declared value drives the high-value ID gate;
   * fallback says what the driver may do when nobody answers.
   */
  @Column({ type: 'varchar', length: 60, nullable: true })
  receiverFirstName: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  receiverLastName: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  declaredValueNgn: number | null;

  @Column({ type: 'varchar', length: 12, nullable: true })
  fallbackPref: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  fallbackNeighbourName: string | null;

  /**
   * Destination partner store for THIS package (2026-08-16). A run can
   * mix door drops and store drops, and two packages can go to two
   * different counters, so the choice belongs on the stop, never on the
   * delivery. address/lat/lng still carry the store's location so
   * routing and pricing need no special case.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  destinationStoreId: string | null;

  @Column()
  recipientName: string;

  @Column()
  recipientPhone: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Estimated wait time at this specific stop. Computed at booking time
  // from: category.setupDwellMinutes + weight tier + buffer. Stored so
  // the driver app can show "~5 min" per stop without re-computing.
  @Column({ type: 'int', default: 3 })
  estimatedDwellMinutes: number;

  @Index()
  @Column({ type: 'enum', enum: DeliveryStopStatus, default: DeliveryStopStatus.PENDING })
  status: DeliveryStopStatus;

  // Stop-level timestamps. Driver taps "Arrived" on arrival, "Delivered"
  // on handoff. Difference = actual dwell time, used later for pricing
  // tuning and fraud detection (drivers padding wait time).
  @Column({ type: 'timestamp', nullable: true })
  arrivedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  signedAt: Date;

  // Why a stop failed (recipient unreachable, wrong address, refused).
  @Column({ type: 'text', nullable: true })
  failureReason: string;

  // Proof of delivery - photo URLs (R2) + optional signature.
  @Column({ type: 'jsonb', nullable: true })
  proofPhotoUrls: string[];

  @Column({ nullable: true })
  recipientSignatureUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
