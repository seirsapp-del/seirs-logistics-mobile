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
  SYSTEM            = 'system',

  // Account-and-security category (2026-08-28). Every type above this
  // line is about a package or a chat. Nothing described the account
  // itself, so a password change, a payout redirect or a stranger
  // signing in were the only events on the platform that happened in
  // total silence. A takeover is only detectable if the owner is told.
  //
  // SECURITY_ALERT is the "somebody touched your credentials or your
  // money" class and is never suppressible (see
  // NotificationsService.SECURITY_TYPES). ACCOUNT_UPDATE is the
  // "an admin changed your standing" class: still not opt-out, but it
  // is an outcome rather than an intrusion, so it reads differently in
  // the inbox and can be filtered separately by the apps.
  SECURITY_ALERT    = 'security_alert',
  ACCOUNT_UPDATE    = 'account_update',
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
