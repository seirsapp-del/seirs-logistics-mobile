import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('business_wallet_transactions')
export class BusinessWalletTx {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  businessAccountId: string;

  @Column()
  type: 'credit' | 'debit';

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column()
  description: string;

  @Column({ nullable: true })
  reference: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balanceBefore: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balanceAfter: number;

  @CreateDateColumn()
  createdAt: Date;
}
