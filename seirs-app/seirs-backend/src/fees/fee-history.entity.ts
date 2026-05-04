import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// Append-only audit log for every change to a Fee row. Powers the admin
// "history" drawer and lets us roll back if a value change has bad effects.
@Entity('fee_history')
export class FeeHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 64 })
  feeKey: string;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  previousValue: number;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  newValue: number;

  @Column({ default: true })
  previousActive: boolean;

  @Column({ default: true })
  newActive: boolean;

  @Column({ nullable: true })
  changedById: string;

  @Column({ nullable: true })
  changedByName: string;

  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn()
  changedAt: Date;
}
