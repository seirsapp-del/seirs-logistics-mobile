import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * A support conversation between a user and the SEIRS ops team.
 *
 * Deliberately separate from delivery chats (which stay strictly
 * customer<->driver so admins cannot snoop delivery threads). A
 * SupportTicket has its own thread built out of chat_messages rows
 * with a nullable ticketId FK, so the message plumbing is reused
 * end-to-end while the two conversation types stay isolated.
 *
 * Product decisions this schema encodes:
 *   - Any-time: users can open a ticket without an active delivery.
 *     linkedDeliveryId is optional and set only when the ticket is
 *     ABOUT a specific delivery (context for support agent).
 *   - One queue with a topic tag: routing to specialised queues is
 *     a future add-on. Every ticket has a `topic` even at launch so
 *     later routing needs no data migration.
 *   - 6am-10pm Africa/Lagos business hours: enforcement lives in the
 *     service; the entity carries only openedAt and lastMessageAt for
 *     auto-close + reporting.
 *   - 7-day idle auto-close: a scheduled job flips status to `closed`
 *     and sets `autoClosedAt`. Users can still open a new ticket.
 *   - Rate limits (3 open + 10/24h): enforced at create time in the
 *     service, not the schema.
 */
export enum TicketTopic {
  BILLING   = 'billing',
  DRIVER    = 'driver',
  ACCOUNT   = 'account',
  DELIVERY  = 'delivery',
  /**
   * A partner or rider changed when they work, while holding parcels or
   * with jobs already booked.
   *
   * Nobody picks this one. It is raised by the system, and it exists as
   * its own topic rather than folding into OTHER so the queue can be
   * filtered down to exactly these: the founder asked to know where to
   * look without reading every ticket in the inbox.
   *
   * Founder, 2026-09-03, on why this is worth a queue at all: a partner
   * "could decide to leave without telling anyone while they still hold
   * packages of users, especially during festive period". The hours
   * change is the earliest warning we get, and it is the only one that
   * arrives BEFORE the parcels are stranded rather than after.
   *
   * 12 characters, and the column is varchar(16). partner_hours_change
   * was the obvious name and would have been silently truncated or
   * rejected on insert. It covers riders too, which is why it is not
   * called partner anything.
   */
  HOURS     = 'hours_change',
  OTHER     = 'other',
}

export enum TicketStatus {
  OPEN            = 'open',              // just created, waiting on first agent view
  AWAITING_AGENT  = 'awaiting_agent',    // user replied, agent hasn't
  AWAITING_USER   = 'awaiting_user',     // agent replied, user hasn't
  RESOLVED        = 'resolved',          // agent marked resolved (soft close)
  CLOSED          = 'closed',            // hard closed, incl. 7-day idle auto-close
}

@Entity('support_tickets')
@Index(['user', 'status'])
@Index(['status', 'lastMessageAt'])
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Owner of the ticket. Kept as an FK for referential integrity so
  // deleting a user cascades any tickets they held. NOT eager-loaded
  // so list queries stay cheap.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  // Denormalised copy of the user's account type at ticket-open time,
  // so support agents can filter their inbox by "customer tickets /
  // driver tickets / business tickets" without a join. Set once, never
  // mutated. Free-form string to future-proof against new roles.
  @Column({ type: 'varchar', length: 32 })
  userAccountType: string;

  @Column({ type: 'varchar', length: 16 })
  topic: TicketTopic;

  @Column({ type: 'varchar', length: 24, default: TicketStatus.OPEN })
  status: TicketStatus;

  @Column({ type: 'varchar', length: 200 })
  subject: string;

  // Optional link to a specific delivery this ticket is about. Kept as
  // a plain uuid column (not FK) so a delivery being deleted does NOT
  // orphan-cascade the support conversation.
  @Column({ type: 'uuid', nullable: true })
  linkedDeliveryId: string | null;

  // The support agent currently owning this ticket. Null until
  // triaged. First agent to reply is auto-assigned unless already set.
  @Column({ type: 'uuid', nullable: true })
  assignedAgentId: string | null;

  // Instant metrics for reporting without walking chat_messages.
  @Column({ type: 'timestamptz', nullable: true })
  firstAgentReplyAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  autoClosedAt: Date | null;

  // Refreshed on every message. Powers the 7-day idle auto-close
  // sweeper + the inbox "recent first" sort.
  @Column({ type: 'timestamptz' })
  lastMessageAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
