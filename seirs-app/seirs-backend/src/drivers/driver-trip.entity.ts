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

// Spec V8 §2.18 — driver declares an upcoming intercity trip. Matching
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

  // Spare load the driver can take above their existing route — in kg.
  @Column({ type: 'decimal', precision: 7, scale: 2, default: 0 })
  spareCapacityKg: number;

  @Column({ type: 'enum', enum: DriverTripStatus, default: DriverTripStatus.ACTIVE })
  status: DriverTripStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
