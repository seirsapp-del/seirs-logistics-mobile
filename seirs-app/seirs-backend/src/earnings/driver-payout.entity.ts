import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * One row per bank transfer that actually left SEIRS.
 *
 * WHY this exists. Nothing recorded money leaving. Payouts were inferred
 * from driver_earnings rows carrying status='paid', and every admin
 * figure was built by summing driverNet over those rows. That is what a
 * rider EARNED, not what SEIRS SENT, and the two differ by the
 * new-rider holdback.
 *
 * The platform's first real payout on 2026-08-27 transferred 1,322.71
 * and the Wallet and Payouts screen reported 1,469.68 against it, with
 * "Paid Out (MTD)" overstated by the same 146.97. The books disagreed
 * with the bank on the very first transfer, and there was no third place
 * to check, because the only record of the transfer was a Flutterwave id
 * stamped on an earnings row.
 *
 * "1 transfers" on that screen was also not a count of transfers. It was
 * a count of earning rows marked paid, so one withdrawal spanning three
 * deliveries would have read as three.
 *
 * This table is the ledger of outbound money: what was asked for, what
 * was actually sent, what was withheld, and the provider reference that
 * ties it to the Flutterwave dashboard. Reconciliation reads from here.
 */
@Entity('driver_payouts')
export class DriverPayout {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'driver_id', type: 'uuid' })
  driverId!: string;

  /** Rider's name at the time of payout, so history survives a rename. */
  @Column({ name: 'driver_name', type: 'varchar', length: 200, nullable: true })
  driverName!: string | null;

  /** What the rider asked to withdraw. */
  @Column({ name: 'requested_ngn', type: 'decimal', precision: 12, scale: 2 })
  requestedNgn!: string;

  /** What Flutterwave was actually asked to send. This is the money that left. */
  @Column({ name: 'sent_ngn', type: 'decimal', precision: 12, scale: 2 })
  sentNgn!: string;

  /** Held back and returned to the rider's balance, not sent. */
  @Column({ name: 'holdback_ngn', type: 'decimal', precision: 12, scale: 2, default: 0 })
  holdbackNgn!: string;

  /** Our idempotency reference, also searchable in the Flutterwave dashboard. */
  @Index({ unique: true })
  @Column({ name: 'reference', type: 'varchar', length: 200 })
  reference!: string;

  @Column({ name: 'flutterwave_transfer_id', type: 'varchar', length: 100, nullable: true })
  flutterwaveTransferId!: string | null;

  /** How many earning rows this single transfer settled. */
  @Column({ name: 'earning_count', type: 'int', default: 0 })
  earningCount!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
