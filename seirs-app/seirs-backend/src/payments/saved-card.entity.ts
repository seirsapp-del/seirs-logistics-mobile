import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Saved card belonging to a user.
 *
 * SEIRS NEVER stores raw card numbers. Flutterwave tokenizes the card on
 * first successful payment and returns a reusable token (string like
 * `flw_tok_abc123`). We persist the token + display metadata only — the
 * token is opaque to us; only Flutterwave can resolve it back to a card.
 *
 * Charges go through FlutterwaveService.chargeWithToken() — this keeps
 * SEIRS entirely out of PCI-DSS scope.
 *
 * Distinct from the `PaymentMethod` ENUM in payment.entity.ts (which lists
 * card / bank_transfer / mobile_money / wallet / cod choices for a payment).
 */
@Entity('saved_cards')
export class SavedCard {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  // Flutterwave's reusable card token. Treat as opaque + secret-ish — only
  // the backend uses it when initiating charges; never expose to clients.
  @Column({ name: 'flutterwave_token', type: 'varchar', length: 200 })
  flutterwaveToken!: string;

  @Column({ type: 'varchar', length: 4 })
  last4!: string;

  // 'visa' | 'mastercard' | 'verve' | 'amex' | etc — lowercase.
  @Column({ type: 'varchar', length: 20 })
  brand!: string;

  @Column({ name: 'exp_month', type: 'int' })
  expMonth!: number;

  @Column({ name: 'exp_year', type: 'int' })
  expYear!: number;

  @Column({ name: 'card_holder', type: 'varchar', length: 120, nullable: true })
  cardHolder!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
