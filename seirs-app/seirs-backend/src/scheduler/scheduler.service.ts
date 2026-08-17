import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, In, Repository } from 'typeorm';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { FallbackReason } from '../fallback/fallback.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  fallbackService?: any;
  // Chat 5 support toolkit: wired lazily by SchedulerModule.onModuleInit
  // to avoid a circular dep with SupportModule. Cron below sweeps
  // 7-day-idle tickets.
  supportService?: any;
  deliveriesService?: any;

  constructor(
    @InjectRepository(Delivery) private deliveriesRepo: Repository<Delivery>,
  ) {}

  // Every 5 minutes: detect deliveries stalled > 30 minutes and trigger fallback
  @Cron(CronExpression.EVERY_5_MINUTES)
  async detectStalledDeliveries() {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);

    const stalled = await this.deliveriesRepo.find({
      where: [
        { status: DeliveryStatus.PENDING,    createdAt:  LessThan(cutoff) },
        { status: DeliveryStatus.ASSIGNED,   assignedAt: LessThan(cutoff) },
      ],
      relations: ['customer', 'driver'],
    });

    if (!stalled.length) return;

    this.logger.warn(`Found ${stalled.length} stalled deliveries - triggering fallback`);

    for (const delivery of stalled) {
      if (this.fallbackService) {
        await this.fallbackService
          .handle(delivery, FallbackReason.DELIVERY_DELAYED)
          .catch((e: any) =>
            this.logger.error(`Fallback failed for ${delivery.trackingCode}: ${e.message}`)
          );
      }
    }
  }

  // Every 5 minutes: auto-cancel + fully refund paid bookings no driver
  // took within the admin-tunable window (default 60 min; founder decision
  // 2026-08-15). Logic lives in DeliveriesService so the refund and
  // notification paths are the same ones manual cancellation uses.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStalePendingBookings() {
    if (!this.deliveriesService) return;
    try { await this.deliveriesService.expireStalePending(); }
    catch (e: any) { this.logger.error(`Pending-booking expiry sweep failed: ${e?.message ?? e}`); }
  }

  // Every day at 2am: mark old failed/cancelled deliveries as archived (soft cleanup)
  @Cron('0 2 * * *')
  async archiveOldDeliveries() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

    const result = await this.deliveriesRepo
      .createQueryBuilder()
      .update(Delivery)
      .set({ status: DeliveryStatus.CANCELLED })
      .where('status IN (:...statuses)', { statuses: [DeliveryStatus.FAILED, DeliveryStatus.CANCELLED] })
      .andWhere('updatedAt < :cutoff', { cutoff })
      .execute();

    this.logger.log(`Archived ${result.affected} stale deliveries`);
  }

  // Every hour: auto-close support tickets idle for 7+ days. Matches
  // the Chat 5 decision (rate limit + auto-close). Silent-fails so a
  // schema hiccup does not break the cron worker.
  @Cron(CronExpression.EVERY_HOUR)
  async sweepIdleSupportTickets() {
    if (!this.supportService) return;
    try {
      const { closed } = await this.supportService.sweepIdleTickets();
      if (closed > 0) this.logger.log(`Auto-closed ${closed} idle support tickets`);
    } catch (e: any) {
      this.logger.warn(`support sweep skipped: ${e?.message ?? e}`);
    }
  }

  /**
   * Daily: delete tickets closed more than a week ago, and their
   * messages. Closing a ticket only takes it out of the working queue;
   * the thread stayed on the user's phone forever until this
   * (founder 2026-08-17). Runs at 03:00 so a large delete never lands
   * during Lagos trading hours.
   */
  @Cron('0 3 * * *')
  async purgeClosedSupportTickets() {
    if (!this.supportService?.purgeClosedTickets) return;
    try {
      const { deleted } = await this.supportService.purgeClosedTickets();
      if (deleted > 0) this.logger.log(`Purged ${deleted} closed support ticket(s)`);
    } catch (e: any) {
      this.logger.warn(`support purge skipped: ${e?.message ?? e}`);
    }
  }

  // Every hour: log a platform health summary
  @Cron(CronExpression.EVERY_HOUR)
  async logHealthSummary() {
    const active = await this.deliveriesRepo.count({
      where: { status: In([DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT]) },
    });
    const pending = await this.deliveriesRepo.count({ where: { status: DeliveryStatus.PENDING } });
    this.logger.log(`Health: ${active} active deliveries, ${pending} pending`);
  }
}
