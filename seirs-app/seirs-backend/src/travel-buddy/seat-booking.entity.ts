import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { DriverTrip } from '../drivers/driver-trip.entity';
import { TripStop } from '../drivers/trip-stop.entity';
import { User } from '../users/user.entity';

/**
 * Where a seat booking is in its life.
 *
 * The order matters, because money moves LAST. Before this existed a
 * passenger paid the moment they tapped Book, so a driver who declined
 * turned their booking into a refund they had to chase. Nobody should
 * have to chase money back out of a system that took it before anyone
 * agreed to carry them.
 */
export enum SeatBookingStatus {
  /** Asked for a segment. Nothing is charged and no seat is held. */
  REQUESTED       = 'requested',
  /**
   * The driver said yes.
   *
   * The row does not REST here: accept stamps acceptedAt and moves
   * straight to PENDING_PAYMENT, because the next thing that has to
   * happen is always the fare. The value exists because agreement and
   * "we are waiting on your card" are genuinely different facts, and a
   * later flow that agrees without charging immediately needs somewhere
   * to sit that is not a lie.
   */
  ACCEPTED        = 'accepted',
  /** Agreed, fare quoted, waiting on the card. Holds NO seat. */
  PENDING_PAYMENT = 'pending_payment',
  /** Money landed. This is the first status that holds a seat. */
  BOOKED          = 'booked',
  /** Physically aboard. Still holds the seat. */
  BOARDED         = 'boarded',
  /** Off at their stop. Frees the seat for every segment beyond it. */
  DROPPED         = 'dropped',
  /** Ended before it ran. Holds nothing. */
  CANCELLED       = 'cancelled',
  /**
   * Did not turn up before the clock ran out.
   *
   * Still HOLDS the seat all the way to their alight stop, deliberately.
   * The vehicle already committed to carrying that space empty and the
   * fare is forfeit, so reselling it would charge two people for one
   * seat on the same stretch of road.
   */
  NO_SHOW         = 'no_show',
}

/**
 * The statuses that actually occupy a seat on a segment.
 *
 * REQUESTED and PENDING_PAYMENT are absent on purpose: until payment
 * lands the segment stays sellable, so an unpaid request cannot quietly
 * block capacity while somebody thinks about their card. DROPPED and
 * CANCELLED are absent because the seat is physically free again.
 */
export const SEAT_HOLDING_STATUSES: SeatBookingStatus[] = [
  SeatBookingStatus.BOOKED,
  SeatBookingStatus.BOARDED,
  SeatBookingStatus.NO_SHOW,
];

/**
 * One passenger's claim on ONE SEGMENT of a declared trip.
 *
 * WHY this exists. A trip carried two counters, seatsTotal and
 * seatsBooked, and nothing recorded where anybody got on or off. Two
 * things followed from that, and both cost real money.
 *
 * First, price. bookTripSeats charged trip.routeKm, the driver's WHOLE
 * route. On an Ibadan to Abuja run that is 605km, so a passenger going
 * only as far as Osogbo, 90km, paid for 605. Nobody sane pays six times
 * the fare of the bus beside them.
 *
 * Second, capacity. When that passenger got out at Osogbo, seatsBooked
 * did not move, so a physically empty seat could not be sold to someone
 * standing in Lokoja. The vehicle drove the rest of the country with a
 * seat that existed, was empty, and was unsellable.
 *
 * A booking is therefore a segment: board stop, alight stop, and the
 * measured distance between them. Capacity is asked per segment rather
 * than per trip, which is the single change that lets Osogbo free a
 * seat for Lokoja.
 */
