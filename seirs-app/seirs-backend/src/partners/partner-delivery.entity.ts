import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Partner } from './partner.entity';
import { Delivery } from '../deliveries/delivery.entity';

export enum PartnerDeliveryStatus {
  SUBMITTED   = 'submitted',
  CONFIRMED   = 'confirmed',
  IN_TRANSIT  = 'in_transit',
  DELIVERED   = 'delivered',
  FAILED      = 'failed',
  CANCELLED   = 'cancelled',
}

@Entity('partner_deliveries')
export class PartnerDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Partner, { eager: true })
  @JoinColumn()
  partner: Partner;

  @ManyToOne(() => Delivery, { eager: false })
  @JoinColumn()
  delivery: Delivery;

  // Partner's own reference/tracking ID
  @Column({ nullable: true })
  partnerTrackingId: string;

  @Column({ nullable: true })
  partnerTrackingUrl: string;

  // Price the partner quoted (before markup)
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  partnerQuotePrice: number;

  @Column({ type: 'enum', enum: PartnerDeliveryStatus, default: PartnerDeliveryStatus.SUBMITTED })
  status: PartnerDeliveryStatus;

  @Column({ nullable: true })
  failureReason: string;

  // Raw response from partner API for debugging
  @Column({ type: 'jsonb', nullable: true })
  lastApiResponse: object;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
