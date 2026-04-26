import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Delivery, DeliveryStatus, PackageSize, UrgencyLevel } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';
import { CreateBulkDeliveryDto } from './dto/bulk-delivery.dto';
import { PricingService } from '../deliveries/pricing.service';

const B2B_DISCOUNT = 0.10; // 10% discount on bulk orders of 5+
const BULK_THRESHOLD = 5;

@Injectable()
export class BulkService {
  constructor(
    @InjectRepository(Delivery) private deliveriesRepo: Repository<Delivery>,
    @InjectRepository(User)     private usersRepo:      Repository<User>,
    private readonly pricingService: PricingService,
    private readonly dataSource:     DataSource,
  ) {}

  async createBulkOrder(customerId: string, dto: CreateBulkDeliveryDto) {
    if (!dto.deliveries?.length) {
      throw new BadRequestException('At least one delivery is required.');
    }
    if (dto.deliveries.length > 50) {
      throw new BadRequestException('Maximum 50 deliveries per bulk order.');
    }

    const customer = await this.usersRepo.findOne({ where: { id: customerId } });
    if (!customer) throw new BadRequestException('Customer not found.');

    const applyDiscount = dto.deliveries.length >= BULK_THRESHOLD;
    const results: { trackingCode: string; price: number; index: number }[] = [];
    const createdDeliveries: Delivery[] = [];

    // Compute prices and build entities
    for (let i = 0; i < dto.deliveries.length; i++) {
      const item = dto.deliveries[i];
      const distKm  = PricingService.haversineKm(
        item.pickupLat, item.pickupLng,
        item.dropoffLat, item.dropoffLng,
      );
      const pkgSize  = item.packageSize ?? PackageSize.SMALL;
      const fragile  = item.isFragile   ?? false;
      const quotes   = this.pricingService.getQuotes(distKm, pkgSize, fragile);

      const urgency   = item.urgency ?? UrgencyLevel.STANDARD;
      const basePrice = quotes[urgency].price;
      const price     = applyDiscount ? basePrice * (1 - B2B_DISCOUNT) : basePrice;

      const trackingCode = `SRS-${Date.now().toString(36).toUpperCase()}-${i}`;

      const delivery = this.deliveriesRepo.create({
        trackingCode,
        customer,
        pickupAddress:      item.pickupAddress,
        pickupLat:          item.pickupLat,
        pickupLng:          item.pickupLng,
        dropoffAddress:     item.dropoffAddress,
        dropoffLat:         item.dropoffLat,
        dropoffLng:         item.dropoffLng,
        packageDescription: item.packageDescription,
        packageSize:        item.packageSize  ?? PackageSize.SMALL,
        isFragile:          item.isFragile    ?? false,
        urgency,
        price:              Math.round(price),
        driverEarnings:     Math.round(price * 0.80),
        distanceKm:         distKm,
        status:             DeliveryStatus.PENDING,
      });

      createdDeliveries.push(delivery);
      results.push({ index: i, trackingCode, price: Math.round(price) });
    }

    // Persist all in a single transaction
    await this.dataSource.transaction(async (manager) => {
      for (const d of createdDeliveries) {
        await manager.save(Delivery, d);
      }
    });

    const totalPrice = results.reduce((sum, r) => sum + r.price, 0);

    return {
      orderCount:    results.length,
      discountApplied: applyDiscount,
      discountRate:   applyDiscount ? `${B2B_DISCOUNT * 100}%` : '0%',
      totalPrice,
      deliveries:    results,
      poReference:   dto.poReference ?? null,
      paymentMethod: dto.paymentMethod,
    };
  }

  // Get all bulk orders (deliveries with the same poReference, grouped)
  async getBulkOrderHistory(customerId: string, page: number, limit: number) {
    const [deliveries, total] = await this.deliveriesRepo.findAndCount({
      where: { customer: { id: customerId } },
      order: { createdAt: 'DESC' },
      skip:  (page - 1) * limit,
      take:  limit,
    });
    return { deliveries, total, page, limit };
  }
}
