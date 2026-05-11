import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

export enum NotificationType {
  JOB_REQUEST       = 'job_request',
  DELIVERY_ASSIGNED = 'delivery_assigned',
  STATUS_UPDATE     = 'status_update',
  DELIVERY_COMPLETE = 'delivery_complete',
  PAYMENT_RECEIVED  = 'payment_received',
  CHAT_MESSAGE      = 'chat_message',
  SOS_ALERT         = 'sos_alert',
  GENERAL           = 'general',
}

@Entity('notifications')
@Index(['userId', 'createdAt'])
@Index(['userId', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  title: string;

  @Column()
  body: string;

  @Column({ type: 'enum', enum: NotificationType, default: NotificationType.GENERAL })
  type: NotificationType;

  @Column({ nullable: true })
  deliveryId: string;

  @Column({ nullable: true })
  trackingCode: string;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
