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
}

/**
 * One drop-off in a multi-stop booking. A booking with N stops has N
 * `DeliveryStop` rows linked to a single `Delivery`. Single-stop bookings
 * may still have one DeliveryStop row (cleaner) or store dropoff on the
 * Delivery itself (legacy single-leg path); the dispatcher reads stops
 * if present, falls back to delivery.dropoffAddress otherwise.
 *
 * `sequenceOrder` is the visit order — set either by the user or by
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

  @Column()
  address: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lng: number;

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

  // Proof of delivery — photo URLs (R2) + optional signature.
  @Column({ type: 'jsonb', nullable: true })
  proofPhotoUrls: string[];

  @Column({ nullable: true })
  recipientSignatureUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
