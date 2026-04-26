import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';

export enum VehicleType {
  BICYCLE    = 'bicycle',
  MOTORCYCLE = 'motorcycle',
  TRICYCLE   = 'tricycle',
  CAR        = 'car',
  VAN        = 'van',
}

export enum DriverStatus {
  PENDING   = 'pending',   // awaiting KYC review
  APPROVED  = 'approved',
  SUSPENDED = 'suspended',
  REJECTED  = 'rejected',
}

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { eager: true })
  @JoinColumn()
  user: User;

  @Column({ type: 'enum', enum: VehicleType })
  vehicleType: VehicleType;

  @Column({ nullable: true })
  vehiclePlate: string;

  @Column({ type: 'enum', enum: DriverStatus, default: DriverStatus.PENDING })
  status: DriverStatus;

  @Column({ default: false })
  isOnline: boolean;

  // Last known GPS position
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lastLat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  lastLng: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;        // 0.00 – 5.00

  @Column({ default: 0 })
  totalDeliveries: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  walletBalance: number; // in local currency (kobo/pesewas stored as decimal)

  // KYC documents
  @Column({ nullable: true })
  idDocumentUrl: string;

  @Column({ nullable: true })
  vehicleDocumentUrl: string;

  @OneToMany(() => Delivery, (d) => d.driver)
  deliveries: Delivery[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
