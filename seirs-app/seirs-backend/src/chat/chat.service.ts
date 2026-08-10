import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage) private readonly repo:           Repository<ChatMessage>,
    @InjectRepository(Delivery)    private readonly deliveriesRepo: Repository<Delivery>,
    private readonly trackingGateway: TrackingGateway,
    private readonly notifications:   NotificationsService,
  ) {}

  /**
   * Verify the requesting user is either the customer or the assigned
   * driver for this delivery. Anyone else is rejected: chats are
   * scoped to the two parties.
   */
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
    await this.assertParticipant(deliveryId, userId);
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

    return messages.reverse();
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
        const closedAt = new Date(delivery.deliveredAt).getTime() + 60 * 60 * 1000; // +1hr
        if (now > closedAt) {
          throw new ForbiddenException(
            'This chat closed 1 hour after delivery. Contact SEIRS support if you need help.',
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

    return saved;
  }

  /** Count unread messages across all of a user's deliveries. Used by the
   *  Messages tab badge. Cheap query, single COUNT with a join. */
  async unreadCount(userId: string): Promise<number> {
    return this.repo
      .createQueryBuilder('m')
      .innerJoin('m.delivery', 'd')
      .leftJoin('d.driver',   'driver')
      .where('m.senderId != :userId', { userId })
      .andWhere('m.readAt IS NULL')
      .andWhere('(d.customerId = :userId OR driver.userId = :userId)', { userId })
      .getCount();
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
    const deliveries = await this.deliveriesRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'customer')
      .leftJoinAndSelect('d.driver',   'driver')
      .leftJoinAndSelect('driver.user', 'driverUser')
      .where('d.customerId = :userId OR driverUser.id = :userId', { userId })
      .orderBy('d.updatedAt', 'DESC')
      .limit(100)
      .getMany();

    if (deliveries.length === 0) return [];

    const deliveryIds = deliveries.map(d => d.id);

    // Fetch latest message + unread count for each delivery in two queries.
    const latestRows = await this.repo
      .createQueryBuilder('m')
      .select(['m.id', 'm.body', 'm.senderId', 'm.createdAt', 'm.deliveryId'])
      .where('m.deliveryId IN (:...ids)', { ids: deliveryIds })
      .orderBy('m.createdAt', 'DESC')
      .getMany();

    const latestByDelivery = new Map<string, ChatMessage>();
    for (const row of latestRows) {
      const did = (row as any).deliveryId;
      if (!latestByDelivery.has(did)) latestByDelivery.set(did, row);
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
        const otherParty = isCustomer
          ? {
              id:    d.driver?.user?.id ?? null,
              name:  d.driver?.user?.name ?? 'Driver',
              role:  'driver' as const,
            }
          : {
              id:    d.customer?.id ?? null,
              name:  d.customer?.name ?? 'Customer',
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
