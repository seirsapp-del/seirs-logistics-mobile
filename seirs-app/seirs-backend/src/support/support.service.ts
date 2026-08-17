import {
  Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { SupportTicket, TicketStatus, TicketTopic } from './support-ticket.entity';
import { ChatMessage } from '../chat/chat-message.entity';
import { User } from '../users/user.entity';

// Business hours (Africa/Lagos = UTC+1, no DST). Outside this window
// a new ticket gets an auto-response system message so the user knows
// when to expect a reply and does not sit refreshing the app.
const BUSINESS_HOURS_START = 6;   // inclusive
const BUSINESS_HOURS_END   = 22;  // exclusive (10pm)
const LAGOS_UTC_OFFSET_HOURS = 1;

// Rate limits per user. Deliberately conservative for launch; they
// protect the queue from a stolen account without blocking a genuine
// series of related tickets.
const MAX_OPEN_TICKETS_PER_USER    = 3;
const MAX_TICKETS_OPENED_PER_24H   = 10;

// Idle threshold before a ticket auto-closes. 7 days matches the
// support-toolkit decisions.
const AUTO_CLOSE_IDLE_DAYS = 7;

// Which admin sub-roles can act as support agents. Kept as a set so
// tests can pass a stub user without hitting the admin service.
// Aligned 2026-08-16 with roles.seed: ops_manager carries the 'tickets'
// permission in the admin dashboard, so it must also pass the support
// module's agent gate or the dashboard's ticket desk 403s for them.
const AGENT_ROLES = new Set(['super_admin', 'support_agent', 'ops_manager']);

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectRepository(SupportTicket) private readonly tickets:  Repository<SupportTicket>,
    @InjectRepository(ChatMessage)   private readonly messages: Repository<ChatMessage>,
    @InjectRepository(User)          private readonly users:    Repository<User>,
  ) {}

  // ── User side ────────────────────────────────────────────────────────

  /**
   * Open a new support ticket. Enforces rate limits, records the
   * first message inline, and inserts an auto-response system message
   * outside business hours so the user knows we saw it.
   */

  /**
   * Is this requester a support agent?
   *
   * This used to read user.adminRole only. Spec V8 dynamic roles put the
   * assignment in roleId and that OVERRIDES the legacy enum, so an admin
   * given the support role the modern way has adminRole null and was
   * refused: the support desk showed no tickets at all while users were
   * filing them (founder 2026-08-16, checking the admin dashboard).
   * Both are honoured now.
   */
  private async isAgent(requester: any): Promise<boolean> {
    if (AGENT_ROLES.has(String(requester?.adminRole ?? ''))) return true;
    if (!requester?.roleId) return false;
    try {
      const row = await this.tickets.manager
        .createQueryBuilder()
        .select('r.slug', 'slug')
        .from('roles', 'r')
        .where('r.id = :id', { id: requester.roleId })
        .getRawOne<{ slug: string }>();
      return AGENT_ROLES.has(String(row?.slug ?? ''));
    } catch {
      return false;
    }
  }

  async create(userId: string, body: {
    topic:              TicketTopic;
    subject:            string;
    firstMessage:       string;
    linkedDeliveryId?:  string | null;
  }): Promise<SupportTicket> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!body?.subject?.trim())      throw new BadRequestException('Subject is required');
    if (!body?.firstMessage?.trim()) throw new BadRequestException('First message is required');
    if (!Object.values(TicketTopic).includes(body.topic)) {
      throw new BadRequestException('Invalid topic');
    }

    await this.enforceRateLimits(userId);

    const now = new Date();
    const ticket = await this.tickets.save(this.tickets.create({
      user,
      userAccountType:  this.accountTypeOf(user),
      topic:            body.topic,
      status:           TicketStatus.OPEN,
      subject:          body.subject.trim().slice(0, 200),
      linkedDeliveryId: body.linkedDeliveryId ?? null,
      assignedAgentId:  null,
      lastMessageAt:    now,
    }));

    // Persist the user's first message as a chat_messages row scoped to
    // the ticket (ticketId set, deliveryId null). Reuses the same table
    // that customer<->driver conversations live in.
    await this.appendMessage(ticket, user, body.firstMessage.trim(), 'user');

    // Business-hours auto-response so the user is not left wondering.
    if (!this.isBusinessHours(now)) {
      await this.appendSystemMessage(
        ticket,
        'support_after_hours',
        `Thanks for reaching out. Support is closed right now (hours 6am–10pm WAT). We will reply once we open at 6am.`,
      );
    }

    return ticket;
  }

  /** Ticket list for the ticket owner. Recent first. */
  async listMine(userId: string, opts: { status?: TicketStatus; limit?: number } = {}) {
    const where: any = { user: { id: userId } };
    if (opts.status) where.status = opts.status;
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    return this.tickets.find({
      where,
      order: { lastMessageAt: 'DESC' },
      take:  limit,
    });
  }

  /** Full thread (ticket + messages). Only the owner or an agent can read. */
  async getThread(ticketId: string, requester: User): Promise<{ ticket: SupportTicket; messages: ChatMessage[] }> {
    const ticket = await this.tickets.findOne({
      where: { id: ticketId },
      relations: ['user'],
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const isOwner = ticket.user?.id === requester.id;
    const isAgent = await this.isAgent(requester);
    if (!isOwner && !isAgent) throw new ForbiddenException('Not your ticket');

    const messages = await this.messages
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .where('m."ticketId" = :id', { id: ticket.id })
      .orderBy('m."createdAt"', 'ASC')
      .getMany();

    // Same scoping as the queue: the ticket owner's bank details are not
    // support's business, and messages carry an eager sender too.
    const safeUser = (u: any) => (u ? {
      id: u.id, name: u.name, email: u.email,
      phone: u.phone ?? null, accountId: u.accountId ?? null,
    } : null);
    return {
      ticket:   { ...ticket, user: safeUser((ticket as any).user) } as any,
      messages: messages.map((m: any) => ({ ...m, sender: safeUser(m.sender) })) as any,
    };
  }

  /** User reply to their own ticket. Refuses if the ticket is closed. */
  async userReply(ticketId: string, user: User, bodyText: string): Promise<ChatMessage> {
    const ticket = await this.tickets.findOne({ where: { id: ticketId }, relations: ['user'] });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.user?.id !== user.id) throw new ForbiddenException('Not your ticket');
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException('This ticket is closed. Please open a new one.');
    }
    const trimmed = (bodyText ?? '').trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');

    const msg = await this.appendMessage(ticket, user, trimmed, 'user');
    await this.tickets.update(ticket.id, {
      status:        TicketStatus.AWAITING_AGENT,
      lastMessageAt: msg.createdAt,
    });
    return msg;
  }

  // ── Agent side ───────────────────────────────────────────────────────

  /** Support inbox. Agents only. Recent-active tickets first. */
  async listQueue(requester: User, opts: {
    status?:     TicketStatus;
    topic?:      TicketTopic;
    limit?:      number;
    accountType?: string;
  } = {}) {
    if (!(await this.isAgent(requester))) {
      throw new ForbiddenException('Support agent role required');
    }
    /**
     * orderBy takes the PROPERTY name, not a pre-quoted column. Written
     * as t."lastMessageAt" it broke alias resolution once the user join
     * was selected and threw "Cannot read properties of undefined
     * (reading 'databaseName')", which reached the admin dashboard as a
     * bare Internal Server Error on the Support Inbox (founder
     * 2026-08-16). Repository.find worked all along because it builds
     * the clause itself, which is why the fault looked like a
     * permissions problem.
     */
    const qb = this.tickets.createQueryBuilder('t')
      .leftJoinAndSelect('t.user', 'u')
      .orderBy('t.lastMessageAt', 'DESC');

    if (opts.status)      qb.andWhere('t.status = :s',              { s: opts.status });
    if (opts.topic)       qb.andWhere('t.topic = :tp',              { tp: opts.topic });
    if (opts.accountType) qb.andWhere('t."userAccountType" = :at',  { at: opts.accountType });

    const rows = await qb.take(Math.min(Math.max(opts.limit ?? 30, 1), 100)).getMany();

    /**
     * Scope the user down to what support needs to work a ticket.
     *
     * The relation is eager, so returning rows straight from the query
     * handed every agent the whole User row: bank account name, number
     * and code, date of birth, apple id, admin role, capabilities. A
     * support agent needs to know who is complaining and how to reach
     * them, not their bank details (found 2026-08-16 while reading the
     * queue response). Full records stay available to those with the
     * users permission, one click away in the dashboard.
     */
    return rows.map((t) => ({
      ...t,
      user: t.user
        ? {
            id:        t.user.id,
            name:      t.user.name,
            email:     t.user.email,
            phone:     t.user.phone ?? null,
            accountId: (t.user as any).accountId ?? null,
          }
        : null,
    })) as any;
  }

  /**
   * Agent reply. Auto-assigns the ticket to this agent if unassigned,
   * flips status to awaiting_user, and stamps firstAgentReplyAt if
   * this is the first agent message on the thread.
   */
  async agentReply(ticketId: string, agent: User, bodyText: string): Promise<ChatMessage> {
    if (!(await this.isAgent(agent))) {
      throw new ForbiddenException('Support agent role required');
    }
    const ticket = await this.tickets.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException('Ticket is closed');
    }

    const trimmed = (bodyText ?? '').trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');

    const msg = await this.appendMessage(ticket, agent, trimmed, 'agent');

    const patch: Partial<SupportTicket> = {
      status:        TicketStatus.AWAITING_USER,
      lastMessageAt: msg.createdAt,
    };
    if (!ticket.assignedAgentId) patch.assignedAgentId = agent.id;
    if (!ticket.firstAgentReplyAt) patch.firstAgentReplyAt = msg.createdAt;
    await this.tickets.update(ticket.id, patch);

    return msg;
  }

  /** Agent-triggered resolve / close. */
  async setStatus(ticketId: string, agent: User, status: TicketStatus): Promise<SupportTicket> {
    if (!(await this.isAgent(agent))) {
      throw new ForbiddenException('Support agent role required');
    }
    const ticket = await this.tickets.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const patch: Partial<SupportTicket> = { status };
    if (status === TicketStatus.RESOLVED && !ticket.resolvedAt) patch.resolvedAt = new Date();
    await this.tickets.update(ticket.id, patch);
    return { ...ticket, ...patch } as SupportTicket;
  }

  // ── Idle sweeper (called by scheduler) ───────────────────────────────

  /**
   * Marks tickets idle for AUTO_CLOSE_IDLE_DAYS as closed. Cheap
   * indexed scan on (status, lastMessageAt). Safe to run repeatedly.
   */
  async sweepIdleTickets(): Promise<{ closed: number }> {
    const cutoff = new Date(Date.now() - AUTO_CLOSE_IDLE_DAYS * 86_400_000);
    const result = await this.tickets
      .createQueryBuilder()
      .update(SupportTicket)
      .set({ status: TicketStatus.CLOSED, autoClosedAt: () => 'NOW()' })
      .where('status IN (:...open)', { open: [
        TicketStatus.OPEN,
        TicketStatus.AWAITING_AGENT,
        TicketStatus.AWAITING_USER,
      ]})
      .andWhere('"lastMessageAt" < :cutoff', { cutoff })
      .execute();
    return { closed: result.affected ?? 0 };
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private async enforceRateLimits(userId: string): Promise<void> {
    const openCount = await this.tickets.count({
      where: {
        user:   { id: userId },
        status: In([TicketStatus.OPEN, TicketStatus.AWAITING_AGENT, TicketStatus.AWAITING_USER]),
      },
    });
    if (openCount >= MAX_OPEN_TICKETS_PER_USER) {
      throw new BadRequestException(
        `You already have ${openCount} open tickets. Close or resolve one before opening another.`,
      );
    }

    const oneDayAgo = new Date(Date.now() - 86_400_000);
    const recentCount = await this.tickets
      .createQueryBuilder('t')
      .where('t."userId" = :u',    { u: userId })
      .andWhere('t."createdAt" >= :cutoff', { cutoff: oneDayAgo })
      .getCount();
    if (recentCount >= MAX_TICKETS_OPENED_PER_24H) {
      throw new BadRequestException('Too many tickets opened in the last 24 hours');
    }
  }

  private isBusinessHours(now: Date): boolean {
    // Convert to Lagos hour without needing tz-data: shift UTC by +1.
    const lagosHour = (now.getUTCHours() + LAGOS_UTC_OFFSET_HOURS + 24) % 24;
    return lagosHour >= BUSINESS_HOURS_START && lagosHour < BUSINESS_HOURS_END;
  }

  private accountTypeOf(user: User): string {
    // Best-effort classifier so support inbox filters work. Falls back
    // to 'customer' since the majority of tickets will be from that
    // segment.
    const anyU = user as any;
    if (anyU.driverId || anyU.role === 'driver')     return 'driver';
    if (anyU.businessId || anyU.role === 'business') return 'business';
    if (anyU.role === 'admin')                       return 'admin';
    return 'customer';
  }

  /**
   * Append a chat_messages row scoped to a ticket. Bumps the ticket's
   * lastMessageAt as a side effect callers can rely on.
   */
  private async appendMessage(
    ticket: SupportTicket, sender: User, bodyText: string, _senderKind: 'user' | 'agent',
  ): Promise<ChatMessage> {
    // ticketId is now a real column on ChatMessage. It used to be set
    // through a cast, and TypeORM drops properties an entity does not
    // declare, so every ticket message was written detached from its
    // ticket and the thread came back empty.
    const partial = {
      sender,
      body:     bodyText,
      imageUrl: null,
      delivery: null,
      ticketId: ticket.id,
    } as Partial<ChatMessage>;
    const msg = this.messages.create(partial);
    const saved = await this.messages.save(msg);
    return saved as ChatMessage;
  }

  private async appendSystemMessage(
    ticket: SupportTicket, systemType: string, bodyText: string,
  ): Promise<void> {
    try {
      await this.messages.insert({
        sender:    null as any,
        body:      bodyText,
        imageUrl:  null,
        systemType,
        delivery:  null as any,
        // @ts-ignore raw column set, see appendMessage note
        ticketId:  ticket.id,
      } as any);
    } catch (e: any) {
      this.logger.warn(`support system-message insert failed: ${e?.message ?? e}`);
    }
  }
}
