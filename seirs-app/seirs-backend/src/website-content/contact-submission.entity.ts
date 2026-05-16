import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

// Spec V8 §3.13 — public website contact form ingest. Persisted so
// ops can see every inbound enquiry even if email delivery fails,
// and emailed to the appropriate inbox (support / business / legal)
// based on subject. Doesn't require auth; throttled at the controller.

export enum ContactSubject {
  GENERAL  = 'general',
  BUSINESS = 'business',
  DRIVER   = 'driver',
  PARTNER  = 'partner',
  SUPPORT  = 'support',
}

export enum ContactStatus {
  NEW       = 'new',
  IN_REVIEW = 'in_review',
  REPLIED   = 'replied',
  SPAM      = 'spam',
  CLOSED    = 'closed',
}

@Entity('contact_submissions')
@Index(['status', 'createdAt'])
export class ContactSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Index()
  @Column({ type: 'enum', enum: ContactSubject, default: ContactSubject.GENERAL })
  subject: ContactSubject;

  @Column({ type: 'text' })
  message: string;

  @Index()
  @Column({ type: 'enum', enum: ContactStatus, default: ContactStatus.NEW })
  status: ContactStatus;

  // Origin metadata for abuse triage
  @Column({ nullable: true })
  sourceIp: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  // Admin reply note — surfaced in /admin/tickets follow-up flows later.
  @Column({ type: 'text', nullable: true })
  internalNote: string;

  @CreateDateColumn()
  createdAt: Date;
}
