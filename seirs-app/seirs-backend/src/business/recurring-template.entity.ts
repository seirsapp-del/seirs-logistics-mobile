import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, Index, JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

// Spec V8 §4.2 — recurring delivery templates for business senders.
// When the cron fires (daily 1:30 AM Africa/Lagos), any template whose
// nextRunAt <= now creates a new Delivery from the snapshot payload,
// debits the business wallet, and schedules the following nextRunAt.

export enum RecurringCadence {
  DAILY   = 'daily',
  WEEKLY  = 'weekly',
  MONTHLY = 'monthly',
}

@Entity('recurring_templates')
@Index(['isActive', 'nextRunAt'])
export class RecurringTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn()
  owner: User;

  // Human label shown in the UI ("Monday warehouse refill").
  @Column()
  name: string;

  @Column({ type: 'enum', enum: RecurringCadence })
  cadence: RecurringCadence;

  // WEEKLY: 0=Sunday … 6=Saturday
  @Column({ type: 'smallint', nullable: true })
  dayOfWeek: number | null;

  // MONTHLY: 1..28 (cap to avoid 30/31-day month bugs)
  @Column({ type: 'smallint', nullable: true })
  dayOfMonth: number | null;

  // Time-of-day for the next dispatch, server local TZ. 0..23 / 0..59.
  @Column({ type: 'smallint', default: 9 })
  hour: number;

  @Column({ type: 'smallint', default: 0 })
  minute: number;

  // Snapshot of the booking payload to re-create. Same shape as
  // businessApi.createDelivery — pickup + stops + vehicle + category
  // + weight + packageDescription + km. Stored as JSONB so we don't
  // hard-couple to the Delivery entity shape.
  @Column({ type: 'jsonb' })
  payload: any;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastRunAt: Date | null;

  // Computed by service on create / after each fire. The cron reads
  // this and fires any row where nextRunAt <= now AND isActive.
  @Column({ type: 'timestamptz' })
  nextRunAt: Date;

  // Audit: how many successful fires so far. Useful for biz dashboard.
  @Column({ default: 0 })
  fireCount: number;

  // Audit: count of fires that hit a non-recoverable error (wallet
  // insufficient, payload schema drift, etc.). Surfaces in the UI
  // so the owner knows to investigate.
  @Column({ default: 0 })
  errorCount: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
