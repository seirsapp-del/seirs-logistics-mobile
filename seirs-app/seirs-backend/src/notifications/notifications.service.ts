import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';
import { FcmService } from './fcm.service';
import { User } from '../users/user.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  // Set lazily by NotificationsModule to avoid circular deps
  trackingGateway?: any;

  constructor(
    @InjectRepository(Notification) private repo: Repository<Notification>,
    @InjectRepository(User)         private usersRepo: Repository<User>,
    private readonly fcm: FcmService,
  ) {}

  async create(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    deliveryId?: string,
    trackingCode?: string,
  ): Promise<Notification> {
    const notif = this.repo.create({ userId, title, body, type, deliveryId, trackingCode });
    const saved = await this.repo.save(notif);

    // Push to user's socket room if they're connected
    if (this.trackingGateway) {
      this.trackingGateway.notifyUser(userId, saved);
    }

    // Send FCM push notification
    this.sendPush(userId, title, body, {
      type,
      ...(deliveryId    && { deliveryId }),
      ...(trackingCode  && { trackingCode }),
    }).catch(() => {/* non-fatal */});

    return saved;
  }

  private async sendPush(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { id: userId }, select: ['id', 'fcmToken'] });
    if (!user?.fcmToken) return;

    const tokenIsStale = await this.fcm.sendToToken(user.fcmToken, title, body, data);
    if (tokenIsStale) {
      // Clear invalid token so we stop trying to push to it
      await this.usersRepo.update(userId, { fcmToken: null });
    }
  }

  async findByUser(userId: string, page = 1, limit = 20) {
    const [items, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  countUnread(userId: string) {
    return this.repo.count({ where: { userId, isRead: false } });
  }

  async markRead(id: string, userId: string) {
    await this.repo.update({ id, userId }, { isRead: true });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.repo.update({ userId, isRead: false }, { isRead: true });
    return { success: true };
  }

  // ── Convenience helpers called from DeliveriesService ───────────────────────

  notifyDeliveryAssigned(customerId: string, trackingCode: string, driverName: string, deliveryId: string) {
    return this.create(
      customerId,
      'Driver Assigned!',
      `${driverName} is heading to pick up your package (${trackingCode}).`,
      NotificationType.DELIVERY_ASSIGNED,
      deliveryId,
      trackingCode,
    );
  }

  notifyStatusUpdate(customerId: string, trackingCode: string, status: string, deliveryId: string) {
    const messages: Record<string, string> = {
      picked_up:  `Your package (${trackingCode}) has been collected and is with the driver.`,
      in_transit: `Your package (${trackingCode}) is on its way to you!`,
      failed:     `Delivery of ${trackingCode} could not be completed. Contact support.`,
      cancelled:  `Your delivery (${trackingCode}) has been cancelled.`,
    };
    const body = messages[status];
    if (!body) return Promise.resolve(null);
    return this.create(
      customerId,
      'Delivery Update',
      body,
      NotificationType.STATUS_UPDATE,
      deliveryId,
      trackingCode,
    );
  }

  notifyDeliveryComplete(customerId: string, trackingCode: string, deliveryId: string) {
    return this.create(
      customerId,
      'Package Delivered!',
      `Your package (${trackingCode}) has been delivered. Tap to rate your experience.`,
      NotificationType.DELIVERY_COMPLETE,
      deliveryId,
      trackingCode,
    );
  }

  notifyNewJob(driverId: string, trackingCode: string, earnings: number, deliveryId: string) {
    return this.create(
      driverId,
      'New Delivery Job!',
      `Earn ₦${Math.round(earnings).toLocaleString()} — package ${trackingCode} is ready for pickup.`,
      NotificationType.JOB_REQUEST,
      deliveryId,
      trackingCode,
    );
  }

  notifyPaymentReceived(driverId: string, amount: number) {
    return this.create(
      driverId,
      'Payment Received!',
      `₦${Math.round(amount).toLocaleString()} has been credited to your wallet.`,
      NotificationType.PAYMENT_RECEIVED,
    );
  }
}
