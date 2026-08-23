import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Driver } from './driver.entity';

// Spec V8 §2.18 - driver declares an upcoming intercity trip. Matching
// service surfaces orphan packages whose pickup + dropoff lie along the
// declared corridor. Admin board (Spec V8 §3.12) catalogues active
// trips for ops to manually pair when auto-match misses.
export enum DriverTripStatus {
  ACTIVE    = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('driver_trips')
@Index(['status', 'departAt'])
export class DriverTrip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Driver, { eager: true, onDelete: 'CASCADE' })
  driver: Driver;

  @Column()
  fromCity: string;

  @Column()
  toCity: string;

  // Planned departure (driver-supplied, stored as UTC).
  @Column({ type: 'timestamptz' })
  departAt: Date;

  // Spare load the driver can take above their existing route - in kg.
  @Column({ type: 'decimal', precision: 7, scale: 2, default: 0 })
  spareCapacityKg: number;

  // ── Travel Buddy (founder 2026-08-23) ────────────────────────────────
  /** Whether this trip sells seats to passengers. */
  @Column({ type: 'boolean', default: false })
  acceptsPassengers: boolean;

  /** Seats offered: HARD-capped by the vehicle class at declaration. */
  @Column({ type: 'int', default: 0 })
  seatsTotal: number;

  @Column({ type: 'int', default: 0 })
  seatsBooked: number;

  @Column({ type: 'boolean', default: true })
  acceptsPackages: boolean;

  /** 'fixed' = one pickup point; 'along_route' = flexible on the way. */
  @Column({ type: 'varchar', length: 12, default: 'along_route' })
  pickupMode: 'fixed' | 'along_route';

  @Column({ type: 'varchar', length: 255, nullable: true })
  pickupAddress: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  pickupLat: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  pickupLng: number | null;

  /** Road km between the two cities, measured once at declaration. */
  @Column({ type: 'numeric', precision: 8, scale: 1, nullable: true })
  routeKm: number | null;

  @Column({ type: 'enum', enum: DriverTripStatus, default: DriverTripStatus.ACTIVE })
  status: DriverTripStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