@Entity('seat_bookings')
@Index(['tripId', 'status'])
@Index(['passengerId', 'status'])
export class SeatBooking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => DriverTrip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip!: DriverTrip;

  @Index()
  @Column({ name: 'trip_id', type: 'uuid' })
  tripId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'passenger_id' })
  passenger!: User;

  @Column({ name: 'passenger_id', type: 'uuid' })
  passengerId!: string;

  /** Where they get on. Chosen from the driver's DECLARED stops. */
  @ManyToOne(() => TripStop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_stop_id' })
  boardStop!: TripStop;

  @Column({ name: 'board_stop_id', type: 'uuid' })
  boardStopId!: string;

  /** Where they get off. Must be further along the line than board. */
  @ManyToOne(() => TripStop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alight_stop_id' })
  alightStop!: TripStop;

  @Column({ name: 'alight_stop_id', type: 'uuid' })
  alightStopId!: string;

  /**
   * The two stop positions, copied here at request time.
   *
   * Denormalised deliberately. Per-segment capacity is a range-overlap
   * question asked on every request, accept and payment, and answering
   * it from these two integers is a plain comparison instead of two
   * joins back to trip_stops for every candidate booking. The stops are
   * declared once before departure and never renumbered, so the copy
   * cannot drift from its source.
   */
  @Column({ name: 'board_sequence', type: 'int' })
  boardSequence!: number;

  @Column({ name: 'alight_sequence', type: 'int' })
  alightSequence!: number;

  @Column({ type: 'int', default: 1 })
  seats!: number;

  /**
   * alight.kmFromOrigin minus board.kmFromOrigin.
   *
   * Both figures came from the same measurement taken once at declare
   * time, which is the only reason subtracting them is sound: a fare
   * quoted today cannot move because a routing API answered differently
   * tomorrow.
   */
  @Column({ name: 'segment_km', type: 'numeric', precision: 8, scale: 2 })
  segmentKm!: number;

  /**
   * The fare, priced off segmentKm and never off trip.routeKm.
   *
   * Two decimals, to the kobo, so the passenger's card charge, the
   * driver's share and the platform's cut reconcile exactly instead of
   * drifting a naira at a time through rounding.
   */
  @Column({ name: 'price_ngn', type: 'numeric', precision: 12, scale: 2, default: 0 })
  priceNgn!: number;

  @Column({ name: 'driver_earnings_ngn', type: 'numeric', precision: 12, scale: 2, default: 0 })
  driverEarningsNgn!: number;

  /** 'small' or 'large'. Large costs a luggage fee from the rate card. */
  @Column({ type: 'varchar', length: 12, nullable: true })
  luggage!: string | null;

  @Column({ type: 'varchar', length: 20, default: SeatBookingStatus.REQUESTED })
  status!: SeatBookingStatus;

  /**
   * The passenger's own words about where they will be standing.
   *
   * The stop has coordinates, which is what settles an argument, but
   * "by the second gate, in a red top" is how two people who have never
   * met actually find each other in a motor park before dawn.
   */
  @Column({ name: 'passenger_note', type: 'varchar', length: 300, nullable: true })
  passengerNote!: string | null;

  /** The driver's reply in kind: where they will actually pull in. */
  @Column({ name: 'driver_note', type: 'varchar', length: 300, nullable: true })
  driverNote!: string | null;

  /**
   * The delivery row that carries this seat's money and job.
   *
   * Created at the pay step, not at request: escrow, the driver's job
   * list, tracking and the chat all hang off a Delivery, and there is
   * no reason to mint one for a request the driver may decline.
   */
  @Column({ name: 'delivery_id', type: 'uuid', nullable: true })
  deliveryId!: string | null;

  // Timestamps: one per transition, because a forfeited fare WILL be
  // disputed and support has to be able to check a sequence of events
  // rather than take one person's word for it.

  @Column({ name: 'requested_at', type: 'timestamptz', nullable: true })
  requestedAt!: Date | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'declined_at', type: 'timestamptz', nullable: true })
  declinedAt!: Date | null;

  /**
   * When an accepted-but-unpaid request stops being honoured.
   *
   * A Fee Catalogue window, not a literal, so ops can widen it on a
   * bad-network day without a deploy.
   */
  @Column({ name: 'payment_due_at', type: 'timestamptz', nullable: true })
  paymentDueAt!: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'boarded_at', type: 'timestamptz', nullable: true })
  boardedAt!: Date | null;

  @Column({ name: 'board_lat', type: 'numeric', precision: 10, scale: 7, nullable: true })
  boardLat!: number | null;

  @Column({ name: 'board_lng', type: 'numeric', precision: 10, scale: 7, nullable: true })
  boardLng!: number | null;

  @Column({ name: 'dropped_at', type: 'timestamptz', nullable: true })
  droppedAt!: Date | null;

  @Column({ name: 'drop_lat', type: 'numeric', precision: 10, scale: 7, nullable: true })
  dropLat!: number | null;

  @Column({ name: 'drop_lng', type: 'numeric', precision: 10, scale: 7, nullable: true })
  dropLng!: number | null;

  /**
   * How far the drop was marked from the alight stop, in metres.
   *
   * Marking a drop away from the stop is ALLOWED: roads close, a park
   * moves, a passenger asks to get out early. It is recorded rather
   * than refused, because refusing it would strand a rider mid-journey
   * to satisfy a rule, and the distance is what a reviewer needs when
   * the passenger says they were never dropped at all.
   */
  @Column({ name: 'drop_distance_m', type: 'numeric', precision: 10, scale: 2, nullable: true })
  dropDistanceM!: number | null;

  /** Set when the drop was marked beyond the admin-tunable geofence. */
  @Column({ name: 'drop_off_geofence', type: 'boolean', default: false })
  dropOffGeofence!: boolean;

  /**
   * The passenger's own confirmation that they really did get out.
   *
   * The third anti-abuse control, and the only one the rider cannot
   * produce alone. A rider who marks a passenger dropped while they are
   * still aboard would otherwise free a seat they could sell twice.
   * An unconfirmed drop does NOT block the rider: it goes to a review
   * queue, because stopping a vehicle mid-journey over an unanswered
   * phone punishes the wrong person.
   */
  @Column({ name: 'drop_confirmed_at', type: 'timestamptz', nullable: true })
  dropConfirmedAt!: Date | null;

  @Column({ name: 'drop_disputed_at', type: 'timestamptz', nullable: true })
  dropDisputedAt!: Date | null;

  @Column({ name: 'drop_review_reason', type: 'varchar', length: 200, nullable: true })
  dropReviewReason!: string | null;

  // The no-show clock and its evidence.

  /** When the rider marked themselves at the board stop. Starts the clock. */
  @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true })
  arrivedAt!: Date | null;

  @Column({ name: 'arrived_lat', type: 'numeric', precision: 10, scale: 7, nullable: true })
  arrivedLat!: number | null;

  @Column({ name: 'arrived_lng', type: 'numeric', precision: 10, scale: 7, nullable: true })
  arrivedLng!: number | null;

  /**
   * When the rider may leave without the passenger. Visible to BOTH,
   * because a countdown only one side can see is not a fair warning.
   */
  @Column({ name: 'no_show_deadline_at', type: 'timestamptz', nullable: true })
  noShowDeadlineAt!: Date | null;

  @Column({ name: 'no_show_at', type: 'timestamptz', nullable: true })
  noShowAt!: Date | null;

  @Column({ name: 'departed_lat', type: 'numeric', precision: 10, scale: 7, nullable: true })
  departedLat!: number | null;

  @Column({ name: 'departed_lng', type: 'numeric', precision: 10, scale: 7, nullable: true })
  departedLng!: number | null;

  /** How many times the rider reached out before leaving. Push and chat only. */
  @Column({ name: 'contact_attempts', type: 'int', default: 0 })
  contactAttempts!: number;

  // Ending it.

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancellation_reason', type: 'varchar', length: 200, nullable: true })
  cancellationReason!: string | null;

  /** What was actually sent back, to the kobo. */
  @Column({ name: 'refund_ngn', type: 'numeric', precision: 12, scale: 2, nullable: true })
  refundNgn!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
