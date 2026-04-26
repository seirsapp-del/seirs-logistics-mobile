import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';

export enum PaymentStatus {
  PENDING   = 'pending',
  SUCCESS   = 'success',
  FAILED    = 'failed',
  REFUNDED  = 'refunded',
  CANCELLED = 'cancelled',
}

export enum PaymentMethod {
  CARD         = 'card',
  BANK         = 'bank_transfer',
  MOBILE_MONEY = 'mobile_money',
  WALLET       = 'wallet',
  COD          = 'cash_on_delivery',
}

export enum EscrowStatus {
  HELD     = 'held',      // funds locked, awaiting delivery
  RELEASED = 'released',  // delivery confirmed → paid to driver
  REFUNDED = 'refunded',  // delivery failed → returned to customer
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn()
  customer: User;

  @ManyToOne(() => Delivery, { eager: false, nullable: true })
  @JoinColumn()
  delivery: Delivery;

  // Amount in kobo (100 kobo = ₦1)
  @Column({ type: 'bigint' })
  amountKobo: number;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'enum', enum: EscrowStatus, nullable: true })
  escrowStatus: EscrowStatus;

  // Provider reference (Paystack/Flutterwave transaction ID)
  @Column({ nullable: true })
  providerReference: string;

  // Which provider processed this payment
  @Column({ nullable: true })
  provider: string; // 'paystack' | 'flutterwave' | 'internal'

  // Authorization URL to redirect customer to (Paystack)
  @Column({ nullable: true })
  authorizationUrl: string;

  @Column({ nullable: true })
  failureReason: string;

  @Column({ nullable: true })
  releasedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
