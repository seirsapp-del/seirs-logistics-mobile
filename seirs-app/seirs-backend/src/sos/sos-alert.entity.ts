import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';

export enum SosStatus {
  ACTIVE   = 'active',
  RESOLVED = 'resolved',
  CANCELLED = 'cancelled',
}

@Entity('sos_alerts')
@Index(['status'])
@Index(['createdAt'])
export class SosAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The user who triggered the alert (customer or driver — either can SOS).
  @ManyToOne(() => User, { eager: true })
  @JoinColumn()
  user: User;

  // Optional — most SOS events happen during an active delivery so the
  // assigned driver / customer of the *other* party also gets notified.
  @ManyToOne(() => Delivery, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  delivery: Delivery | null;

  // GPS at the moment of trigger — vital for dispatching help to the user.
  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  // Free-form note from the user ("car accident", "feeling unsafe", etc.)
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'enum', enum: SosStatus, default: SosStatus.ACTIVE })
  status: SosStatus;

  // The admin (or originating user, for self-cancel) who closed the alert.
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn()
  resolvedBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
