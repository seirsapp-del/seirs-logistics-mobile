import {
  Entity, PrimaryGeneratedColumn, Column,
  OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { eager: true })
  @JoinColumn()
  user: User;

  // Balance in smallest currency unit (kobo for NGN, pesewas for GHS)
  // Stored as integer to avoid floating-point errors
  @Column({ type: 'bigint', default: 0 })
  balanceKobo: number;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ default: true })
  isActive: boolean;

  // Bank account for withdrawals (driver only)
  @Column({ nullable: true })
  bankName: string;

  // Flutterwave bank code, e.g. "058" for GTBank: required for transfers
  @Column({ nullable: true })
  bankCode: string;

  @Column({ nullable: true })
  bankAccountNumber: string;

  @Column({ nullable: true })
  bankAccountName: string;

  // Pending bank CHANGE awaiting admin review (2026-08-09 policy: the
  // first bank account saves instantly; replacing it is a critical
  // change that needs support approval within 3 business days, guarding
  // against account-takeover payout theft). Applied by admin approve,
  // discarded by reject.
  @Column({ nullable: true })
  pendingBankName: string;

  @Column({ nullable: true })
  pendingBankCode: string;

  @Column({ nullable: true })
  pendingBankAccountNumber: string;

  @Column({ nullable: true })
  pendingBankAccountName: string;

  @Column({ type: 'timestamptz', nullable: true })
  pendingBankRequestedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  pendingBankTicketId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
