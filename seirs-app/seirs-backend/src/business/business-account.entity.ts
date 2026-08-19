import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum BusinessAccountStatus {
  ACTIVE   = 'active',
  SUSPENDED = 'suspended',
}

@Entity('business_accounts')
export class BusinessAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyName: string;

  @Column({ nullable: true })
  rcNumber: string;

  @Column()
  businessAddress: string;

  // Structured address parts (2026-05-11) - let dispatch index by state
  // and compute zone surcharges without re-parsing businessAddress.
  // Nullable so existing rows continue to work.
  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  streetAddress: string;

  @Column({ default: BusinessAccountStatus.ACTIVE })
  status: BusinessAccountStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  walletBalance: number;

  @Column({ type: 'int', default: 0 })
  loyaltyPoints: number;

  @Column()
  ownerId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
