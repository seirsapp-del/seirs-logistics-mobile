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

  @CreateDateColumn()
  createdAt: Date;
}
