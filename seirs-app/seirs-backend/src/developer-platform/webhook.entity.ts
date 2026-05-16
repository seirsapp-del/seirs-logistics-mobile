import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

// Spec V8 Tier 3 — webhook subscription. Owner registers a URL +
// list of events they want notified about; backend POSTs signed
// payloads on each event.
@Entity('webhook_endpoints')
export class WebhookEndpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  ownerUserId: string;

  @Column()
  url: string;

  // Events to deliver: order.created, order.driver_assigned,
  // order.picked_up, order.delivered, order.failed, order.cancelled
  @Column({ type: 'jsonb', default: () => "'[]'" })
  events: string[];

  // bcrypt hash of the signing secret
  @Column({ select: false })
  secretHash: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// Per-attempt delivery log. Powers biz.webhookLog UI.
@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  endpointId: string;

  @Index()
  @Column()
  event: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({ nullable: true })
  responseCode: number;

  @Column({ type: 'text', nullable: true })
  responseBody: string;

  @Column({ default: 0 })
  attempts: number;

  @Index()
  @Column({ default: 'pending' })
  status: 'pending' | 'delivered' | 'failed';

  @Column({ nullable: true })
  deliveredAt: Date;

  // Set by the retry cron — pending rows fire when nextAttemptAt <= now.
  // Null = "fire on next cron tick".
  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
