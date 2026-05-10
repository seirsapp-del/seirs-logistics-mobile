import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';
import { TrackingGateway } from '../tracking/tracking.gateway';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage) private readonly repo:           Repository<ChatMessage>,
    @InjectRepository(Delivery)    private readonly deliveriesRepo: Repository<Delivery>,
    private readonly trackingGateway: TrackingGateway,
  ) {}

  /**
   * Verify the requesting user is either the customer or the assigned
   * driver for this delivery. Anyone else is rejected — chats are
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

  async send(deliveryId: string, sender: User, body: string) {
    const trimmed = body?.trim();
    if (!trimmed) throw new NotFoundException('Message cannot be empty.');
    if (trimmed.length > 2000) throw new NotFoundException('Message too long.');

    const delivery = await this.assertParticipant(deliveryId, sender.id);

    const msg = this.repo.create({
      delivery,
      sender,
      body: trimmed,
    });
    const saved = await this.repo.save(msg);

    // Real-time fan-out. The other party's chat screen subscribes to
    // `chat:<deliveryId>` and receives this `chat:message` event.
    this.trackingGateway.broadcastChatMessage(deliveryId, {
      id:        saved.id,
      body:      saved.body,
      senderId:  sender.id,
      createdAt: saved.createdAt,
    });

    return saved;
  }

  /** Count unread messages across all of a user's deliveries. Used by the
   *  Messages tab badge. Cheap query — single COUNT with a join. */
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
   * List the user's chat conversations — one entry per delivery they're
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
