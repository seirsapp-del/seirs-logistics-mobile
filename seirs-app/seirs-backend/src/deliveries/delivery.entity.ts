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

  // Service category code (FK to ServiceCategory.code) — drives suggested
  // vehicle, dwell time, and category surcharges. Nullable for legacy
  // bookings created before the catalog existed.
  @Column({ nullable: true })
  categoryCode: string;

  // Total weight in kg. Required for new bookings — drives dwell tier,
  // vehicle safety rules, and pricing. Nullable for legacy rows.
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  weightKg: number;

  // Vehicle the booking was placed for. Drives base fare + km rate.
  // Nullable for legacy rows that didn't capture this explicitly.
  @Column({ nullable: true })
  vehicleType: string;

  // Pricing — top-line totals. Detailed breakdown in priceBreakdown.
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
