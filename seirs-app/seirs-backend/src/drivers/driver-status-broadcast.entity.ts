import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Driver } from './driver.entity';
import { Delivery } from '../deliveries/delivery.entity';

// Spec V8 §2.14 — three-tap driver status broadcast for flaky networks.
// Driver picks one of: network bad / stuck in traffic / need help.
// Persisted here so admin can review the trail; fans out via WS to
// admin room + active delivery room so the customer's tracking screen
// shows the message immediately.
export enum DriverStatusBroadcastType {
  NETWORK_BAD = 'network_bad',
  TRAFFIC     = 'traffic',
  NEED_HELP   = 'need_help',
}

@Entity('driver_status_broadcasts')
@Index(['driver', 'createdAt'])
export class DriverStatusBroadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Driver, { eager: false, onDelete: 'CASCADE' })
  driver: Driver;

  // Optional — broadcasts during an active trip are scoped to that
  // delivery so only that customer's tracking screen receives the WS.
  @ManyToOne(() => Delivery, { eager: false, nullable: true, onDelete: 'SET NULL' })
  delivery: Delivery | null;

  @Column({ type: 'enum', enum: DriverStatusBroadcastType })
  type: DriverStatusBroadcastType;

  // Last known GPS at the time of broadcast (driver may already be
  // offline by the time the queued message lands).
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng: number | null;

  // For admin / customer follow-up (e.g. "need help" → ops checks in).
  @Column({ nullable: true })
  acknowledgedAt: Date;

  @Column({ nullable: true })
  acknowledgedByUserId: string;

  @CreateDateColumn()
  createdAt: Date;
}
