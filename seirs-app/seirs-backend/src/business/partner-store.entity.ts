import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('partner_stores')
export class PartnerStore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  storeName: string;

  @Column({ default: '' })
  storeAddress: string;

  @Column({ default: '' })
  phone: string;

  @Column({ default: 50 })
  maxCapacity: number;

  @Column({ type: 'jsonb', default: () => "'[\"Mon\",\"Tue\",\"Wed\",\"Thu\",\"Fri\",\"Sat\"]'" })
  operatingDays: string[];

  @Column({ default: '08:00' })
  openTime: string;

  @Column({ default: '18:00' })
  closeTime: string;

  @Column({ default: true })
  notifyNewPackage: boolean;

  @Column({ default: true })
  notifyPickup: boolean;

  @Column({ default: true })
  notifyPayout: boolean;

  @Column({ default: 'active' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
