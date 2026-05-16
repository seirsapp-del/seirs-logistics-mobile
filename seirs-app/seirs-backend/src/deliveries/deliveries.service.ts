import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery, DeliveryStatus } from './delivery.entity';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { PricingService } from './pricing.service';
import { User } from '../users/user.entity';

function generateTrackingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SRS-';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  matchingService?:      any;
  trackingGateway?:      any;
  paymentsService?:      any;
  fallbackService?:      any;
  notificationsService?: any;
  mailService?:          any;
  driversService?:       any;
  // Spec V8 Tier 3 — when set, status changes fan out to subscribed
  // partner webhooks (POST /api/v1/dev-platform/webhooks subscribers).
  // Wired lazily by DevPlatformModule on app boot to avoid a circular
  // dep with DeliveriesModule.
  devPlatformService?:   any;

  constructor(
    @InjectRepository(Delivery) private repo: Repository<Delivery>,
    private pricingService: PricingService,
  ) {}

  getQuote(dto: CreateDeliveryDto) {
    const distanceKm = PricingService.haversineKm(
      dto.pickupLat, dto.pickupLng,
      dto.dropoffLat, dto.dropoffLng,
    );
    return {
      distanceKm: Math.round(distanceKm * 10) / 10,
      quotes: this.pricingService.getQuotes(distanceKm, dto.packageSize, dto.isFragile),
    };
  }

  async create(dto: CreateDeliveryDto, customer: User): Promise<Delivery> {
    const distanceKm = PricingService.haversineKm(
      dto.pickupLat, dto.pickupLng,
      dto.dropoffLat, dto.dropoffLng,
    );

    const pricing = this.pricingService.calculate({
      distanceKm,
      packageSize: dto.packageSize,
      urgency:     dto.urgency,
      isFragile:   dto.isFragile,
    });

    const delivery = this.repo.create({
      ...dto,
      trackingCode:   generateTrackingCode(),
      customer,
      distanceKm,
      price:          pricing.price,
      driverEarnings: pricing.driverEarnings,
      status:         DeliveryStatus.PENDING,
    });

    const saved = await this.repo.save(delivery);

    // Trigger auto-matching asynchronously (don't block the response)
    this.runAutoMatch(saved).catch((err) =>
      this.logger.error(`Auto-match failed for ${saved.id}: ${err.message}`)
    );

    return saved;
  }

  private async runAutoMatch(delivery: Delivery) {
    if (!this.matchingService) return;

    const match = await this.matchingService.findBestDriver(delivery);
    if (!match) {
      this.logger.warn(`No driver found for delivery ${delivery.id} — triggering fallback`);
      if (this.fallbackService) {
        await this.fallbackService.handle(delivery, 'no_driver_found');
      }
      return;
    }

    await this.repo.update(delivery.id, {
      driver:     match.driver,
      status:     DeliveryStatus.ASSIGNED,
      assignedAt: new Date(),
    });

    if (this.trackingGateway) {
      this.trackingGateway.broadcastDriverAssigned(delivery.id, match.driver);
      this.trackingGateway.notifyDriver(match.driver.id, delivery);
    }

    // In-app notifications
    if (this.notificationsService) {
      this.notificationsService.notifyDeliveryAssigned(
        delivery.customer.id,
        delivery.trackingCode,
        match.driver.user?.name ?? 'Your driver',
        delivery.id,
      ).catch(() => {});

      this.notificationsService.notifyNewJob(
        match.driver.user?.id,
        delivery.trackingCode,
        delivery.driverEarnings,
        delivery.id,
      ).catch(() => {});
    }

    this.logger.log(
      `Delivery ${delivery.id} assigned to driver ${match.driver.id} (score: ${match.score})`
    );
  }

  async findByCustomer(customerId: string, page = 1, limit = 20) {
    const [items, total] = await this.repo.findAndCount({
      where: { customer: { id: customerId } },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  findByDriver(driverId: string) {
    return this.repo.find({
      where: { driver: { id: driverId } },
      order: { createdAt: 'DESC' },
    });
  }

  findActiveByDriverUserId(userId: string) {
    return this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'customer')
      .innerJoin('d.driver', 'driver')
      .innerJoin('driver.user', 'driverUser')
      .where('driverUser.id = :userId', { userId })
      .andWhere('d.status IN (:...statuses)', {
        statuses: [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT],
      })
      .orderBy('d.assignedAt', 'DESC')
      .getMany();
  }

  /**
   * Pending deliveries the driver could still pick up. Used by the driver
   * home screen to render an "available jobs" feed. Auto-match runs first
   * so most pending jobs get assigned within seconds; this endpoint exists
   * for the manual-claim path (auto-match failed, no nearby driver, etc.).
   *
   * If `lat`/`lng` are provided, results are sorted by distance ascending
   * using the Haversine formula. Otherwise newest-first.
   */
  findAvailable(lat?: number, lng?: number, radiusKm: number = 25, limit: number = 30) {
    const q = this.repo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.customer', 'customer')
      .where('d.status = :status', { status: DeliveryStatus.PENDING })
      .andWhere('d.driver IS NULL');

    const safeLat = Number(lat);
    const safeLng = Number(lng);
    const safeRadius = Math.min(200, Math.max(1, Number(radiusKm)));
    const safeLimit  = Math.min(100, Math.max(1, Number(limit)));

    const hasOrigin =
      !isNaN(safeLat) && !isNaN(safeLng) &&
      safeLat >= -90 && safeLat <= 90 &&
      safeLng >= -180 && safeLng <= 180;

    if (hasOrigin) {
      // Haversine distance from driver to pickup, parameters bound to query.
      q.addSelect(
        `(6371 * acos(LEAST(1, GREATEST(-1,
          cos(radians(:lat)) * cos(radians(d.pickupLat)) *
          cos(radians(d.pickupLng) - radians(:lng)) +
          sin(radians(:lat)) * sin(radians(d.pickupLat))
        )))) AS distance_km`,
      )
        .setParameters({ lat: safeLat, lng: safeLng })
        .andWhere(
          `(6371 * acos(LEAST(1, GREATEST(-1,
            cos(radians(:lat)) * cos(radians(d.pickupLat)) *
            cos(radians(d.pickupLng) - radians(:lng)) +
            sin(radians(:lat)) * sin(radians(d.pickupLat))
          )))) <= ${safeRadius}`,
        )
        .orderBy('distance_km', 'ASC');
    } else {
      q.orderBy('d.createdAt', 'DESC');
    }

    return q.limit(safeLimit).getMany();
  }

  async findByTracking(trackingCode: string) {
    const delivery = await this.repo.findOne({ where: { trackingCode } });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    return delivery;
  }

  async updateStatus(id: string, status: DeliveryStatus, proofPhotoUrl?: string) {
    const delivery = await this.repo.findOne({ where: { id } });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const timestamps: Partial<Delivery> = { status };
    if (status === DeliveryStatus.ASSIGNED)   timestamps.assignedAt  = new Date();
    if (status === DeliveryStatus.PICKED_UP)  timestamps.pickedUpAt  = new Date();
    if (status === DeliveryStatus.DELIVERED) {
      timestamps.deliveredAt = new Date();
      if (proofPhotoUrl) timestamps.proofPhotoUrl = proofPhotoUrl;
    }

    await this.repo.update(id, timestamps);

    if (this.trackingGateway) {
      this.trackingGateway.broadcastStatusChange(id, status);
    }

    // Spec V8 Tier 3 — fan out to partner webhook subscribers
    if (this.devPlatformService) {
      const eventMap: Record<string, string> = {
        assigned:   'order.driver_assigned',
        picked_up:  'order.picked_up',
        delivered:  'order.delivered',
        failed:     'order.failed',
        cancelled:  'order.cancelled',
      };
      const eventName = eventMap[String(status)];
      if (eventName) {
        this.devPlatformService.enqueue(eventName, {
          orderId:      id,
          trackingCode: delivery.trackingCode,
          status,
          occurredAt:   new Date().toISOString(),
        }).catch(() => {});
      }
    }

    // Fetch customer for email (delivery.customer may not have email loaded)
    const withCustomer = await this.repo.findOne({ where: { id }, relations: ['customer'] });
    const customer = withCustomer?.customer;

    // In-app notifications on status change
    if (this.notificationsService && customer) {
      if (status === DeliveryStatus.DELIVERED) {
        this.notificationsService
          .notifyDeliveryComplete(customer.id, delivery.trackingCode, id)
          .catch(() => {});
      } else {
        this.notificationsService
          .notifyStatusUpdate(customer.id, delivery.trackingCode, status, delivery.id)
          .catch(() => {});
      }
    }

    // Email notifications on status change
    if (this.mailService && customer?.email) {
      if (status === DeliveryStatus.PICKED_UP) {
        this.mailService
          .sendDeliveryPickedUp(customer.email, customer.name, delivery.trackingCode)
          .catch(() => {});
      } else if (status === DeliveryStatus.DELIVERED) {
        this.mailService
          .sendDeliveryComplete(customer.email, customer.name, delivery.trackingCode)
          .catch(() => {});
      } else if (status === DeliveryStatus.FAILED) {
        this.mailService
          .sendDeliveryFailed(customer.email, customer.name, delivery.trackingCode)
          .catch(() => {});
      }
    }

    // Release escrow to driver when delivery is confirmed
    if (status === DeliveryStatus.DELIVERED && this.paymentsService) {
      const updated = await this.repo.findOne({ where: { id }, relations: ['driver', 'driver.user'] });
      if (updated?.driver?.user?.id) {
        this.paymentsService
          .releaseEscrow(id, updated.driver.user.id)
          .catch((err) => this.logger.error(`Escrow release failed: ${err.message}`));
      }
    }

    // Refund escrow if delivery failed or cancelled
    if (
      (status === DeliveryStatus.FAILED || status === DeliveryStatus.CANCELLED) &&
      this.paymentsService
    ) {
      const updated = await this.repo.findOne({ where: { id }, relations: ['customer'] });
      if (updated?.customer?.id) {
        this.paymentsService
          .refundEscrow(id, updated.customer.id)
          .catch((err) => this.logger.error(`Escrow refund failed: ${err.message}`));
      }
    }

    return this.repo.findOne({ where: { id } });
  }

  async findById(id: string) {
    const delivery = await this.repo.findOne({ where: { id } });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    return delivery;
  }

  // Customer-scoped fetch with driver + stops eagerly loaded so the
  // receipt screen has everything it needs in one round-trip.
  async findByIdForUser(id: string, userId: string) {
    const delivery = await this.repo.findOne({
      where:    { id, customer: { id: userId } },
      relations: ['driver', 'driver.user', 'customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    return delivery;
  }

  // Driver-initiated claim of an unassigned pending job. Used by the
  // driver app's job-detail screen "Accept" button. Mirrors what the
  // matching service does on auto-match: flip status to ASSIGNED, set
  // assignedAt, broadcast to tracking + notify customer.
  async claimByDriver(deliveryId: string, userId: string) {
    if (!this.driversService) {
      const { ServiceUnavailableException } = await import('@nestjs/common');
      throw new ServiceUnavailableException('Driver service not wired.');
    }
    const driver = await this.driversService.findByUserId(userId);
    if (!driver) {
      const { ForbiddenException } = await import('@nestjs/common');
      throw new ForbiddenException('Only drivers can claim jobs.');
    }

    const delivery = await this.repo.findOne({
      where:    { id: deliveryId },
      relations: ['customer', 'driver'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const { BadRequestException, ConflictException } = await import('@nestjs/common');
    if (delivery.status !== DeliveryStatus.PENDING) {
      throw new BadRequestException(`This job is no longer available (status: ${delivery.status}).`);
    }
    if (delivery.driver) {
      throw new ConflictException('This job was already claimed by another driver.');
    }

    await this.repo.update(deliveryId, {
      driver,
      status:     DeliveryStatus.ASSIGNED,
      assignedAt: new Date(),
    });

    if (this.trackingGateway) {
      try { this.trackingGateway.broadcastDriverAssigned(deliveryId, driver); } catch {}
      try { this.trackingGateway.broadcastStatusChange(deliveryId, DeliveryStatus.ASSIGNED); } catch {}
    }
    if (this.notificationsService) {
      this.notificationsService.notifyDeliveryAssigned(
        delivery.customer.id,
        delivery.trackingCode,
        driver.user?.name ?? 'Your driver',
        delivery.id,
      ).catch(() => {});
    }

    return this.repo.findOne({
      where:     { id: deliveryId },
      relations: ['customer', 'driver', 'driver.user'],
    });
  }

  async emailReceipt(id: string, userId: string) {
    const delivery = await this.repo.findOne({
      where:    { id, customer: { id: userId } },
      relations: ['customer'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');
    if (delivery.status !== DeliveryStatus.DELIVERED) {
      const { BadRequestException } = await import('@nestjs/common');
      throw new BadRequestException('Receipt is only available for completed deliveries.');
    }
    await this.mailService.sendDeliveryReceipt(
      delivery.customer.email,
      delivery.customer.name,
      delivery.trackingCode,
      Number(delivery.price ?? 0),
      'wallet',
      delivery.deliveredAt ?? delivery.updatedAt,
    );
    return { sent: true };
  }

  async rateDelivery(id: string, customerId: string, rating: number, comment?: string) {
    const delivery = await this.repo.findOne({
      where: { id, customer: { id: customerId } },
      relations: ['driver', 'driver.user'],
    });
    if (!delivery) throw new NotFoundException('Delivery not found.');

    const { BadRequestException } = await import('@nestjs/common');
    if (delivery.status !== DeliveryStatus.DELIVERED)
      throw new BadRequestException('Can only rate a completed delivery.');
    if (delivery.customerRating)
      throw new BadRequestException('You have already rated this delivery.');

    await this.repo.update(id, { customerRating: rating, customerComment: comment });

    // Recalculate driver's average rating with a single AVG() query (no N+1)
    if (delivery.driver?.id) {
      const result = await this.repo
        .createQueryBuilder('d')
        .select('AVG(d.customerRating)', 'avg')
        .where('d.driver_id = :driverId', { driverId: delivery.driver.id })
        .andWhere('d.customerRating IS NOT NULL')
        .getRawOne();

      const avg = parseFloat(result?.avg ?? '0');

      await this.repo.manager
        .getRepository('Driver')
        .update(delivery.driver.id, {
          rating:          Math.round(avg * 100) / 100,
          totalDeliveries: () => '"totalDeliveries" + 1',
        });
    }

    return { success: true };
  }
}
