import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Partner } from './partner.entity';
import { PartnerDelivery, PartnerDeliveryStatus } from './partner-delivery.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { IPartnerAdapter } from './adapters/partner-adapter.interface';
import { GigAdapter } from './adapters/gig.adapter';

@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);
  private adapters = new Map<string, IPartnerAdapter>();

  constructor(
    @InjectRepository(Partner)         private partnersRepo:         Repository<Partner>,
    @InjectRepository(PartnerDelivery) private partnerDeliveriesRepo: Repository<PartnerDelivery>,
  ) {}

  onModuleInit() {
    // Adapters are instantiated with DB credentials at runtime
    // In production these come from the Partner entity's apiKey / apiBaseUrl
    this.registerAdapter(new GigAdapter(
      process.env.GIG_API_KEY ?? 'test-key',
      process.env.GIG_API_URL ?? 'https://api.giglogistics.com/v1',
    ));
  }

  registerAdapter(adapter: IPartnerAdapter) {
    this.adapters.set(adapter.slug, adapter);
    this.logger.log(`Partner adapter registered: ${adapter.slug}`);
  }

  // Find the best available partner for a delivery
  async findBestPartner(delivery: Delivery): Promise<Partner | null> {
    const partners = await this.partnersRepo.find({
      where: { status: 'active' as any, isForOverflow: true },
    });
    if (!partners.length) return null;

    // Simple selection: prefer partners with lower markup
    return partners.sort((a, b) => a.priceMarkup - b.priceMarkup)[0];
  }

  // Dispatch delivery to a partner (called by fallback service)
  async dispatchToPartner(delivery: Delivery, partner?: Partner): Promise<PartnerDelivery | null> {
    const targetPartner = partner ?? await this.findBestPartner(delivery);
    if (!targetPartner) {
      this.logger.warn(`No available partner for delivery ${delivery.id}`);
      return null;
    }

    const adapter = this.adapters.get(targetPartner.slug);
    if (!adapter) {
      this.logger.error(`No adapter found for partner slug: ${targetPartner.slug}`);
      return null;
    }

    try {
      // Get quote first
      const quote = await adapter.getQuote(delivery);

      // Book the delivery
      const booking = await adapter.bookDelivery(delivery);

      const partnerDelivery = this.partnerDeliveriesRepo.create({
        partner:            targetPartner,
        delivery,
        partnerTrackingId:  booking.partnerTrackingId,
        partnerTrackingUrl: booking.partnerTrackingUrl,
        partnerQuotePrice:  quote.price,
        status:             PartnerDeliveryStatus.CONFIRMED,
        lastApiResponse:    booking as any,
      });

      await this.partnerDeliveriesRepo.save(partnerDelivery);

      this.logger.log(
        `Delivery ${delivery.id} dispatched to ${targetPartner.name}. ` +
        `Tracking: ${booking.partnerTrackingId}`
      );

      return partnerDelivery;
    } catch (err) {
      this.logger.error(`Partner dispatch failed for ${delivery.id}: ${err.message}`);

      // Record the failure
      const failed = this.partnerDeliveriesRepo.create({
        partner:          targetPartner,
        delivery,
        status:           PartnerDeliveryStatus.FAILED,
        failureReason:    err.message,
        lastApiResponse:  { error: err.message },
      });
      await this.partnerDeliveriesRepo.save(failed);

      return null;
    }
  }

  async trackPartnerDelivery(deliveryId: string): Promise<PartnerDelivery | null> {
    const pd = await this.partnerDeliveriesRepo.findOne({
      where: { delivery: { id: deliveryId } },
      relations: ['partner'],
      order: { createdAt: 'DESC' },
    });

    if (!pd) return null;

    const adapter = this.adapters.get(pd.partner.slug);
    if (adapter && pd.partnerTrackingId) {
      try {
        const status = await adapter.trackDelivery(pd.partnerTrackingId);
        pd.lastApiResponse = status as any;
        await this.partnerDeliveriesRepo.save(pd);
      } catch (e) {
        this.logger.warn(`Partner track failed: ${e.message}`);
      }
    }

    return pd;
  }

  async getAllPartners() {
    return this.partnersRepo.find({ order: { name: 'ASC' } });
  }

  async createPartner(data: Partial<Partner>) {
    const p = this.partnersRepo.create(data);
    return this.partnersRepo.save(p);
  }

  async updatePartner(id: string, data: Partial<Partner>) {
    await this.partnersRepo.update(id, data);
    return this.partnersRepo.findOne({ where: { id } });
  }
}
