import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum TicketStatus {
  OPEN        = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED    = 'resolved',
  CLOSED      = 'closed',
}

export enum TicketPriority {
  LOW    = 'low',
  MEDIUM = 'medium',
  HIGH   = 'high',
  URGENT = 'urgent',
}

export interface TicketReply {
  id:        string;
  message:   string;
  sender:    'user' | 'admin';
  agentId?:  string;
  agentName?: string;
  createdAt: string;
}

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: TicketStatus.OPEN })
  status: TicketStatus;

  @Index()
  @Column({ type: 'varchar', length: 20, default: TicketPriority.MEDIUM })
  priority: TicketPriority;

  @Column({ nullable: true })
  category: string;

  @Index()
  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  userName: string;

  @Column({ nullable: true })
  userEmail: string;

  @Column({ nullable: true })
  assignedToId: string;

  @Column({ nullable: true })
  assignedToName: string;

  @Column({ type: 'jsonb', default: [] })
  replies: TicketReply[];

  @Column({ default: false })
  slaBreached: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
