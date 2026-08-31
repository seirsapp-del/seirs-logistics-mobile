import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * A negotiation over carrying one parcel on a declared trip.
 *
 * Built 2026-08-31 after the founder read the parcel posting shipped
 * earlier the same day and asked why the money moved first:
 *
 *   "thats why this is important to be done before they pay, because
 *    once they pay then its irreversible with deductions, like charges
 *    from bank etc"
 *
 * He was right, and the codebase already agreed with him. Seat bookings
 * have worked this way since Travel Buddy shipped: REQUESTED charges
 * nothing and holds nothing, the driver accepts, and only then does a
 * fare get quoted and a card touched. The parcel path was built on the
 * ordinary booking flow instead, so it charged, offered, and refunded on
 * a decline. A Flutterwave refund is not a reversal; it is a second
 * transaction with its own cost and delay, paid to undo something that
 * should never have been charged.
 *
 * The thing seats do NOT have, and this does, is a counter-offer. A
 * driver going to Jos who cannot reach the sender's exact drop point can
 * propose one they do pass. That changes the distance, so it changes the
 * price, so a counter is not a message: it is a re-quote the sender has
 * to accept on its own terms. That is the difference between a targeted
 * offer and an actual marketplace.
 */
export enum ParcelRequestStatus {
  /** Asked. Nothing charged, no capacity held, driver has not answered. */
  REQUESTED  = 'requested',
  /** Driver proposed different terms. The ball is back with the sender. */
  COUNTERED  = 'countered',
  /**
   * Agreed by both sides. A Delivery is created from this row and the
   * sender is sent to pay. The request rests here so the agreement and
   * the payment stay separate facts.
   */
  ACCEPTED   = 'accepted',
  /** Driver said no. Costs the sender nothing, which is the whole point. */
  DECLINED   = 'declined',
  /** Sender pulled it before an answer, or walked away from a counter. */
  WITHDRAWN  = 'withdrawn',
  /** Nobody answered in time. Released so the sender can ask elsewhere. */
  EXPIRED    = 'expired',
}

@Entity('parcel_requests')
@Index(['tripId', 'status'])
@Index(['senderUserId', 'status'])
export class ParcelRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tripId: string;

  @Column({ type: 'uuid' })
  senderUserId: string;

  @Column({ type: 'varchar', length: 20, default: ParcelRequestStatus.REQUESTED })
  status: ParcelRequestStatus;

  // ── What is being sent ───────────────────────────────────────────────
  @Column({ type: 'text' })
  pickupAddress: string;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  pickupLat: number;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  pickupLng: number;

  @Column({ type: 'text' })
  dropoffAddress: string;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  dropoffLat: number;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  dropoffLng: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  weightKg: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  categoryCode: string | null;

  @Column({ type: 'text', nullable: true })
  packageDescription: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  declaredValueNgn: number | null;

  /**
   * A partner counter the sender would rather it went to, instead of a
   * door. The founder's own example: a driver passing through, and a
   * sender who would rather collect from a shop near the route than have
   * the rider detour to their house.
   */
  @Column({ type: 'uuid', nullable: true })
  preferredStoreId: string | null;

  /**
   * What the sender needs the rider to know BEFORE agreeing, not after.
   * Instructions arriving post-acceptance are how a rider ends up bound
   * to something they would never have taken.
   */
  @Column({ type: 'text', nullable: true })
  senderInstructions: string | null;

  /** What the run would cost on the sender's own terms, quoted at request. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  quotedNgn: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  quotedKm: number | null;

  // ── The driver's counter ─────────────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  counterDropAddress: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  counterDropLat: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  counterDropLng: number | null;

  /** In the rider's words: why this point and not the one asked for. */
  @Column({ type: 'text', nullable: true })
  counterNote: string | null;

  /**
   * Re-quoted for the counter's distance. A counter that moved the drop
   * and kept the original price would be quoting a journey nobody is
   * making, and the sender must agree to the number they will actually
   * be charged.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  counterQuotedNgn: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  counterQuotedKm: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  counteredAt: Date | null;

  // ── Outcome ──────────────────────────────────────────────────────────
  @Column({ type: 'timestamptz', nullable: true })
  answeredAt: Date | null;

  @Column({ type: 'text', nullable: true })
  declineReason: string | null;

  /**
   * The booking this became, once both sides agreed and the sender was
   * sent to pay. Null until then, which is what keeps agreement and
   * payment separate.
   */
  @Column({ type: 'uuid', nullable: true })
  deliveryId: string | null;

  /**
   * When this stops waiting. An unanswered request must not sit on a
   * sender's screen forever while they could be asking somebody else.
   */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
