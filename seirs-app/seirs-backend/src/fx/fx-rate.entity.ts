import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('fx_rates')
export class FxRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 8 })
  pair: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  rate: number;

  @Column({ length: 32, nullable: true })
  source: string;

  @CreateDateColumn()
  fetchedAt: Date;
}
