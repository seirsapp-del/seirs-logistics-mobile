import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
  CreateDateColumn,
} from 'typeorm';
import { SeatBooking } from './seat-booking.entity';

/**
 * Every kind of thing worth writing down about a seat booking.
 *
 * Kept as a plain string column rather than a Postgres enum: production
 * runs with schema sync off, and a Postgres enum has to be ALTERed by
 * hand before the first insert using a new label, which is exactly how
 * a new event type would take the whole flow down on deploy.
 */
export type SeatBookingEventType =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'paid'
  | 'payment_expired'
  | 'capacity_lost'
  | 'arrived'
  | 'contact_attempt'
  | 'departed_no_show'
  | 'boarded'
  | 'dropped'
  | 'drop_confirmed'
  | 'drop_disputed'
  | 'cancelled';

/**
 * The evidence trail behind a seat booking.
 *
 * WHY this exists. A forfeited fare WILL be disputed. The passenger says
 * they were there and the vehicle left early; the rider says they waited
 * the full window and nobody came. Without a record that is one person's
 * word against another and support has nothing to check, so whoever
 * complains loudest wins and the honest side of the argument learns not
 * to bother.
 *
 * So each step writes a row here with the time, the actor and, where it
 * matters, a GPS fix: the rider at the stop, every attempt to reach the
 * passenger, and the moment of departure. Contact attempts are plural
 * and unbounded, which is the other reason this is a table and not a
 * handful of columns on the booking.
 *
 * Contact is push and in-trip chat ONLY. SMS is a standing deferred
 * decision at SEIRS and there is no SMS channel to record here.
 */
@Entity('seat_booking_events')
@Index(['bookingId', 'createdAt'])
export class SeatBookingEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => SeatBooking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking!: SeatBooking;

  @Index()
  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: SeatBookingEventType;

  /** 'driver', 'passenger' or 'system'. Who caused this to be written. */
  @Column({ name: 'actor_role', type: 'varchar', length: 16 })
  actorRole!: 'driver' | 'passenger' | 'system';

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  /**
   * Where the actor was, when a position is part of the evidence.
   *
   * The rider's fix at the stop is the whole point of the arrival
   * record: "I was there" is a claim, a coordinate at a timestamp is
   * something a reviewer can compare against the declared stop.
   */
  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  lat!: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  lng!: number | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  /** Channel of a contact attempt, distances, deadlines: shape varies. */
  @Column({ type: 'jsonb', nullable: true })
  meta!: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
