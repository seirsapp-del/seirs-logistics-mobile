import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
   *   - An Expo push token (ExponentPushToken[xxx]) - backend's FcmService
   *     supports both because we send via Expo's push service in dev and
   *     FCM directly in production.
   * Empty/null tokens clear the field (e.g. on logout).
   */
  async registerToken(userId: string, token: string | null): Promise<void> {
    const trimmed = token?.trim() || null;
    await this.usersRepo.update(userId, { fcmToken: trimmed });
  }

  /**
   * Which preference key, if any, gates a notification type.
   *
   * users.notificationPrefs existed and was editable, but nothing on the
   * send path ever read it, so every switch in the apps was decorative
   * (found 2026-08-16 while shipping the business settings screen).
   *
   * Types absent from this map are never suppressed, which is nearly all
   * of them. Founder 2026-08-16: "payment recieved cant be optional who
   * would want to know if their payment went through" and "who wouldnt
   * want to know the status of their packages". Status updates,
   * assignment, completion, failures, receipts, payouts, job offers, SOS,
   * chat and system messages therefore always send, and the apps do not
   * list them as settings at all rather than showing a locked row that
   * pretends to be one.
   */
  private static readonly PREF_KEY_BY_TYPE: Partial<Record<NotificationType, string>> = {
    // Marketing blasts go out as GENERAL. Everything else, including
    // every status change, is operational and always sends.
    [NotificationType.GENERAL]: 'marketing',
  };

  /** False when the recipient has explicitly switched this type off. */
  private async wantsNotification(userId: string, type: NotificationType): Promise<boolean> {
    const key = NotificationsService.PREF_KEY_BY_TYPE[type];
    if (!key) return true;
    try {
      const rows = await this.repo.manager.query(
        'SELECT "notificationPrefs" AS p FROM users WHERE id = $1 LIMIT 1', [userId],
      );
      const prefs = rows?.[0]?.p ?? {};
      return prefs[key] !== false;   // never set means on
    } catch {
      return true;                   // never lose a notification to a lookup failure
    }
  }

  async create(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    deliveryId?: string,
    trackingCode?: string,
  ): Promise<Notification> {
    if (!(await this.wantsNotification(userId, type))) {
      // Suppressed by the recipient's own preference. Nothing is stored
      // and nothing is pushed, so the inbox matches what they asked for.
      return this.repo.create({ userId, title, body, type, deliveryId, trackingCode });
    }
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

  /** Swipe-to-dismiss. Scoped by userId so nobody deletes another user's rows. */
  async remove(id: string, userId: string) {
    await this.repo.delete({ id, userId });
    return { success: true };
  }

  /** Mass clear (founder 2026-08-10: nobody deletes 100 rows one by one). */
  async removeAll(userId: string, onlyRead: boolean) {
    const where = onlyRead ? { userId, isRead: true } : { userId };
    const r = await this.repo.delete(where);
    return { success: true, deleted: r.affected ?? 0 };
  }

  // Retention (founder question 2026-08-09 "does it just keep piling
  // up?"): notifications are ephemeral by nature. Read ones go after 90
  // days, unread after 180, so the table never grows unbounded and old
  // phones never page through years of noise. Runs nightly at 3 AM.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldNotifications() {
    try {
      const readCutoff   = new Date(Date.now() -  90 * 24 * 3600 * 1000);
      const unreadCutoff = new Date(Date.now() - 180 * 24 * 3600 * 1000);
      const r1 = await this.repo
        .createQueryBuilder().delete()
        .where('"isRead" = true AND "createdAt" < :cutoff', { cutoff: readCutoff })
        .execute();
      const r2 = await this.repo
        .createQueryBuilder().delete()
        .where('"createdAt" < :cutoff', { cutoff: unreadCutoff })
        .execute();
      const total = (r1.affected ?? 0) + (r2.affected ?? 0);
      if (total) this.logger.log(`Pruned ${total} old notifications`);
    } catch (e: any) {
      this.logger.warn(`notification prune failed: ${e?.message ?? e}`);
    }
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
      `Earn ₦${Math.round(earnings).toLocaleString()} - package ${trackingCode} is ready for pickup.`,
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

  // ── Admin broadcast - Spec V8 §3.13 ──────────────────────────────────────
  // Fan-out for ops events (service interruptions, weather alerts).
  // Resolves the audience to a user-id list, persists one notification
  // row per recipient (so they show up in the in-app notification
  // centre), and pushes via FCM. Returns counts for the admin UI.
  /**
   * Message ONE person (founder 2026-08-13: "i see the general
   * notification but what about single notification to specific user").
   *
   * Support work is mostly one customer at a time: chasing a document,
   * explaining a refund, telling a driver their bank change was
   * approved. Until now the only tool was a broadcast to every customer
   * on the platform, which nobody would use for that, so those messages
   * happened on WhatsApp with no record.
   *
   * Reuses create(), so the message lands in the in-app inbox, the live
   * socket, and push, exactly like a system notification.
   */
  async sendToUser(input: {
    userId: string;
    title:  string;
    body:   string;
  }): Promise<{ delivered: boolean; hasPushToken: boolean; recipientName: string }> {
    const title = input.title?.trim();
    const body  = input.body?.trim();
    if (!title || !body) throw new BadRequestException('Title and message are both required.');

    const user = await this.usersRepo.findOne({
      where:  { id: input.userId },
      select: ['id', 'name', 'fcmToken', 'isActive'],
    });
    if (!user) throw new NotFoundException('That account no longer exists.');
    if (user.isActive === false) {
      throw new BadRequestException('That account is deactivated and will not receive messages.');
    }

    await this.create(user.id, title, body, NotificationType.SYSTEM);

    // Report honestly whether a push could actually go out. Without a
    // token the message still reaches the in-app inbox, but the person
    // sees nothing until they open the app, and support needs to know
    // that rather than assume it was delivered to their lock screen.
    return {
      delivered:     true,
      hasPushToken:  !!user.fcmToken,
      recipientName: user.name ?? 'this user',
    };
  }

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

    // FCM push - best-effort, ignore individual failures.
    let pushed = 0;
    const tokens = recipients.map(r => r.fcmToken).filter((t): t is string => !!t);
    await Promise.all(tokens.map(async token => {
      const stale = await this.fcm.sendToToken(token, title, body, { type: 'broadcast' }).catch(() => true);
      if (!stale) pushed++;
    }));

    this.logger.log(`Broadcast to ${audience}${zone ? `:${zone}` : ''} - ${recipients.length} users, ${pushed} pushed`);
    return { recipients: recipients.length, pushed };
  }

  private async resolveAudience(audience: BroadcastAudience, zone?: string): Promise<Array<Pick<User, 'id' | 'fcmToken'>>> {
    // 'specific_zone' is a future-ship - Geo-fence by city/LGA needs an
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
