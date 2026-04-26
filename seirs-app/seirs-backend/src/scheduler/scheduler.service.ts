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

    this.logger.warn(`Found ${stalled.length} stalled deliveries — triggering fallback`);

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
