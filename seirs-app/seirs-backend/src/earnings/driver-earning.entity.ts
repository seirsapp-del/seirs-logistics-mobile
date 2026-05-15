import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';

/**
 * Driver earnings ledger.
 *
 * One row per completed delivery. Tracks the money SEIRS owes a driver and
 * its lifecycle from earned → paid out via Flutterwave Transfers.
 *
 * SEIRS does NOT hold this money — it sits in the SEIRS company bank
 * account (received from Flutterwave settlement) and is liability-tracked
 * in this ledger. On payout day, a Flutterwave Transfer moves it from
 * SEIRS bank to the driver's verified bank account.
 *
 * State machine:
 *   pending   → delivery completed, dispute window still open
 *   available → dispute window expired, ready to pay out
 *   paid      → Flutterwave Transfer succeeded, money in driver's bank
 *   held      → fraud review or active customer dispute, payout blocked
 *
 * See docs/payments-spec.md §⑥.
 */
export type DriverEarningStatus = 'pending' | 'available' | 'paid' | 'held';

@Entity('driver_earnings')
export class DriverEarning {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'driver_id' })
  driver!: User;

  @Index()
  @Column({ name: 'driver_id', type: 'uuid' })
  driverId!: string;

  @ManyToOne(() => Delivery, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'delivery_id' })
  delivery!: Delivery;

  @Index()
  @Column({ name: 'delivery_id', type: 'uuid' })
  deliveryId!: string;

  // Amount the customer paid (gross). Naira, decimal — supports kobo.
  @Column({ name: 'gross_amount', type: 'decimal', precision: 12, scale: 2 })
  grossAmount!: string;

  // SEIRS' commission cut (default 25%, configurable per scenario).
  @Column({ name: 'seirs_cut', type: 'decimal', precision: 12, scale: 2 })
  seirsCut!: string;

  // Driver's net earnings on this delivery. = grossAmount - seirsCut - flutterwave fee
  @Column({ name: 'driver_net', type: 'decimal', precision: 12, scale: 2 })
  driverNet!: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: DriverEarningStatus;

  // When the dispute window expires and pending → available.
  @Column({ name: 'available_at', type: 'timestamptz' })
  availableAt!: Date;

  // When Flutterwave Transfer succeeded.
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  // Flutterwave's Transfer ID once payout fires. Used for idempotency
  // and reconciliation against the Transfers webhook.
  @Column({ name: 'flutterwave_transfer_id', type: 'varchar', length: 100, nullable: true })
  flutterwaveTransferId!: string | null;

  // Reason if status='held'. Free-text from admin or fraud system.
  @Column({ name: 'hold_reason', type: 'text', nullable: true })
  holdReason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
