import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Driver } from '../drivers/driver.entity';
import { DeliveryStop } from './delivery-stop.entity';

export enum DeliveryStatus {
  PENDING     = 'pending',      // created, finding driver
  ASSIGNED    = 'assigned',     // driver matched
  PICKED_UP   = 'picked_up',   // driver confirmed pickup
  IN_TRANSIT  = 'in_transit',  // en route
  DELIVERED   = 'delivered',    // complete
  FAILED      = 'failed',       // could not deliver
  CANCELLED   = 'cancelled',    // cancelled by customer/driver
}

export enum PackageSize {
  SMALL  = 'small',   // envelope, documents
  MEDIUM = 'medium',  // shoebox size
  LARGE  = 'large',   // suitcase / bulk
}

export enum UrgencyLevel {
  ECONOMY  = 'economy',   // 2-3 days
  STANDARD = 'standard',  // next day
  INSTANT  = 'instant',   // same day, hours
}

// Where a delivery was booked from. Set at creation time on the server so
// we can never confuse client-app UA sniffing with the real origin. Powers
// the channel breakdown donut on the admin dashboard + informs commission
// splits when they diverge by source.
export enum DeliverySource {
  CUSTOMER_APP  = 'customer_app',
  BUSINESS_APP  = 'business_app',
  PARTNER_STORE = 'partner_store',
  DEVELOPER_API = 'developer_api',
}

