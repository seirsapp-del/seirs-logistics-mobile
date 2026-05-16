import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';
import { FcmService } from './fcm.service';
import { User, UserRole } from '../users/user.entity';

export type BroadcastAudience = 'all_customers' | 'all_drivers' | 'all_partners' | 'specific_zone';

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

  /**
   * Save a push token (FCM or Expo Push Token) against the current user.
   * Called by mobile apps after the user grants notification permission
   * on app launch / login. The token may be:
   *   - A native FCM token (Firebase Messaging)
   *   - An Expo push token (ExponentPushToken[xxx]) — backend's FcmService
   *     supports both because we send via Expo's push service in dev and
   *     FCM directly in production.
   * Empty/null tokens clear the field (e.g. on logout).
   */
  async registerToken(userId: string, token: string | null): Promise<void> {
    const trimmed = token?.trim() || null;
    await this.usersRepo.update(userId, { fcmToken: trimmed });
  }

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

  // ── Admin broadcast — Spec V8 §3.13 ──────────────────────────────────────
  // Fan-out for ops events (service interruptions, weather alerts).
  // Resolves the audience to a user-id list, persists one notification
  // row per recipient (so they show up in the in-app notification
  // centre), and pushes via FCM. Returns counts for the admin UI.
  async broadcastToAudience(input: {
    audience: BroadcastAudience;
    zone?: string;
    title: string;
    body:  string;
  }): Promise<{ recipients: number; pushed: number }> {
    const { audience, zone, title, body } = input;
    if (!title?.trim() || !body?.trim()) {
      throw new Error('Title and body required.');
    }

    const recipients = await this.resolveAudience(audience, zone);
    if (recipients.length === 0) return { recipients: 0, pushed: 0 };

    // Persist one Notification per recipient. Chunk inserts so we
    // don't blow the parameter limit on huge audiences.
    const CHUNK = 500;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const slice = recipients.slice(i, i + CHUNK);
      const rows = slice.map(u => this.repo.create({
        userId: u.id,
        title,
        body,
        type: NotificationType.SYSTEM,
      }));
      await this.repo.save(rows);
    }

    // FCM push — best-effort, ignore individual failures.
    let pushed = 0;
    const tokens = recipients.map(r => r.fcmToken).filter((t): t is string => !!t);
    await Promise.all(tokens.map(async token => {
      const stale = await this.fcm.sendToToken(token, title, body, { type: 'broadcast' }).catch(() => true);
      if (!stale) pushed++;
    }));

    this.logger.log(`Broadcast to ${audience}${zone ? `:${zone}` : ''} — ${recipients.length} users, ${pushed} pushed`);
    return { recipients: recipients.length, pushed };
  }

  private async resolveAudience(audience: BroadcastAudience, zone?: string): Promise<Array<Pick<User, 'id' | 'fcmToken'>>> {
    // 'specific_zone' is a future-ship — Geo-fence by city/LGA needs an
    // Address index, which isn't there yet. For now treat it as all
    // customers so the endpoint behaves predictably.
    if (audience === 'all_drivers') {
      return this.usersRepo.find({
        where: { role: UserRole.DRIVER, isActive: true },
        select: ['id', 'fcmToken'],
      });
    }
    if (audience === 'all_partners') {
      // Partner identity = User.capabilities.canPartner true. JSON
      // filter is awkward in TypeORM where(), so do a raw scan and
      // filter in code (partner population is small).
      const candidates = await this.usersRepo
        .createQueryBuilder('u')
        .where(`u.capabilities->>'canPartner' = 'true'`)
        .andWhere('u.isActive = true')
        .select(['u.id', 'u.fcmToken'])
        .getMany();
      return candidates;
    }
    // all_customers + specific_zone (zone-filter is a follow-up)
    return this.usersRepo.find({
      where: { role: UserRole.CUSTOMER, isActive: true },
      select: ['id', 'fcmToken'],
    });
  }
}
