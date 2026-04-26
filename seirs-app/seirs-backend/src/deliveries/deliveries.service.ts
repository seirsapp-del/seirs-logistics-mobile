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

  matchingService?:    any;
  trackingGateway?:    any;
  paymentsService?:    any;
  fallbackService?:    any;
  notificationsService?: any;

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

    // In-app notifications on status change
    if (this.notificationsService && delivery.customer) {
      if (status === DeliveryStatus.DELIVERED) {
        this.notificationsService
          .notifyDeliveryComplete(delivery.customer.id, delivery.trackingCode, id)
          .catch(() => {});
      } else {
        this.notificationsService
          .notifyStatusUpdate(delivery.customer.id, delivery.trackingCode, status, delivery.id)
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

    // Recalculate driver's average rating
    if (delivery.driver?.id) {
      const allRatings = await this.repo
        .createQueryBuilder('d')
        .select('d.customerRating', 'r')
        .where('d.driver_id = :driverId', { driverId: delivery.driver.id })
        .andWhere('d.customerRating IS NOT NULL')
        .getRawMany();

      const avg = allRatings.reduce((sum, r) => sum + Number(r.r), 0) / allRatings.length;

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
