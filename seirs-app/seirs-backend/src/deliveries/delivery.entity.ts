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

  /**
   * What is being moved: a package, or a PERSON (founder 2026-08-22,
   * the Book-a-Ride rebuild). Rides reuse this whole pipeline: pricing
   * snapshot, matching, tracking, escrow, chat; the kind gates the
   * package-only surfaces (photos, per-package codes, category rules).
   */
  @Column({ type: 'varchar', length: 10, default: 'package' })
  kind: 'package' | 'ride';

  /**
   * Which states this run connects, resolved once at booking
   * (2026-08-31).
   *
   * The engine has worked both states out from coordinates since the
   * state-aware zone tier shipped, charged 15 to 40 percent on the
   * answer, and then thrown it away. So the surcharge a customer paid
   * could never be reconciled afterwards, admin could not filter or
   * report on interstate work, and the driver apps could not mark a job
   * as crossing a line because nothing downstream knew that it did.
   *
   * Two columns, written where the price is decided, so the states that
   * justified the charge are stored beside the charge itself. Null on
   * rows that predate this and on any booking whose coordinates fall
   * outside every state box, which is why nothing may assume they are
   * present.
   */
  @Column({ type: 'varchar', length: 2, nullable: true })
  pickupStateCode: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  dropoffStateCode: string | null;

  /**
   * Which tier of the zone table actually fired: intraStateLongHaul,
   * interStateAdjacent, interStateDistant, crossZone, or none. Stored as
   * the engine's own label so a receipt, an admin row and a dispute all
   * quote the same word for the same money.
   */
  @Column({ type: 'varchar', length: 30, nullable: true })
  zoneTier: string | null;

  /**
   * What that tier actually added, in naira (2026-08-31, same day).
   *
   * The tier NAME alone lets a screen say why a price rose but not by
   * how much, and the receipt's own rule is that a line is real or it is
   * absent: it will not invent an amount, and it should not have to.
   * Stored beside the tier so a receipt read months later itemises the
   * same number the sender agreed to at checkout.
   *
   * Only the business path ever wrote priceBreakdown, so the customer's
   * receipt had no itemisation to read at all. This column is written on
   * every booking, whichever app made it.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  zoneTierNgn: number | null;

  /**
   * Travel Buddy: when set, this booking belongs to a declared
   * intercity trip and dispatch assigns THAT driver, not the radius.
   */
  @Column({ type: 'uuid', nullable: true })
  tripId: string | null;

  /**
   * Seats held on that trip, for a Travel Buddy booking.
   *
   * The count lived only inside packageDescription as "Seat x1", so
   * nothing could give the seats back without parsing a sentence. An
   * abandoned unpaid booking therefore held its seat for ever: the
   * five-minute sweep that releases unpaid holds reads seat_bookings
   * rows, and this path never creates one (2026-08-29).
   */
  @Column({ type: 'int', nullable: true })
  seatCount: number | null;

  /** When the seat booking was offered to the declared driver. */
  @Column({ type: 'timestamptz', nullable: true })
  tripOfferedAt: Date | null;

  // Receiver system (founder 2026-08-11): Nigerians routinely have
  // neighbours/security collect packages. The sender names the receiver
  // at booking; the typed-name handoff check matches THIS first name
  // instead of the account holder's registered name when present.
  @Column({ type: 'varchar', length: 60, nullable: true })
  receiverFirstName: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  receiverLastName: string | null;

  // A number the driver can call at handoff. The customer app collected
  // no phone at all, so a driver at the door with a wrong flat number had
  // nothing to fall back on. The business flow already stores this per
  // stop (DeliveryStop.recipientPhone); this is the single-delivery twin.
  @Column({ type: 'varchar', length: 32, nullable: true })
  receiverPhone: string | null;

  /**
   * A rider raised a problem with this job, most often that the parcel in
   * front of them is not the parcel that was described.
   *
   * Deliberately NOT a DeliveryStatus. Status drives dispatch, the driver
   * app and every admin filter; adding a state to that enum would ripple
   * through all of them. A flag records the dispute without changing what
   * the delivery *is*, so support can act while the job keeps its place.
   */
  @Column({ type: 'timestamptz', nullable: true })
  disputedAt: Date | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  disputeReason: string | null;

  /** The rider's photo of what they were actually handed. */
  @Column({ type: 'text', nullable: true })
  disputePhotoUrl: string | null;

  /**
   * Where the rider actually was when this job was assigned to them.
   *
   * Nothing recorded this, so a rider claiming "I rode 15km to reach the
   * pickup" could not be checked against anything. Any compensation that
   * scales with distance ridden, and every dispute about a wasted trip,
   * needs a number that was written before the argument started.
   *
   * Captured from the match itself: the dispatcher already knows the
   * rider's position and its distance to the pickup at the moment it
   * chooses them.
   */
  @Column({ type: 'double precision', nullable: true })
  driverAcceptedLat: number | null;

  @Column({ type: 'double precision', nullable: true })
  driverAcceptedLng: number | null;

  /** Straight-line km from the rider to the pickup at assignment. */
  @Column({ type: 'double precision', nullable: true })
  driverAcceptedDistanceKm: number | null;

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



  // Who owes the redirect fee, which decides whether collection is
  // locked. 'receiver' when the package went to a counter because nobody
  // was home: they settle it and the store stays masked until they do.
  // 'sender' when the sender chose to send it to a counter, which is the
  // handling fee they were always meant to pay and never hides anything
  // from them.
  @Column({ type: 'varchar', length: 10, nullable: true })
  redirectFeePayer: string | null;



  // What the rider is owed for a trip that could not complete, on top of
  // nothing else. Set when a rider reports a problem, so the money is
  // decided at the moment they did the right thing rather than argued
  // about later. The accept-location capture proves the distance.
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  driverFailedTripNgn: number | null;

  // Set once a rider-reported dispute has been escalated for lack of a
  // support decision, so the sweep never escalates the same one twice.
  @Column({ type: 'timestamptz', nullable: true })
  disputeEscalatedAt: Date | null;



  // ── Return to sender (founder 2026-08-21) ───────────────────────────
  // Priced from wherever the package currently is back to the ORIGINAL
  // pickup. There is deliberately no "return address" column: the
  // destination is pickupAddress and cannot be edited, which is what
  // stops a return being used to buy a long delivery cheaply.
  @Column({ type: 'timestamptz', nullable: true })
  returnRequestedAt: Date | null;

  @Column({ type: 'varchar', length: 12, nullable: true })
  returnStatus: string | null;   // pending | approved | rejected | applied

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  returnQuoteNgn: number | null;

  @Column({ type: 'double precision', nullable: true })
  returnQuoteKm: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  returnDecidedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  returnDecidedBy: string | null;

  @Column({ type: 'text', nullable: true })
  returnDecisionNote: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  returnPaidAt: Date | null;



  // ── Disposal (Terms 8.4 / 8.5) ──────────────────────────────────────
  // Recorded by the rider with a photo, never by a timer. The evidence is
  // the whole point: disposing of someone else's property is the single
  // riskiest thing in this flow and "the clock ran out" is not a record.
  @Column({ type: 'timestamptz', nullable: true })
  disposedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  disposalPhotoUrl: string | null;

  @Column({ type: 'text', nullable: true })
  disposalNote: string | null;

  // When the sender ticked the Terms of Service box at review. The
  // checkbox used to gate the button and then vanish; a dispute needs
  // the timestamp, not a memory of a UI state (founder 2026-08-21).
  @Column({ type: 'timestamptz', nullable: true })
  termsAcceptedAt: Date | null;



  // ── Mid-delivery address change (founder 2026-08-21) ────────────────
  // A sender who gave the wrong address can ask for it to be corrected
  // while the rider is still carrying the package. Support decides;
  // approval alone does not move the package, the sender has to pay the
  // re-quoted leg first. One open request per delivery, which is why
  // these live on the row rather than in a side table.
  @Column({ type: 'timestamptz', nullable: true })
  addressChangeRequestedAt: Date | null;

  @Column({ type: 'varchar', length: 12, nullable: true })
  addressChangeStatus: string | null;   // pending | approved | rejected | applied

  @Column({ type: 'text', nullable: true })
  addressChangeNewAddress: string | null;

  @Column({ type: 'double precision', nullable: true })
  addressChangeNewLat: number | null;

  @Column({ type: 'double precision', nullable: true })
  addressChangeNewLng: number | null;

  // Priced from where the rider actually was when the request was made,
  // not from the original pickup.
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  addressChangeQuoteNgn: number | null;

  @Column({ type: 'double precision', nullable: true })
  addressChangeQuoteKm: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  addressChangeDecidedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  addressChangeDecidedBy: string | null;

  @Column({ type: 'text', nullable: true })
  addressChangeDecisionNote: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  addressChangePaidAt: Date | null;

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

  /**
   * When support was told this booking was sitting with no rider.
   *
   * A marker, not a timestamp anybody reads: the warning sweep runs every few
   * minutes, and without this it would re-raise the same alert every run
   * until the booking cancelled, which is how a queue becomes noise and then
   * becomes ignored. Set once, never cleared, because the booking either gets
   * a rider or gets cancelled.
   */
  @Column({ type: 'timestamptz', nullable: true })
  dispatchWarnedAt: Date | null;

  // Requested pickup time for scheduled bookings; NULL = Send Now.
  // Before 2026-08-11 the client collected a slot but nothing stored
  // it: scheduled bookings dispatched immediately. Now the dispatch
  // cron holds matching until 15 minutes before this time, and the
  // night-fee window is evaluated against it.
  @Column({ type: 'timestamptz', nullable: true })
  scheduledFor: Date | null;

  /**
   * Created by a recurring schedule (2026-09-06). Until today the flag
   * was passed on the DTO and silently dropped, because no column held
   * it: the app could not label the run, and the unpaid-run sweep
   * queried a column that did not exist. Columns are added by the
   * BusinessModule self-heal on boot.
   */
  @Column({ type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ type: 'uuid', nullable: true })
  recurringTemplateId: string | null;

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

  // How distanceKm was measured (2026-08-15): 'google' road distance,
  // 'calibrated' straight-line x learned zone factor, or raw 'haversine'.
  // Feeds the nightly circuity calibration, which only learns from rows
  // whose distance came from Google ground truth.
  @Column({ type: 'varchar', length: 16, nullable: true })
  quotedDistanceSource: string | null;

  // Traffic-aware drive time at quote time, minutes. Null when the quote
  // fell back to calibration (no route was fetched).
  @Column({ type: 'numeric', precision: 6, scale: 1, nullable: true })
  quotedDurationMin: number | null;

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

  /**
   * Set the moment the fare is actually secured (Flutterwave escrow HELD,
   * wallet drain, or COD hold). Dispatch is gated on it (2026-08-16):
   * before this, drivers could accept and deliver bookings whose payment
   * was never completed.
   */
  @Column({ type: 'timestamptz', nullable: true })
  paymentHeldAt: Date | null;

  /**
   * Counter the sender drops the packages at, for a driver to collect
   * (founder 2026-08-16). Distinct from a package's destination store:
   * this replaces the door pickup leg, so pickupAddress/Lat/Lng hold the
   * store's location and routing needs no special case. Null means an
   * ordinary door pickup.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  pickupStoreId: string | null;

  /**
   * Total paid to partner counters on this run (founder 2026-08-16).
   * Kept on the delivery so the receipt can show it as its own line and
   * partner payouts can be reconciled against what the sender actually
   * paid, even after the fee value is later edited in the catalogue.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  partnerHandlingNgn: number;

  /**
   * When loyalty earned on this delivery was reversed after a refund.
   * Doubles as the idempotency guard: the business ledger is a bare
   * counter with no per-entry history, so without this a second
   * cancellation pass would subtract the points twice.
   */
  @Column({ type: 'timestamptz', nullable: true })
  loyaltyClawedBackAt: Date | null;

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
