import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('partner_payouts')
export class PartnerPayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  partnerStoreId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ default: 'pending' })
  status: 'pending' | 'processing' | 'paid';

  @Column()
  period: string;

  @Column({ nullable: true })
  paidAt: Date;

  /**
   * Where it actually went, snapshotted at the moment it was sent.
   *
   * Snapshotted rather than joined, because a shop can change its account
   * afterwards and a payout record has to say where the money went, not
   * where the next one would go. The driver ledger learned this the same
   * way.
   */
  @Column({ nullable: true })
  paidToBankName: string;

  @Column({ nullable: true })
  paidToAccountNumber: string;

  @Column({ nullable: true })
  paidToAccountName: string;

  /**
   * Our idempotency key, and the string to search for in the provider's
   * own dashboard when somebody asks where their money is.
   */
  @Index()
  @Column({ nullable: true })
  transferReference: string;

  @Column({ nullable: true })
  providerTransferId: string;

  /**
   * Why a transfer did not happen.
   *
   * A refused transfer must never read as paid. The status stays
   * 'pending' and this says what the provider said, so a failure is
   * visible and retryable rather than silently absorbed. Four transfers
   * were refused over IP whitelisting on 2026-08-27 and that is exactly
   * the case this exists for.
   */
  @Column({ type: 'text', nullable: true })
  failureReason: string;

  @CreateDateColumn()
  createdAt: Date;
}