@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true })
  trackingCode: string;

  @ManyToOne(() => User, (u) => u.deliveries, { eager: true })
  @JoinColumn()
  customer: User;

  @ManyToOne(() => Driver, (d) => d.deliveries, { nullable: true, eager: true })
  @JoinColumn()
  driver: Driver;

  // Pickup
  @Column()
  pickupAddress: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  pickupLat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  pickupLng: number;

  // Dropoff (single-leg path). Made nullable so multi-stop bookings can
  // use the `stops` relation instead. Single-stop bookings still set
  // these for backward compatibility with the existing dispatcher /
  // driver-app screens until phase 5 wires stops everywhere.
  @Column({ nullable: true })
  dropoffAddress: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  dropoffLat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  dropoffLng: number;

  // Multi-stop linkage. Empty for single-leg deliveries; populated for
  // bookings that go pickup → stop1 → stop2 → ... → stopN. Driver app
  // walks these in ascending sequenceOrder.
  @OneToMany(() => DeliveryStop, (stop) => stop.delivery, { cascade: true })
  stops: DeliveryStop[];

  @Column({ default: false })
  isMultiStop: boolean;

  // Package details
  @Column()
  packageDescription: string;

  @Column({ type: 'enum', enum: PackageSize, default: PackageSize.SMALL })
  packageSize: PackageSize;

  @Column({ default: false })
  isFragile: boolean;

  @Column({ type: 'enum', enum: UrgencyLevel, default: UrgencyLevel.STANDARD })
  urgency: UrgencyLevel;

  // Service category code (FK to ServiceCategory.code) - drives suggested
  // vehicle, dwell time, and category surcharges. Nullable for legacy
  // bookings created before the catalog existed.
  @Column({ nullable: true })
  categoryCode: string;

  // Total weight in kg. Required for new bookings - drives dwell tier,
  // vehicle safety rules, and pricing. Nullable for legacy rows.
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  weightKg: number;

  /**
   * Photos of the package taken by the sender at booking (2026-08-13).
   * The customer app has always REQUIRED at least one before it lets the
   * booking continue, but there was nowhere to put them, so they were
   * uploaded and then discarded. That destroyed the sender's own
   * evidence of what they handed over, which is the first thing anyone
   * asks for in a damage dispute.
   */
  @Column({ type: 'jsonb', nullable: true })
  packagePhotos: string[] | null;

  // How the sender chose to pay ('card', 'cash', 'wallet'). Recorded for
  // reconciliation; the authoritative record is still the payment row.
  @Column({ type: 'varchar', length: 16, nullable: true })
  paymentMethod: string | null;

  // Cash to collect from the recipient on delivery, when the sender is
  // using cash on delivery.
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  codAmountNgn: number | null;

  // Sender-declared package value in NGN (optional). At or above the
  // Fee Catalogue's high_value_threshold_ngn the driver-side handoff
  // signature becomes mandatory on the DELIVERED transition (founder
  // policy 2026-08-10: high-value only). Also feeds future insurance.
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  declaredValueNgn: number | null;

  // Receiver system (founder 2026-08-11): Nigerians routinely have
  // neighbours/security collect packages. The sender names the receiver
  // at booking; the typed-name handoff check matches THIS first name
  // instead of the account holder's registered name when present.
  @Column({ type: 'varchar', length: 60, nullable: true })
  receiverFirstName: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  receiverLastName: string | null;

  // How the sender wants the receiver verified: 'name' (driver asks the
  // first name and types it), 'code' (emailed to the SENDER to forward),
  // 'id' (physical ID check). High-value packages ignore 'name'.
  @Column({ type: 'varchar', length: 12, nullable: true })
  receiverVerifyPref: string | null;

  // Fallback when nobody answers: 'hand_only' | 'neighbour' | 'gate' |
  // 'store'. High-value packages may only be hand_only or store.
  @Column({ type: 'varchar', length: 12, nullable: true })
  fallbackPref: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  fallbackNeighbourName: string | null;

  /**
   * WHO actually took the package, recorded at the moment of delivery
   * (founder 2026-08-12: the proof photo exists so admin can settle a
   * dispute, and "the package was delivered" is a weak answer when the
   * question is "delivered to whom").
   *
   * Distinct from fallbackPref/fallbackNeighbourName above, which is
   * what the SENDER said should happen if nobody answers. This is what
   * the driver reports DID happen.
   *
   * 'recipient' | 'other'
   */
  @Column({ type: 'varchar', length: 12, nullable: true })
  receivedByRelation: string | null;

  // Name the driver was given by whoever accepted it. Only meaningful
  // when receivedByRelation is not 'recipient'.
  @Column({ type: 'varchar', length: 80, nullable: true })
  receivedByName: string | null;

  // Failed-delivery flow (founder matrix 2026-08-11). Driver reports
  // nobody-home -> sender gets a 5-minute response window -> explicit
  // choice or automatic fallback (high-value always redirects to the
  // nearest partner store, never gate/neighbour).
  @Column({ type: 'timestamptz', nullable: true })
  arrivalIssueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  senderResponseBy: Date | null;

  // 'wait' | 'neighbour' | 'gate' | 'store' | 'auto_store'
  @Column({ type: 'varchar', length: 12, nullable: true })
  arrivalResolution: string | null;

  // Redirect transport fee owed when a failed delivery is rerouted to a
  // partner store. Store identity + collection details stay masked on
  // the tracking payload until it is settled (pay-to-release).
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  redirectFeeNgn: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  redirectFeePaidAt: Date | null;

  // Cancellation record (audit 2026-08-14). The apps quoted a fee off the
  // rate card and then only navigated away: nothing was stored and
  // nothing was charged. The fee is now priced server-side, kept here for
  // the receipt and for disputes, and withheld from the escrow refund.
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  cancellationFeeNgn: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  cancellationReason: string | null;

  // Requested pickup time for scheduled bookings; NULL = Send Now.
  // Before 2026-08-11 the client collected a slot but nothing stored
  // it: scheduled bookings dispatched immediately. Now the dispatch
  // cron holds matching until 15 minutes before this time, and the
  // night-fee window is evaluated against it.
  @Column({ type: 'timestamptz', nullable: true })
  scheduledFor: Date | null;

  // Night surcharge applied at booking (NGN, passed to the driver in
  // full). Kept as its own column so receipts + statements can show it
  // as a separate line and admin analytics can track night volume.
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  nightFeeNgn: number | null;

  // Vehicle the booking was placed for. Drives base fare + km rate.
  // Nullable for legacy rows that didn't capture this explicitly.
  @Column({ nullable: true })
  vehicleType: string;

  // Pricing - top-line totals. Detailed breakdown in priceBreakdown.
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  driverEarnings: number; // price minus platform commission

  @Column({ type: 'decimal', precision: 7, scale: 2, default: 0 })
  distanceKm: number;

  // Snapshot of the active RateCard at booking time. Future rate
  // changes don't alter historical prices. Nullable for legacy rows.
  @Column({ nullable: true })
  rateCardSnapshotId: string;

  // Full price breakdown so business + driver apps can show transparent
  // line items. Shape:
  //   { base, distance, fuel, stops, dwell, surcharges:{...}, discounts:{...},
  //     vat, total, driverEarnings:{base, distance, fuel, stops, dwell, surchargeShare} }
  @Column({ type: 'jsonb', nullable: true })
  priceBreakdown: any;

  // Time estimates computed at booking time. Drive minutes from Google
  // Directions; dwell minutes from category + weight + stops. Sum is
  // what we tell the driver to expect.
  @Column({ type: 'int', nullable: true })
  estimatedDriveMinutes: number;

  @Column({ type: 'int', nullable: true })
  estimatedDwellMinutes: number;

  @Column({ type: 'int', nullable: true })
  estimatedTotalMinutes: number;

  // The waypoint order Google Directions returned after `optimize:true|`.
  // Stored so we can reconstruct what was shown to the user at booking
  // even if the driver re-routes later.
  @Column({ type: 'jsonb', nullable: true })
  optimizedWaypointOrder: number[];

  @Column({ default: false })
  routeWasAutoOptimized: boolean;

  // Status
  @Index()
  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.PENDING })
  status: DeliveryStatus;

  // Source: which client/API created this delivery. Set at creation on the
  // server so it never lies. Backfilled to customer_app for legacy rows
  // (SYNC_DB adds the column with the default). Powers the admin channel
  // breakdown donut.
  @Index()
  @Column({ type: 'enum', enum: DeliverySource, default: DeliverySource.CUSTOMER_APP })
  source: DeliverySource;

  // Proof of delivery
  @Column({ nullable: true })
  proofPhotoUrl: string;

  @Column({ nullable: true })
  recipientSignature: string;

  // Timestamps for each status change
  @Column({ nullable: true })
  assignedAt: Date;

  @Column({ nullable: true })
  pickedUpAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  // Real start/finish for analytics + dwell-time tuning. `actualStartedAt`
  // is when the driver tapped "start trip" at pickup; `actualCompletedAt`
  // when the last stop flipped to delivered.
  @Column({ type: 'timestamp', nullable: true })
  actualStartedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  actualCompletedAt: Date;

  // Rating
  @Column({ nullable: true })
  customerRating: number;

  @Column({ nullable: true })
  customerComment: string;

  // Free-text instructions from the customer for the driver
  // (500 char cap enforced at DTO layer). Auto-inserted as the first
  // system message on ASSIGNED so drivers cannot miss it. Editable by
  // the customer while status is pending or assigned; frozen after
  // pickup.
  @Column({ type: 'varchar', length: 500, nullable: true })
  deliveryInstructions: string | null;

  // TTL policy: chat closes for writes 1hr after DELIVERED.
  // `chatReopenedUntil` overrides that: when an admin re-opens a
  // completed delivery's chat for a support investigation, this
  // timestamp is set to the reopen expiry and chat.service.send()
  // consults it before rejecting a write. NULL = default TTL policy
  // applies.
  @Column({ type: 'timestamptz', nullable: true })
  chatReopenedUntil: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
