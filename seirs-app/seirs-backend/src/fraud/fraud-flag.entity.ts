import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';

export enum FraudFlagType {
  HIGH_CANCELLATION_RATE  = 'high_cancellation_rate',
  FAILED_PAYMENT_PATTERN  = 'failed_payment_pattern',
  GPS_VELOCITY_ANOMALY    = 'gps_velocity_anomaly',
  DUPLICATE_ACCOUNT       = 'duplicate_account',
  SUSPICIOUS_WITHDRAWAL   = 'suspicious_withdrawal',
}

export enum FraudFlagStatus {
  OPEN        = 'open',
  REVIEWED    = 'reviewed',
  DISMISSED   = 'dismissed',
  ACTIONED    = 'actioned',
}

@Entity('fraud_flags')
export class FraudFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn()
  user: User;

  @Column({ type: 'enum', enum: FraudFlagType })
  type: FraudFlagType;

  @Column({ type: 'enum', enum: FraudFlagStatus, default: FraudFlagStatus.OPEN })
  status: FraudFlagStatus;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any>;

  @Column({ nullable: true })
  resolvedBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
