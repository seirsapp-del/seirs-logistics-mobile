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

/**
 * What a payment row is FOR (2026-08-12). Until this existed, every
 * payment attached to a delivery was assumed to be the delivery fare:
 * a second charge on the same delivery (e.g. the failed-delivery
 * redirect fee) would have been picked up by escrow release and paid
 * out to the driver, and would have awarded loyalty points a second
 * time. Escrow paths filter on DELIVERY explicitly.
 */
export enum PaymentPurpose {
  DELIVERY     = 'delivery',      // the fare: escrow-held, released to driver
  REDIRECT_FEE = 'redirect_fee',  // failed-delivery reroute to a partner store
  // Re-quoted leg when support approves a mid-delivery address change.
  ADDRESS_CHANGE = 'address_change',
  // The ₦100 charge that exists only to tokenize a card, refunded
  // immediately. Before 2026-08-14 these rows fell through to the
  // DELIVERY default, so the webhook put a verification charge into
  // escrow as though it were a fare.
  CARD_VERIFICATION = 'card_verify',
  /**
   * A partner store drop-off, which has no Delivery behind it when the
   * sender pays: the driver leg is only created once the counter takes
   * the package in. The drop-off id travels in providerReference meta
   * and dropoffId instead of the delivery relation.
   */
  STORE_DROPOFF = 'store_dropoff',
  /** The difference owed when the counter weighs heavier than declared. */
  STORE_TOPUP   = 'store_topup',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn()
  customer: User;

  /** Set for STORE_DROPOFF / STORE_TOPUP, which have no delivery yet. */
  @Column({ type: 'uuid', nullable: true })
  dropoffId: string | null;

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

  // Defaults to DELIVERY so every historical row keeps its meaning.
  @Column({ type: 'varchar', length: 16, default: PaymentPurpose.DELIVERY })
  purpose: PaymentPurpose;

  // Flutterwave tx_ref (used for verification and refunds)
  @Column({ nullable: true })
  providerReference: string;

  // Flutterwave numeric transaction ID (needed for issuing refunds)
  @Column({ nullable: true, type: 'bigint' })
  flutterwaveTransactionId: number;

  // Which provider processed this payment
  @Column({ nullable: true })
  provider: string; // 'flutterwave' | 'internal'

  // Hosted payment page URL returned by Flutterwave
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
