import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index,
  CreateDateColumn,
} from 'typeorm';
import { DriverTrip } from './driver-trip.entity';

/**
 * One point on a declared intercity trip.
 *
 * WHY this exists. A trip used to be two cities and a free-text pickup
 * note: fromCity, toCity, pickupAddress. That is not enough to price a
 * seat honestly or to let a passenger find the vehicle.
 *
 * Cities alone put every distance between city centres, so a passenger
 * boarding 20km outside Ibadan paid from the middle of Ibadan. And
 * "pick up along my route" told a passenger nothing about where to
 * stand, which the founder called out directly: a driver can wait
 * somewhere else and blame the passenger, and nobody can settle it
 * because no exact place was ever agreed.
 *
 * A trip is now a LINE with stops on it. Each stop carries:
 *   - a real address from the place picker, with coordinates
 *   - a city DERIVED from that address, so nobody files an Ibadan
 *     address under a Lagos label
 *   - an optional description, because "the filling station before the
 *     toll gate" is how people actually navigate here
 *   - its measured distance from the origin, which is what segment
 *     pricing charges against
 *
 * EVERY stop is declared BEFORE departure. The founder was explicit
 * about why: most people book days ahead, and a rider who only sets the
 * next pickup after each drop cannot plan the trip they are selling.
 */
@Entity('trip_stops')
@Index(['tripId', 'sequence'])
export class TripStop {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => DriverTrip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip!: DriverTrip;

  @Index()
  @Column({ name: 'trip_id', type: 'uuid' })
  tripId!: string;

  /**
   * Position along the route. 0 is the origin, the highest is the final
   * destination, and everything between is a stop in travel order.
   * Segment pricing and seat capacity both depend on this ordering, so
   * it is the sequence and never the created-at that defines the line.
   */
  @Column({ type: 'int' })
  sequence!: number;

  /**
   * Derived from the address, never typed independently.
   *
   * Two free-text fields would drift: somebody files an Ibadan address
   * under a Lagos label and the trip advertises a route it does not
   * drive. The city is what the browse list shows and what matching
   * reads, so it has to agree with the coordinates underneath it.
   */
  @Column({ type: 'varchar', length: 120 })
  city!: string;

  /** The full address as the place picker resolved it. */
  @Column({ type: 'varchar', length: 400 })
  address!: string;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  latitude!: number;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  longitude!: number;

  /**
   * The rider's own words about where to stand. "Under the bridge, by
   * the second bus stop." Optional, and never a substitute for the
   * coordinates: a description cannot settle a dispute, a pin can.
   */
  @Column({ type: 'varchar', length: 300, nullable: true })
  description!: string | null;

  /**
   * Road distance from the origin stop, in km.
   *
   * Measured once at declare time and stored, so a seat quoted today
   * cannot silently change price because a routing API answered
   * differently tomorrow. Segment pricing subtracts one stop's value
   * from another's, which is only sound if both came from the same
   * measurement.
   */
  @Column({ name: 'km_from_origin', type: 'numeric', precision: 8, scale: 2, default: 0 })
  kmFromOrigin!: number;

  /**
   * Set when the rider marks this stop reached. Frees any seat booked
   * only as far as here for the segments beyond it.
   */
  @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true })
  arrivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
