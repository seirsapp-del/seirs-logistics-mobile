import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Driver } from '../drivers/driver.entity';

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

  // Dropoff
  @Column()
  dropoffAddress: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  dropoffLat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  dropoffLng: number;

  // Package details
  @Column()
  packageDescription: string;

  @Column({ type: 'enum', enum: PackageSize, default: PackageSize.SMALL })
  packageSize: PackageSize;

  @Column({ default: false })
  isFragile: boolean;

  @Column({ type: 'enum', enum: UrgencyLevel, default: UrgencyLevel.STANDARD })
  urgency: UrgencyLevel;

  // Pricing
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  driverEarnings: number; // price minus platform commission

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  distanceKm: number;

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
