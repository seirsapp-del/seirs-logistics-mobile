import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SosAlert, SosStatus } from './sos-alert.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { User, UserRole } from '../users/user.entity';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';

@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    @InjectRepository(SosAlert) private readonly repo:           Repository<SosAlert>,
    @InjectRepository(Delivery) private readonly deliveriesRepo: Repository<Delivery>,
    private readonly trackingGateway: TrackingGateway,
    private readonly notifications:   NotificationsService,
  ) {}

  /**
   * Customer or driver presses the SOS button. Persists the event for the
   * audit log, then fans out via WS:
   *   - all admins (room `admin`) get a real-time alert
   *   - if there's an active delivery, the *other* party (driver if the
   *     customer triggered, customer if the driver triggered) gets it too
   *     so they know support is being engaged
   */
  async trigger(
    user: User,
    body: { deliveryId?: string; lat?: number; lng?: number; note?: string },
  ): Promise<SosAlert> {
    let delivery: Delivery | null = null;
    if (body.deliveryId) {
      delivery = await this.deliveriesRepo.findOne({
        where: { id: body.deliveryId },
        relations: ['customer', 'driver', 'driver.user'],
      });
      if (!delivery) throw new NotFoundException('Delivery not found.');

      /**
       * The caller must actually be on this trip.
       *
       * Any authenticated account could attach an alert to any delivery
       * id (confirmed on production 2026-08-24). Two harms: admins saw a
       * false SOS against a stranger's trip, and the notify-the-other-
       * party branch below then pushed "<name> pressed SOS during your
       * active trip" to that stranger.
       *
       * An SOS with no deliveryId is always allowed: someone in trouble
       * away from a booking still needs the button.
       */
      const isParty =
        delivery.customer?.id === user.id ||
        delivery.driver?.user?.id === user.id;
      if (!isParty) {
        throw new ForbiddenException('You are not on this trip.');
      }
    }

    const alert = this.repo.create({
      user,
      delivery,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      note: body.note?.slice(0, 500) ?? null,
      status: SosStatus.ACTIVE,
    });
    const saved = await this.repo.save(alert);

    this.logger.warn(
      `SOS triggered by user=${user.id} delivery=${delivery?.id ?? 'none'} ` +
      `at lat=${body.lat ?? '?'},lng=${body.lng ?? '?'}`,
    );

    // Real-time fan-out to admins.
    this.trackingGateway.broadcastSosAlert({
      id:         saved.id,
      userId:     user.id,
      userName:   user.name,
      userPhone:  user.phone,
      deliveryId: delivery?.id ?? null,
      lat:        body.lat ?? null,
      lng:        body.lng ?? null,
      note:       saved.note,
      createdAt:  saved.createdAt,
    });

    // Notify the other party in the trip if applicable.
    if (delivery) {
      const otherUserId =
        delivery.customer?.id === user.id
          ? delivery.driver?.user?.id
          : delivery.customer?.id;
      if (otherUserId) {
        this.trackingGateway.notifyUser(otherUserId, {
          type:       'sos:peer-alert',
          alertId:    saved.id,
          deliveryId: delivery.id,
          message:    `${user.name} pressed SOS - SEIRS support has been alerted.`,
        });

        // Persistent notification + (when FCM fully wired) push.
        this.notifications
          .create(
            otherUserId,
            'SOS - SEIRS support alerted',
            `${user.name} pressed SOS during your active trip. Support is engaging.`,
            NotificationType.SOS_ALERT,
            delivery.id,
            delivery.trackingCode,
          )
          .catch(() => {});
      }
    }

    return saved;
  }

  /** User cancels their own active alert (false alarm). */
  async cancel(alertId: string, user: User): Promise<SosAlert> {
    const alert = await this.repo.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException('Alert not found.');
    if (alert.user.id !== user.id) throw new ForbiddenException('Not your alert.');
    if (alert.status !== SosStatus.ACTIVE) return alert;

    alert.status     = SosStatus.CANCELLED;
    alert.resolvedAt = new Date();
    alert.resolvedBy = user;
    return this.repo.save(alert);
  }

  /** Admin marks an alert as handled. */
  /**
   * The raiser adds detail to an alert that has ALREADY gone out.
   *
   * An SOS must never be a form: you press once and help is called. So
   * the app fires first and asks what is happening afterwards, and this
   * is where that answer lands. Ops sees the note appear on the card
   * seconds after the red flag, which is the difference between
   * "someone pressed SOS" and "someone pressed SOS because a passenger
   * is threatening them".
   *
   * Only the person who raised it, and only while it is still active.
   */
  async addNote(alertId: string, user: User, note: string): Promise<SosAlert> {
    const alert = await this.repo.findOne({
      where: { id: alertId },
      relations: ['user'],
    });
    if (!alert) throw new NotFoundException('Alert not found.');
    if (alert.user?.id !== user.id) throw new ForbiddenException('Not your alert.');

    const clean = String(note ?? '').trim();
    if (!clean) throw new BadRequestException('Say what is happening.');
    alert.note = clean.slice(0, 500);
    const saved = await this.repo.save(alert);

    // Push it to the admins already watching this alert.
    this.trackingGateway.broadcastSosAlert({
      id:        saved.id,
      userId:    user.id,
      userName:  user.name,
      userPhone: user.phone,
      deliveryId: (saved as any).delivery?.id ?? null,
      lat:       saved.lat,
      lng:       saved.lng,
      note:      saved.note,
      createdAt: saved.createdAt,
    });
    return saved;
  }

  async resolve(alertId: string, admin: User, resolutionNote?: string): Promise<SosAlert> {
    if (admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin only.');
    }
    const alert = await this.repo.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException('Alert not found.');
    alert.status     = SosStatus.RESOLVED;
    alert.resolvedAt = new Date();
    alert.resolvedBy = admin;
    // What was done about it, so the queue can be reviewed later.
    const note = String(resolutionNote ?? '').trim();
    if (note) alert.resolutionNote = note.slice(0, 1000);
    return this.repo.save(alert);
  }

  /** All currently-active alerts (admin dashboard feed). */
  async listActive(admin: User) {
    if (admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin only.');
    }
    /**
     * delivery is @ManyToOne without eager, so without this relation
     * a.delivery was always undefined and the admin card's
     * "Open their booking" link never rendered: on the one screen
     * whose job is the first minute of an emergency.
     */
    return this.repo.find({
      where: { status: SosStatus.ACTIVE },
      relations: ['delivery'],
      order: { createdAt: 'DESC' },
      take:  100,
    });
  }
}
