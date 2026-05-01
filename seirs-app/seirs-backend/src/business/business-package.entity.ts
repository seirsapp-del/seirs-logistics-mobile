import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum PackageStatus {
  IN_STORE        = 'in_store',
  AWAITING_PICKUP = 'awaiting_pickup',
  COLLECTED       = 'collected',
  RETURNED        = 'returned',
}

@Entity('business_packages')
export class BusinessPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ unique: true })
  trackingNumber: string;

  @Index()
  @Column({ unique: true })
  qrCode: string;

  @Column()
  recipientName: string;

  @Column({ default: '' })
  recipientPhone: string;

  @Index()
  @Column({ type: 'enum', enum: PackageStatus, default: PackageStatus.IN_STORE })
  status: PackageStatus;

  @Index()
  @Column()
  partnerStoreId: string;

  @Column({ nullable: true })
  businessAccountId: string;

  @Column({ nullable: true })
  deliveryId: string;

  @CreateDateColumn()
  arrivedAt: Date;

  @Column({ nullable: true })
  collectedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
