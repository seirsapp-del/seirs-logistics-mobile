import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SosAlert, SosStatus } from './sos-alert.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { User, UserRole } from '../users/user.entity';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { AuditLogEntry } from '../admin/audit-log.entity';

@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    @InjectRepository(SosAlert) private readonly repo:           Repository<SosAlert>,
    @InjectRepository(Delivery) private readonly deliveriesRepo: Repository<Delivery>,
    @InjectRepository(AuditLogEntry) private readonly auditRepo:   Repository<AuditLogEntry>,
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
    const alert = await this.repo.findOne({ where: { id: alertId }, relations: ['user'] });
    if (!alert) throw new NotFoundException('Alert not found.');
    alert.status     = SosStatus.RESOLVED;
    alert.resolvedAt = new Date();
    alert.resolvedBy = admin;
    // What was done about it, so the queue can be reviewed later.
    const note = String(resolutionNote ?? '').trim();
    if (note) alert.resolutionNote = note.slice(0, 1000);
    const saved = await this.repo.save(alert);

    /**
     * Closing an emergency is an admin action and was not audited.
     *
     * resolvedBy and resolvedAt were on the alert row, so the fact was
     * not lost, but it sat outside the log every other admin action is
     * reviewed in: nobody auditing an operator's day would have seen
     * that they closed an SOS. Targeting the RAISER puts the closure on
     * that person's own admin timeline, which is where anyone asking
     * "what happened to them" is already looking.
     */
    await this.auditRepo.save(this.auditRepo.create({
      adminId:   admin.id,
      adminName: admin.name ?? 'unknown',
      action:    'sos.resolved',
      target:    `user:${(alert as any).user?.id ?? ''}`,
      meta: {
        alertId:        alert.id,
        raiser:         (alert as any).user?.name ?? null,
        resolutionNote: alert.resolutionNote ?? null,
        openMinutes:    Math.round(
          (new Date(alert.resolvedAt as any).getTime() - new Date(alert.createdAt).getTime()) / 60000,
        ),
      },
      ip: '',
    })).catch((e) => this.logger.error(`SOS audit write failed: ${e?.message}`));

    return saved;
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
    const rows = await this.repo.find({
      where: { status: SosStatus.ACTIVE },
      /**
       * The other party is loaded now.
       *
       * When a rider presses SOS mid-trip, the single most relevant
       * person on earth is whoever is in the vehicle with them, and the
       * desk could not name them, let alone ring them. It knew the
       * delivery, so it could show "open their booking" and make the
       * operator go and read a second page to find a phone number, in
       * the first minute of an emergency.
       */
      relations: ['delivery', 'delivery.customer', 'delivery.driver', 'delivery.driver.user'],
      order: { createdAt: 'DESC' },
      take:  100,
    });

    /**
     * How many alerts this person has raised before.
     *
     * A repeat raiser is a signal in both directions: someone genuinely
     * in danger on a route they keep working, or someone leaning on the
     * button. Either way the desk should know before it picks up the
     * phone, not a month later when somebody reads the table.
     */
    const priorCounts = new Map<string, number>();
    for (const id of new Set(rows.map((a: any) => a.user?.id).filter(Boolean))) {
      priorCounts.set(id as string, await this.repo.count({ where: { user: { id: id as string } } as any }));
    }

    return rows.map((a: any) => {
      const d = a.delivery;
      // Whoever is NOT the raiser. Null when the alert has no trip.
      let counterparty: any = null;
      if (d) {
        const isRaiserTheCustomer = d.customer?.id === a.user?.id;
        const other = isRaiserTheCustomer ? d.driver?.user : d.customer;
        if (other && other.id !== a.user?.id) {
          counterparty = {
            id:    other.id,
            name:  other.name,
            phone: other.phone,
            role:  isRaiserTheCustomer ? 'driver' : 'customer',
            driverId: isRaiserTheCustomer ? (d.driver?.id ?? null) : null,
          };
        }
      }
      return {
        ...a,
        delivery: d ? { id: d.id, trackingCode: d.trackingCode, status: d.status } : null,
        counterparty,
        /** Total alerts ever raised by this person, this one included. */
        raiserAlertCount: priorCounts.get(a.user?.id) ?? 1,
        openMinutes: Math.round((Date.now() - new Date(a.createdAt).getTime()) / 60000),
      };
    });
  }

  /**
   * Every alert, open or closed, with what was done about it.
   *
   * Closing an alert has recorded a resolution note since 2026-08-24,
   * added precisely so that "a month later nobody can tell a false alarm
   * from a real incident that was handled". Nothing could ever read one
   * back: the only list route was listActive, which filters to open
   * alerts, so the moment an alert was resolved it left the product
   * entirely (found 2026-08-28).
   *
   * That is the wrong shape for a safety feature. The history is what
   * shows a pattern, the same rider or the same stretch of road coming
   * up repeatedly, and it is the only evidence SEIRS responded at all if
   * an incident is ever disputed.
   *
   * The user is joined so an alert names a person rather than a uuid,
   * through a narrow select: an SOS row must not become another way to
   * read somebody's bank details or home address.
   */
  async listHistory(
    admin: User,
    opts: { status?: string; limit?: number; userId?: string; deliveryId?: string } = {},
  ) {
    if (admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin only.');
    }
    const take = Math.min(Math.max(Number(opts.limit ?? 100), 1), 500);

    const qb = this.repo
      .createQueryBuilder('a')
      .leftJoin('a.user', 'u')
      .addSelect(['u.id', 'u.name', 'u.phone', 'u.role', 'u.accountId'])
      .leftJoin('a.resolvedBy', 'rb')
      .addSelect(['rb.id', 'rb.name'])
      .leftJoinAndSelect('a.delivery', 'd')
      .orderBy('a.createdAt', 'DESC')
      .take(take);

    if (opts.status && opts.status !== 'all') {
      qb.andWhere('a.status = :st', { st: opts.status });
    }
    /**
     * Scoped to one person or one trip.
     *
     * Without these the only way to answer "has this driver done this
     * before" was to pull every alert on the platform and filter in the
     * browser, which stops working at exactly the point the answer
     * starts mattering. A person's own record is where a pattern is
     * read, so their profile asks for their rows and nobody else's.
     */
    if (opts.userId)     qb.andWhere('u.id = :uid', { uid: opts.userId });
    if (opts.deliveryId) qb.andWhere('d.id = :did', { did: opts.deliveryId });

    const rows = await qb.getMany();

    return rows.map((a: any) => ({
      id:         a.id,
      status:     a.status,
      lat:        a.lat,
      lng:        a.lng,
      note:       a.note,
      createdAt:  a.createdAt,
      resolvedAt: a.resolvedAt,
      resolutionNote: a.resolutionNote,
      resolvedBy: a.resolvedBy ? { id: a.resolvedBy.id, name: a.resolvedBy.name } : null,
      user:       a.user ? {
        id: a.user.id, name: a.user.name, phone: a.user.phone,
        role: a.user.role, accountId: a.user.accountId,
      } : null,
      delivery:   a.delivery ? { id: a.delivery.id, trackingCode: a.delivery.trackingCode, status: a.delivery.status } : null,
      /** How long it stayed open. The number that says whether SEIRS responded. */
      openMinutes: a.resolvedAt
        ? Math.round((new Date(a.resolvedAt).getTime() - new Date(a.createdAt).getTime()) / 60000)
        : Math.round((Date.now() - new Date(a.createdAt).getTime()) / 60000),
    }));
  }
}
