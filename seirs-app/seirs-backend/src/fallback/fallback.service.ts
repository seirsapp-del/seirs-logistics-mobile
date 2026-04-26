import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { MatchingService } from '../matching/matching.service';
import { PartnersService } from '../partners/partners.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

export enum FallbackReason {
  NO_DRIVER_FOUND      = 'no_driver_found',
  DRIVER_CANCELLED     = 'driver_cancelled',
  DRIVER_UNRESPONSIVE  = 'driver_unresponsive',
  DELIVERY_DELAYED     = 'delivery_delayed',
  MANUAL_ESCALATION    = 'manual_escalation',
}

export interface FallbackResult {
  action:      'reassigned' | 'partner' | 'failed' | 'pending';
  driverId?:   string;
  partnerId?:  string;
  message:     string;
}

@Injectable()
export class FallbackService {
  private readonly logger = new Logger(FallbackService.name);

  constructor(
    @InjectRepository(Delivery) private deliveriesRepo: Repository<Delivery>,
    private matchingService:    MatchingService,
    private partnersService:    PartnersService,
    private trackingGateway:    TrackingGateway,
  ) {}

  // Central fallback handler — called by multiple triggers
  async handle(delivery: Delivery, reason: FallbackReason): Promise<FallbackResult> {
    this.logger.log(`Fallback triggered for delivery ${delivery.id}. Reason: ${reason}`);

    // Step 1: Try to reassign to another driver
    const reassigned = await this.tryReassign(delivery);
    if (reassigned) {
      return {
        action:   'reassigned',
        driverId: reassigned,
        message:  'Reassigned to nearest available driver.',
      };
    }

    // Step 2: Escalate to partner logistics API
    this.logger.log(`No driver available for ${delivery.id} — escalating to partner`);
    const partnerDelivery = await this.partnersService.dispatchToPartner(delivery);

    if (partnerDelivery) {
      // Update delivery to reflect partner handling
      await this.deliveriesRepo.update(delivery.id, {
        status: DeliveryStatus.ASSIGNED,
      });

      this.trackingGateway.broadcastStatusChange(delivery.id, DeliveryStatus.ASSIGNED, {
        via:               'partner',
        partnerName:       partnerDelivery.partner.name,
        partnerTrackingId: partnerDelivery.partnerTrackingId,
        trackingUrl:       partnerDelivery.partnerTrackingUrl,
      });

      return {
        action:     'partner',
        partnerId:  partnerDelivery.partner.id,
        message:    `Dispatched to ${partnerDelivery.partner.name}.`,
      };
    }

    // Step 3: All options exhausted — mark as pending with admin alert
    // This is expected when no drivers are online and no partner companies are configured.
    this.logger.warn(`All fallback options exhausted for delivery ${delivery.id} — returned to pending`);
    await this.deliveriesRepo.update(delivery.id, {
      status: DeliveryStatus.PENDING,
    });

    this.trackingGateway.broadcastStatusChange(delivery.id, 'admin_escalated', {
      message: 'Our team is working to find a driver. You will be updated shortly.',
    });

    return {
      action:  'pending',
      message: 'Escalated to admin. Customer notified.',
    };
  }

  private async tryReassign(delivery: Delivery): Promise<string | null> {
    // Expand search radius for reassignment
    const match = await this.matchingService.findBestDriver(delivery);
    if (!match) return null;

    await this.deliveriesRepo.update(delivery.id, {
      driver:     match.driver,
      status:     DeliveryStatus.ASSIGNED,
      assignedAt: new Date(),
    });

    this.trackingGateway.broadcastDriverAssigned(delivery.id, match.driver);
    this.trackingGateway.notifyDriver(match.driver.id, delivery);

    this.logger.log(`Delivery ${delivery.id} reassigned to driver ${match.driver.id}`);
    return match.driver.id;
  }

  // Called on a schedule to detect stalled deliveries (Phase 5 - cron job)
  async detectDelays(): Promise<void> {
    const staleThresholdMs = 30 * 60 * 1000; // 30 minutes with no update

    const stalledDeliveries = await this.deliveriesRepo
      .createQueryBuilder('d')
      .where('d.status IN (:...statuses)', {
        statuses: [DeliveryStatus.PENDING, DeliveryStatus.ASSIGNED],
      })
      .andWhere('d.updatedAt < :threshold', {
        threshold: new Date(Date.now() - staleThresholdMs),
      })
      .getMany();

    for (const delivery of stalledDeliveries) {
      this.logger.warn(`Stalled delivery detected: ${delivery.id}`);
      await this.handle(delivery, FallbackReason.DELIVERY_DELAYED);
    }

    if (stalledDeliveries.length > 0) {
      this.logger.log(`Processed ${stalledDeliveries.length} stalled deliveries`);
    }
  }
}
