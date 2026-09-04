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
/**
 * How long a CLOSED ticket is kept before it is deleted outright
 * (founder 2026-08-17: "after a ticket is closed can you make it auto
 * delete in 7 day, i think thats enough time"). Closing only hides a
 * ticket from the working queue; the thread and its messages stayed on
 * the user's phone forever, and nothing ever removed them.
 */
const PURGE_CLOSED_AFTER_DAYS = 7;

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
  /**
   * The user's tickets, each carrying a real unread count.
   *
   * The inbox used to derive a row's unread badge from the ticket's
   * STATUS (`awaiting_user ? 1 : 0`), while the tab badge came from
   * unreadCount(), which counts messages with readAt IS NULL. Two
   * different rules over the same inbox, so they disagreed by
   * construction: a support notice on a ticket in any other status put
   * a number on the tab and nothing on the row it came from. Same
   * number, same screen, computed two ways. Now the row and the tab
   * both read readAt.
   */
  async listMine(userId: string, opts: { status?: TicketStatus; limit?: number } = {}) {
    const where: any = { user: { id: userId } };
    if (opts.status) where.status = opts.status;
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const tickets = await this.tickets.find({
      where,
      order: { lastMessageAt: 'DESC' },
      take:  limit,
    });
    if (!tickets.length) return tickets;

    const rows: Array<{ ticketId: string; c: string }> = await this.messages.query(
      `SELECT "ticketId", COUNT(*) AS c
         FROM "chat_messages"
        WHERE "ticketId" = ANY($1::uuid[])
          AND "readAt" IS NULL
          AND ("senderId" IS NULL OR "senderId" != $2)
        GROUP BY "ticketId"`,
      [tickets.map((t) => t.id), userId],
    ).catch(() => [] as Array<{ ticketId: string; c: string }>);

    const byTicket = new Map(rows.map((r) => [r.ticketId, Number(r.c) || 0]));
    return tickets.map((t) => ({ ...t, unread: byTicket.get(t.id) ?? 0 })) as any;
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

    /**
     * Mark the thread read for whoever just opened it.
     *
     * Nothing did this before. Both readAt writers in ChatService key on
     * deliveryId, and a ticket message has ticketId instead, so no code
     * path in the platform had ever set readAt on one. unreadCount()
     * counts ticket messages with readAt IS NULL, so a single support
     * message badged the Messages tab permanently: opening the thread,
     * reading it, and replying all left the badge exactly where it was,
     * and there was no action in any of the three apps that could clear
     * it. That is the "99+ even after i clear all notification" and the
     * red badge over an inbox with nothing unread in it (founder,
     * 2026-08-27, on the bank-change notice).
     *
     * senderId IS NULL is admitted deliberately: system notices have no
     * sender, and they are the messages this most needs to clear.
     */
    await this.messages
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where('"ticketId" = :id', { id: ticket.id })
      .andWhere('("senderId" IS NULL OR "senderId" != :uid)', { uid: requester.id })
      .andWhere('"readAt" IS NULL')
      .execute();

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
    /**
     * 'waiting' puts the person who has been ignored longest at the top.
     * 'recent' is the old behaviour and stays the default so nothing that
     * calls this without the parameter changes underneath it.
     */
    sort?:       'recent' | 'waiting';
    page?:       number;
    /** Free text over the subject and the person, matched in the database. */
    q?:          string;
    /** Only tickets nobody has picked up. */
    unassigned?: boolean;
    /** Opened on or after this date (YYYY-MM-DD). */
    from?:       string;
    /** Opened on or before this date, inclusive of the whole day. */
    to?:         string;
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
      .leftJoinAndSelect('t.user', 'u');

    /**
     * SORTING HAPPENS HERE, BEFORE THE LIST IS CUT.
     *
     * It used to happen on the dashboard, after this method had already
     * ordered by lastMessageAt DESC and truncated to 100. That made the
     * "Longest waiting" control incapable of doing the one thing it
     * promised: a ticket ignored for three weeks has, by definition, the
     * OLDEST lastMessageAt, so it sorted last here and was the first row
     * dropped by the cut. The single ticket that sort existed to surface
     * was the one most likely to be missing from the set being sorted.
     *
     * Silent below 100 tickets and wrong above it, which means it would
     * have started lying at exactly the volume where somebody began
     * trusting it.
     *
     * Ordering a page of results is not a presentation concern. It decides
     * WHICH rows you get, not just their arrangement, the moment there is
     * more than one page.
     */
    if (opts.sort === 'waiting') {
      // Oldest activity first: whoever has heard nothing for longest.
      qb.orderBy('t.lastMessageAt', 'ASC');
    } else {
      qb.orderBy('t.lastMessageAt', 'DESC');
    }

    if (opts.status)      qb.andWhere('t.status = :s',              { s: opts.status });
    if (opts.topic)       qb.andWhere('t.topic = :tp',              { tp: opts.topic });
    if (opts.accountType) qb.andWhere('t."userAccountType" = :at',  { at: opts.accountType });

    /**
     * Searching in the DATABASE, not over the rows that happen to be loaded.
     *
     * The dashboard filtered the fetched page, so a ticket on page three
     * was invisible to a search for it, and the box returned an empty
     * result that looked exactly like "no such ticket". When a customer
     * rings up, finding their ticket is the first thing an agent does, and
     * a search that silently only covers the current page is worse than no
     * search at all: it answers confidently and wrongly.
     *
     * The person's own columns are included because nobody rings quoting a
     * ticket subject. They give a name, or a phone number, or read out
     * their SEIRS ID.
     */
    if (opts.q?.trim()) {
      const term = `%${opts.q.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(t.subject) LIKE :term
          OR LOWER(u.name)  LIKE :term
          OR LOWER(u.email) LIKE :term
          OR LOWER(COALESCE(u.phone, ''))     LIKE :term
          OR LOWER(COALESCE(u."accountId", '')) LIKE :term)`,
        { term },
      );
    }

    /**
     * The pile nobody has picked up.
     *
     * assignedAgentId has been recorded on every ticket since the table
     * existed and nothing anywhere filtered on it, so "what has nobody
     * taken" was unanswerable from the screen. That is the question a
     * shift lead asks first and the one a queue is worst at answering by
     * eye, because an unowned ticket looks identical to an owned one.
     */
    if (opts.unassigned) qb.andWhere('t."assignedAgentId" IS NULL');

    /**
     * Date range over when the ticket was OPENED, not last touched.
     *
     * "What came in over the weekend" is a question about arrival. Ranging
     * on lastMessageAt would instead answer "what was touched", so a
     * ticket raised on Saturday and replied to on Monday would fall out of
     * a Saturday-to-Sunday range, which is the opposite of what was asked.
     *
     * `to` covers the whole of its day: a range ending on the 5th that
     * stopped at midnight would silently exclude everything raised ON the
     * 5th, which is the commonest way a date filter lies.
     */
    if (opts.from) qb.andWhere('t."createdAt" >= :from', { from: new Date(`${opts.from}T00:00:00Z`) });
    if (opts.to)   qb.andWhere('t."createdAt" <  :to',   { to:   new Date(new Date(`${opts.to}T00:00:00Z`).getTime() + 86_400_000) });

    /**
     * Real pages, and a total.
     *
     * There was no page two. The queue asked for 100, got at most 100, and
     * everything beyond that was unreachable from the screen: not hidden
     * behind a control, simply absent, with the page left to say so in a
     * footnote. A support queue that cannot reach its own backlog is a
     * queue that quietly stops being the record.
     */
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const page  = Math.max(Number(opts.page) || 1, 1);
    const [rows, total] = await qb
      .take(limit)
      .skip((page - 1) * limit)
      .getManyAndCount();

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
    /**
     * The driver record id, for the riders on this page.
     *
     * The first version of this read user.driverId. That column does not
     * exist: a driver is a row in `drivers` pointing AT the user, not a
     * field on the user, so the check silently never passed and a rider's
     * name still opened the customer page. accountTypeOf a few lines down
     * makes the same wrong assumption and is only saved by its `||`.
     *
     * One query for the page rather than one per ticket.
     */
    const riderUserIds = rows
      .filter(t => (t.user as any)?.role === 'driver')
      .map(t => t.user!.id);
    const driverIdByUser = new Map<string, string>();
    if (riderUserIds.length) {
      const found = await this.users.manager
        .createQueryBuilder()
        .select(['d.id AS id', 'd."userId" AS "userId"'])
        .from('drivers', 'd')
        .where('d."userId" IN (:...ids)', { ids: riderUserIds })
        .getRawMany<{ id: string; userId: string }>();
      found.forEach(r => driverIdByUser.set(r.userId, r.id));
    }

    /**
     * An object with a total, not a bare array.
     *
     * The queue could not say how big it was, so the screen could not tell
     * "these are all the tickets" from "these are the first hundred of
     * nine hundred". It guessed by whether the array had hit the cap,
     * which is right up until a backlog of exactly 100.
     *
     * Callers that still expect an array are handled on the dashboard with
     * the same Array.isArray fallback the other paginated boards use, so a
     * stale deploy of either side degrades to a list rather than an empty
     * queue. On a support inbox an empty list reads as "nothing to do",
     * which is the most expensive possible way to be wrong.
     */
    const items = rows.map((t) => ({
      ...t,
      user: t.user
        ? {
            id:        t.user.id,
            name:      t.user.name,
            email:     t.user.email,
            phone:     t.user.phone ?? null,
            accountId: (t.user as any).accountId ?? null,
            // Two narrow fields, added so the dashboard can open the RIGHT
            // record. Without them an agent clicking a rider's name landed on
            // the customer page, which is not their profile and carries none
            // of their documents, vehicle or trips. Deliberately only these
            // two: the rest of the user stays out of the queue response.
            role:      t.user.role ?? null,
            driverId:  driverIdByUser.get(t.user.id) ?? null,
          }
        : null,
      /**
       * How long this ticket has been sitting, in hours.
       *
       * Computed here rather than on the screen because it is the number
       * the queue is ordered by, and a row showing an age derived
       * differently from the order it appears in is how a list stops
       * making sense to the person reading it.
       */
      waitingHours: t.lastMessageAt
        ? Math.max(0, Math.round((Date.now() - new Date(t.lastMessageAt).getTime()) / 3_600_000))
        : null,
    }));

    return { items, total, page, limit, sort: opts.sort ?? 'recent' } as any;
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
  /**
   * Deletes tickets closed longer than PURGE_CLOSED_AFTER_DAYS ago, with
   * their messages.
   *
   * The clock starts at whichever close stamp exists, falling back to
   * lastMessageAt so a ticket closed by an agent (which sets resolvedAt,
   * not autoClosedAt) is not kept forever. Messages go first: they are
   * linked by a plain ticketId column rather than a foreign key, so
   * nothing would cascade and they would be orphaned rows.
   */
  async purgeClosedTickets(): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - PURGE_CLOSED_AFTER_DAYS * 86_400_000);
    const doomed: Array<{ id: string }> = await this.tickets.query(
      `SELECT id FROM "support_tickets"
        WHERE status = 'closed'
          AND COALESCE("autoClosedAt", "resolvedAt", "lastMessageAt") < $1
        LIMIT 500`,
      [cutoff],
    );
    if (!doomed.length) return { deleted: 0 };

    const ids = doomed.map((t) => t.id);
    await this.messages.query(
      `DELETE FROM "chat_messages" WHERE "ticketId" = ANY($1::uuid[])`, [ids],
    );
    await this.tickets.query(
      `DELETE FROM "support_tickets" WHERE id = ANY($1::uuid[])`, [ids],
    );
    this.logger.log(`Purged ${ids.length} ticket(s) closed over ${PURGE_CLOSED_AFTER_DAYS} days ago`);
    return { deleted: ids.length };
  }

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
    if (anyU.driverId || anyU.role === 'driver') return 'driver';
    /**
     * A business sender keeps role 'customer' and carries the business
     * link in businessAccountId; businessId has never been a field. Every
     * business ticket was therefore filed as 'customer' and the account
     * type filter could not surface one (found 2026-08-16: demo.store,
     * an account with a company and a partner counter, listed as
     * customer).
     */
    if (anyU.businessAccountId || anyU.businessRole || anyU.role === 'business'
        || String(anyU.accountId ?? '').startsWith('BIZ-')) {
      return 'business';
    }
    if (anyU.role === 'admin') return 'admin';
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

  /**
   * A ticket SEIRS raises about a user, rather than one they wrote.
   *
   * create() is the wrong door for these in two ways that both fail
   * quietly, which is the worst way for an alert to fail:
   *
   *   1. It enforces rate limits. A partner already holding three open
   *      tickets is exactly the partner worth watching, and their hours
   *      change would have thrown BadRequestException into a caller that
   *      cannot do anything useful with it. The alert would vanish at
   *      the moment it mattered most.
   *   2. It writes the opening message as the USER's, so the queue would
   *      show the partner saying words they never said.
   *
   * Deduplicated per user and topic: a partner fiddling with their hours
   * five times in an evening is one situation to look at, not five
   * tickets. A repeat appends to the open one, so ops keeps the whole
   * sequence in the order it happened.
   *
   * Returns the ticket, or null if it could not be raised. It never
   * throws: this is called from inside a settings save, and a partner
   * must not see their own hours change fail because our alerting did.
   *
   * @param userId  whose account the ticket belongs to
   * @param topic   TicketTopic; HOURS for a working-hours change
   * @param subject one line, shown in the queue list
   * @param body    the detail, written for a non-technical reader
   * @param systemType short slug stored on the message for later filtering
   */
  async raiseSystemTicket(
    userId: string,
    opts: { topic: TicketTopic; subject: string; body: string; systemType: string },
  ): Promise<SupportTicket | null> {
    try {
      const user = await this.users.findOne({ where: { id: userId } });
      if (!user) return null;

      const existing = await this.tickets.findOne({
        where: {
          user:   { id: userId },
          topic:  opts.topic,
          status: In([TicketStatus.OPEN, TicketStatus.AWAITING_AGENT, TicketStatus.AWAITING_USER]),
        },
        order: { lastMessageAt: 'DESC' },
      });

      const now = new Date();
      if (existing) {
        await this.appendSystemMessage(existing, opts.systemType, opts.body);
        await this.tickets.update(existing.id, {
          lastMessageAt: now,
          // Back to the agent queue: something new happened on a ticket
          // an agent may already have replied to and moved on from.
          status: TicketStatus.AWAITING_AGENT,
        } as any);
        return existing;
      }

      const ticket = await this.tickets.save(this.tickets.create({
        user,
        userAccountType:  this.accountTypeOf(user),
        topic:            opts.topic,
        status:           TicketStatus.OPEN,
        subject:          opts.subject.trim().slice(0, 200),
        linkedDeliveryId: null,
        assignedAgentId:  null,
        lastMessageAt:    now,
      }));
      await this.appendSystemMessage(ticket, opts.systemType, opts.body);
      return ticket;
    } catch (e: any) {
      // Loud in the log, silent to the caller. The settings save that
      // triggered this must still succeed.
      this.logger.error(`system ticket (${opts.systemType}) failed: ${e?.message ?? e}`);
      return null;
    }
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
