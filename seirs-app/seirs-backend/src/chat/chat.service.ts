import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { FeesService } from '../fees/fees.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage) private readonly repo:           Repository<ChatMessage>,
    @InjectRepository(Delivery)    private readonly deliveriesRepo: Repository<Delivery>,
    private readonly trackingGateway: TrackingGateway,
    private readonly notifications:   NotificationsService,
    /**
     * Optional on purpose. If config is ever unreachable the chat falls back
     * to the seeded four hours rather than failing to send: a message between
     * two people trying to meet must not depend on the Fee Catalogue.
     */
    private readonly fees?: FeesService,
  ) {}

  /**
   * Verify the requesting user is either the customer or the assigned
   * driver for this delivery. Anyone else is rejected: chats are
   * scoped to the two parties.
   */
  /**
   * When is this actually departing?
   *
   * Two different rows carry it. A scheduled delivery has scheduledFor. A
   * seat or load booked onto a declared intercity trip does NOT: it carries
   * a tripId, and the departure lives on driver_trips. That gap is why the
   * fifteen-minute dispatch hold never applied to trip bookings either.
   *
   * Returns null for Send Now, which is the signal to leave chat open.
   */
  private async departureFor(delivery: Delivery): Promise<Date | null> {
    if (delivery.scheduledFor) {
      const d = new Date(delivery.scheduledFor);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const tripId = (delivery as any).tripId;
    if (!tripId) return null;
    try {
      const rows: Array<{ departAt: Date }> = await this.deliveriesRepo.manager.query(
        `SELECT t."departAt" FROM "driver_trips" t WHERE t."id" = $1 LIMIT 1`,
        [tripId],
      );
      const raw = rows?.[0]?.departAt;
      if (!raw) return null;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      // Unknown departure opens the chat rather than closing it. A lookup
      // failure must never be able to silence two people trying to meet.
      return null;
    }
  }

  private async assertParticipant(deliveryId: string, userId: string): Promise<Delivery> {
    const delivery = await this.deliveriesRepo.findOne({
      where: { id: deliveryId },
      relations: ['customer', 'driver', 'driver.user'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    const isCustomer = delivery.customer?.id === userId;
    const isDriver   = delivery.driver?.user?.id === userId;
    if (!isCustomer && !isDriver) {
      throw new ForbiddenException('You are not part of this conversation.');
    }
    return delivery;
  }

  /** Latest N messages for a delivery, oldest first (FlatList-friendly). */
  async list(deliveryId: string, userId: string, limit: number = 100) {
    const delivery = await this.assertParticipant(deliveryId, userId);
    const safeLimit = Math.min(500, Math.max(1, Number(limit)));

    const messages = await this.repo.find({
      where: { delivery: { id: deliveryId } },
      order: { createdAt: 'DESC' },
      take:  safeLimit,
    });

    // Mark messages from the *other* party as read (read receipts).
    await this.repo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ readAt: new Date() })
      .where('deliveryId = :deliveryId', { deliveryId })
      .andWhere('senderId != :userId', { userId })
      .andWhere('readAt IS NULL')
      .execute();

    return messages.reverse().map((m) => this.withSafeSender(m, delivery));
  }

  /**
   * Reduce a message's sender to what a chat bubble actually needs.
   *
   * ChatMessage.sender is eager with no column selection, so every
   * message carried the sender's whole User row: email, phone, date of
   * birth, home address with coordinates, emergency contacts, bank
   * account, push token, lockout state. It leaked in BOTH directions on
   * every delivery (found 2026-08-24).
   *
   * The asymmetry is deliberate and matches the founder rule: a driver
   * is ALWAYS fully identified to the customer, while a passenger on a
   * ride is a first name only. Nobody ever needs the rest of the row.
   */
  private withSafeSender(m: any, delivery?: any) {
    const u = m?.sender;
    if (!u) return m;
    const isRide       = String(delivery?.kind ?? 'package') === 'ride';
    const senderIsRider = delivery?.customer?.id === u.id;
    const first = String(u.firstName ?? u.name ?? '').trim().split(/\s+/)[0] || 'User';
    /**
     * senderId, flat, alongside the reduced sender object.
     *
     * Every chat client decides which side of the screen a bubble
     * goes on with `item.senderId === myUserId`, but ChatMessage
     * exposes the sender RELATION and never the foreign key, so
     * senderId was absent from the payload entirely. undefined ===
     * myId is false for every message, so EVERY message rendered as
     * the other party: left aligned, wrong avatar, in all three
     * apps. Founder spotted it 2026-08-24: "why is every chat on the
     * left side".
     *
     * Same root cause as the empty inbox: a foreign key the entity
     * never declared. System messages keep senderId null, which is
     * what the clients already test for to render a centred pill.
     */
    (m as any).senderId = u.id ?? null;
    m.sender = {
      id:           u.id,
      // A ride passenger is first-name-only to the other side; the
      // driver keeps their full name because riders must be identifiable.
      name:         (isRide && senderIsRider) ? first : (u.name ?? first),
      firstName:    first,
      profilePhoto: u.profilePhoto ?? null,
      role:         u.role ?? null,
    };
    return m;
  }

  /**
   * Insert a system message into a delivery's chat. Called by the platform
   * when significant state changes happen (driver assigned, picked up,
   * delivered, cancelled) so both parties see the event inline without
   * switching to a tracking screen. Broadcasts over the same WebSocket
   * channel so the chat updates in real-time. Best-effort; failures are
   * logged but never break the state transition that triggered it.
   *
   * `systemType` is a stable enum-like slug the client renders via i18n.
   * `body` is the English fallback so old clients still get readable text.
   */
  async insertSystemMessage(
    deliveryId: string,
    systemType: string,
    body: string,
  ): Promise<ChatMessage | null> {
    try {
      const delivery = await this.deliveriesRepo.findOne({ where: { id: deliveryId } });
      if (!delivery) return null;

      const msg = this.repo.create({
        delivery,
        sender: null,
        body,
        systemType,
      } as any);
      const saved = await this.repo.save(msg as any) as unknown as ChatMessage;

      // Broadcast so any open chat screens immediately show the new
      // system pill. `senderId: null` is the client's signal to render as
      // a centered status message rather than a chat bubble.
      try {
        this.trackingGateway.broadcastChatMessage(deliveryId, {
          id:         saved.id,
          body:       saved.body,
          senderId:   null,
          systemType: saved.systemType,
          createdAt:  saved.createdAt,
        } as any);
      } catch { /* ignored: realtime is best-effort */ }

      return saved;
    } catch {
      // Never let a chat insertion failure break the delivery state
      // change that triggered it. Just log via return null.
      return null;
    }
  }

  /**
   * Explicit mark-as-read. Used by clients that want to flip receipts
   * without paginating the full message list. Idempotent.
   */
  async markRead(deliveryId: string, userId: string): Promise<void> {
    await this.assertParticipant(deliveryId, userId);
    await this.repo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ readAt: new Date() })
      .where('deliveryId = :deliveryId', { deliveryId })
      .andWhere('senderId != :userId OR senderId IS NULL', { userId })
      .andWhere('readAt IS NULL')
      .execute();
  }

  async send(deliveryId: string, sender: User, body: string, imageUrl?: string | null) {
    const trimmedBody = (body ?? '').trim();
    const cleanImage  = (imageUrl ?? '').trim() || null;

    // Reject messages that have neither text nor an image. Image-only is fine.
    if (!trimmedBody && !cleanImage) {
      throw new NotFoundException('Message cannot be empty.');
    }
    if (trimmedBody.length > 2000) throw new NotFoundException('Message too long.');

    const delivery = await this.assertParticipant(deliveryId, sender.id);

    /**
     * The OTHER end of the gate, which did not exist (founder 2026-09-04).
     *
     * Chat closed an hour after delivery and opened the instant a rider was
     * attached. On a trip declared a month ahead that is a month of
     * unmonitored contact between two strangers, which is a safety exposure
     * and a route around SEIRS at the same time. His words: "imaging after
     * accept a user they both start chatting for a month, that can be
     * dangerous for us".
     *
     * Four hours before departure, his number, and his reasoning is the one
     * that matters: it is not about time to chat, it is about time to get
     * yourself and your luggage to the park. Like a flight, you arrive early.
     *
     * Only applies where a departure is actually known. A Send Now delivery
     * has no scheduled time and opens on acceptance exactly as before,
     * because the rider is already coming. An unreadable or missing time
     * therefore opens the chat rather than closing it: this must never be
     * able to silence two people who are trying to meet right now.
     */
    const departsAt = await this.departureFor(delivery);
    if (departsAt) {
      let hours = 4;
      if (this.fees) {
        try { hours = Number(await this.fees.getValueOr('chat_opens_hours_before', 4)); }
        catch { /* seeded default stands */ }
      }
      if (Number.isFinite(hours) && hours > 0) {
        const opensAt = departsAt.getTime() - hours * 60 * 60 * 1000;
        if (Date.now() < opensAt) {
          throw new ForbiddenException(
            `Messages open ${hours} hour${hours === 1 ? '' : 's'} before departure, `
            + `which is ${new Date(opensAt).toLocaleString('en-NG')}. `
            + `Contact SEIRS support if something needs sorting before then.`,
          );
        }
      }
    }

    // TTL policy: delivery chats close for new messages 1 hour after
    // the delivered timestamp. Terminal failures close immediately.
    // The full history stays readable (list() is unaffected) and is
    // never deleted - this is a WRITE gate only, so PII exposure stays
    // frozen at the moment the trip context ends.
    //
    // Admin override: when support is investigating an issue, an admin
    // can set delivery.chatReopenedUntil to a future timestamp, which
    // re-opens the thread until then. The re-open action is audit-
    // logged on the admin side.
    const now = Date.now();
    const reopenedUntil = delivery.chatReopenedUntil ? new Date(delivery.chatReopenedUntil).getTime() : 0;
    const isReopened    = reopenedUntil > now;
    if (!isReopened) {
      if (delivery.status === 'cancelled' || delivery.status === 'failed') {
        throw new ForbiddenException(
          'This chat is closed. Contact SEIRS support if you need help with this delivery.',
        );
      }
      if (delivery.status === 'delivered' && delivery.deliveredAt) {
        /**
         * The one hour is now a Fee Catalogue row rather than a constant
         * (founder 2026-09-04, asking for both ends to be tunable).
         *
         * Kept at one hour on his reasoning: a passenger who has left
         * something behind needs a moment to say so, and after that it is
         * support's job, because a thread nobody closes is a thread nobody
         * is watching.
         */
        let closeHours = 1;
        if (this.fees) {
          try { closeHours = Number(await this.fees.getValueOr('chat_closes_hours_after', 1)); }
          catch { /* seeded default stands */ }
        }
        if (!Number.isFinite(closeHours) || closeHours < 0) closeHours = 1;
        const closedAt = new Date(delivery.deliveredAt).getTime() + closeHours * 60 * 60 * 1000;
        if (now > closedAt) {
          throw new ForbiddenException(
            `This chat closed ${closeHours} hour${closeHours === 1 ? '' : 's'} after delivery. `
            + 'Contact SEIRS support if you need help.',
          );
        }
      }
    }

    const msg = this.repo.create({
      delivery,
      sender,
      body:     trimmedBody,
      imageUrl: cleanImage,
    });
    const saved = await this.repo.save(msg);

    // Real-time fan-out. The other party's chat screen subscribes to
    // `chat:<deliveryId>` and receives this `chat:message` event.
    this.trackingGateway.broadcastChatMessage(deliveryId, {
      id:        saved.id,
      body:      saved.body,
      senderId:  sender.id,
      imageUrl:  saved.imageUrl,
      createdAt: saved.createdAt,
    } as any);

    // Persistent notification for the recipient: surfaces in their
    // notification bell + (when FCM is fully wired) fires a push so
    // they see it even if the chat screen isn't open.
    const recipientId =
      delivery.customer?.id === sender.id
        ? delivery.driver?.user?.id
        : delivery.customer?.id;
    if (recipientId) {
      // Compose a short preview. Prefer the caption text; when the message
      // is image-only, surface a "Photo" placeholder so the notification
      // still reads meaningfully.
      const previewText = trimmedBody
        ? (trimmedBody.length > 80 ? `${trimmedBody.slice(0, 77)}…` : trimmedBody)
        : (cleanImage ? 'Sent a photo' : 'New message');

      // Fire-and-forget. Chat send response shouldn't block on notif persistence.
      this.notifications
        .create(
          recipientId,
          sender.name ?? 'New message',
          previewText,
          NotificationType.CHAT_MESSAGE,
          delivery.id,
          delivery.trackingCode,
        )
        .catch(() => { /* logged inside service */ });
    }

    // saved carries the eager sender relation, i.e. the sender's
    // whole User row. Same leak as list(), same fix.
    return this.withSafeSender(saved as any, delivery);
  }

  /**
   * Unread messages across a user's deliveries AND their support tickets.
   *
   * This used to innerJoin m.delivery, which quietly excluded every
   * message that is not attached to a delivery. Support threads carry a
   * ticketId and no delivery, so anything SEIRS said to a user through
   * support was invisible to the badge: the message arrived, the inbox
   * showed it, and nothing on the tab said to go and look.
   *
   * Found 2026-08-27 when an approved bank change wrote a system
   * message into the ticket thread and the founder observed that "the
   * indication I asked for at the bottom of a message so a person knows
   * they have an unread message did not show". The badge was there; it
   * simply could not see this class of message.
   *
   * That matters most for exactly the messages this covers: an account
   * or payout change a person needs to notice quickly.
   */
  async unreadCount(userId: string): Promise<number> {
    const deliveryUnread = await this.repo
      .createQueryBuilder('m')
      .innerJoin('m.delivery', 'd')
      .leftJoin('d.driver',   'driver')
      .where('m.senderId != :userId', { userId })
      .andWhere('m.readAt IS NULL')
      .andWhere('(d.customerId = :userId OR driver.userId = :userId)', { userId })
      .getCount()
      .catch(() => 0);

    /**
     * Ticket threads. A system message has no sender at all, so the
     * senderId test has to admit NULL rather than compare it: in SQL
     * `NULL != :userId` is NULL, which is not true, so the row is
     * dropped. That alone would have hidden every automated notice.
     */
    let ticketUnread = 0;
    try {
      const row = await this.repo
        .createQueryBuilder('m')
        .innerJoin('support_tickets', 't', 't.id = m."ticketId"')
        .where('m."ticketId" IS NOT NULL')
        .andWhere('m.readAt IS NULL')
        /**
         * Human messages only (founder 2026-09-06: "I keep seeing the
         * number on Messages and that's false"). Automated notices have
         * no sender and they were counting; a person opened Messages for a
         * reply and found a system line. They still show in the inbox,
         * they just do not badge it.
         */
        .andWhere('m.senderId IS NOT NULL')
        .andWhere('m.senderId != :userId', { userId })
        .andWhere('t."userId" = :userId', { userId })
        .select('COUNT(*)', 'c')
        .getRawOne();
      ticketUnread = Number(row?.c ?? 0) || 0;
    } catch (e: any) {
      // Say so rather than returning a plausible number: a badge that
      // silently reads low is how a person misses a payout change.
      // eslint-disable-next-line no-console
      console.warn(`Ticket unread count failed for ${userId}: ${e?.message}`);
    }

    return deliveryUnread + ticketUnread;
  }

  /**
   * List the user's chat conversations: one entry per delivery they're
   * part of, with the last message + unread count + the other party's
   * display info. Drives the Messages tab list on both customer and
   * driver apps.
   *
   * Implementation: fetch all deliveries the user participates in along
   * with their messages eager-loaded, then derive the latest message
   * client-side. Cheap for the foreseeable user volume; can be moved to
   * a window-function query if it ever gets slow.
   */
  async listConversations(userId: string) {
    /**
     * Named columns, not AndSelect.
     *
     * customer and driverUser are User entities, so AndSelect loaded
     * bank details, BVN, date of birth, home address, next of kin,
     * device hashes and lockout state to render a first name and an
     * avatar letter. The mapping below sends almost none of it, which is
     * one refactor away from sending all of it, and a driver calling
     * this endpoint pulls the CUSTOMER's row.
     */
    const deliveries = await this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoin('d.customer', 'customer')
      .addSelect(['customer.id', 'customer.name', 'customer.firstName'])
      .leftJoin('d.driver',   'driver')
      .addSelect(['driver.id'])
      .leftJoin('driver.user', 'driverUser')
      .addSelect(['driverUser.id', 'driverUser.name'])
      .where('d.customerId = :userId OR driverUser.id = :userId', { userId })
      .orderBy('d.updatedAt', 'DESC')
      .limit(100)
      .getMany();

    if (deliveries.length === 0) return [];

    const deliveryIds = deliveries.map(d => d.id);

    // Fetch latest message + unread count for each delivery in two queries.
    /**
     * getRawMany, not getMany.
     *
     * This selected m.deliveryId and then read it off a hydrated
     * entity, but ChatMessage exposes the delivery RELATION, not the
     * foreign key, so the value was always undefined. Every
     * conversation keyed under undefined and was dropped, which left
     * BOTH inboxes permanently empty in all three apps while the
     * messages themselves saved and read fine inside a thread.
     * Raw rows return the actual column, so there is no entity
     * mapping left to get wrong.
     */
    const latestRaw = await this.repo
      .createQueryBuilder('m')
      .select('m.id',          'id')
      .addSelect('m.body',       'body')
      .addSelect('m.createdAt',  'createdAt')
      .addSelect('m.deliveryId', 'deliveryId')
      .where('m.deliveryId IN (:...ids)', { ids: deliveryIds })
      .orderBy('m.createdAt', 'DESC')
      .getRawMany<{ id: string; body: string; createdAt: Date; deliveryId: string }>();

    const latestByDelivery = new Map<string, { body: string; createdAt: Date }>();
    for (const row of latestRaw) {
      if (row.deliveryId && !latestByDelivery.has(row.deliveryId)) {
        latestByDelivery.set(row.deliveryId, { body: row.body, createdAt: row.createdAt });
      }
    }

    const unreadRows = await this.repo
      .createQueryBuilder('m')
      .select('m.deliveryId', 'deliveryId')
      .addSelect('COUNT(*)',  'count')
      .where('m.deliveryId IN (:...ids)', { ids: deliveryIds })
      .andWhere('m.senderId != :userId', { userId })
      .andWhere('m.readAt IS NULL')
      .groupBy('m.deliveryId')
      .getRawMany<{ deliveryId: string; count: string }>();

    const unreadByDelivery = new Map<string, number>();
    for (const row of unreadRows) {
      unreadByDelivery.set(row.deliveryId, Number(row.count));
    }

    // Strip down to a wire-friendly shape, dropping conversations that
    // have no messages yet (no chat to show).
    return deliveries
      .map(d => {
        const last = latestByDelivery.get(d.id);
        if (!last) return null;
        const isCustomer = d.customer?.id === userId;
        /**
         * No driver assigned means no driver to name (2026-08-29).
         *
         * This fell back to the literal string "Driver", so a customer's
         * inbox filled with rows headed by a person called Driver. Seen
         * on device: nine of ten threads, every one of them a delivery
         * cancelled before anybody was assigned, where the only message
         * is a platform notice like "Delivery was cancelled."
         *
         * There is no counterparty in those threads. Naming SEIRS is the
         * honest answer, and it also stops the inbox implying a rider
         * was involved in a job no rider ever took.
         */
        const driverName = d.driver?.user?.name?.trim();
        const otherParty = isCustomer
          ? {
              id:    d.driver?.user?.id ?? null,
              name:  driverName || 'SEIRS',
              role:  (driverName ? 'driver' : 'support') as 'driver' | 'support',
            }
          : {
              id:    d.customer?.id ?? null,
              // First name only to the driver (founder rule): the inbox
              // fed the full legal name into the thread header and every
              // message avatar. A surname here defeats the whole policy.
              name:  String(
                       (d as any).receiverFirstName
                       ?? d.customer?.firstName
                       ?? d.customer?.name
                       ?? 'Customer',
                     ).trim().split(/\s+/)[0] || 'Customer',
              role:  'customer' as const,
            };
        return {
          deliveryId:    d.id,
          trackingCode:  d.trackingCode,
          otherParty,
          lastMessage:   last.body,
          lastMessageAt: last.createdAt,
          unread:        unreadByDelivery.get(d.id) ?? 0,
        };
      })
      .filter(x => x !== null);
  }
}
