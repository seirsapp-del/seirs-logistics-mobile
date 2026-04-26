import { Logger } from '@nestjs/common';
import { IPartnerAdapter, PartnerBookingResult, PartnerQuote, PartnerTrackingResult } from './partner-adapter.interface';
import { Delivery } from '../../deliveries/delivery.entity';
import { PricingService } from '../../deliveries/pricing.service';

// GIG Logistics — Nigeria's largest logistics company
// API docs: https://giglogistics.com/api (illustrative)
export class GigAdapter implements IPartnerAdapter {
  slug = 'gig';
  private readonly logger = new Logger('GigAdapter');

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  private async post(path: string, body: object) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GIG API error: ${res.status}`);
    return res.json();
  }

  async getQuote(delivery: Delivery): Promise<PartnerQuote> {
    try {
      const data = await this.post('/shipment/price', {
        sender_location:   delivery.pickupAddress,
        receiver_location: delivery.dropoffAddress,
        weight:            1, // default 1kg if not specified
      });
      return {
        price:         data.price ?? delivery.price * 1.2,
        currency:      'NGN',
        estimatedDays: 1,
        serviceLevel:  'standard',
      };
    } catch (e) {
      this.logger.warn(`GIG quote failed, using fallback pricing: ${e.message}`);
      // Fallback: add 20% to internal price
      return {
        price:         delivery.price * 1.2,
        currency:      'NGN',
        estimatedDays: 1,
        serviceLevel:  'standard',
      };
    }
  }

  async bookDelivery(delivery: Delivery): Promise<PartnerBookingResult> {
    const data = await this.post('/shipment/create', {
      sender: {
        name:    delivery.customer?.name,
        phone:   delivery.customer?.phone,
        address: delivery.pickupAddress,
      },
      receiver: {
        address: delivery.dropoffAddress,
      },
      package: {
        description: delivery.packageDescription,
        weight:      1,
        fragile:     delivery.isFragile,
      },
      reference: delivery.trackingCode,
    });

    return {
      partnerTrackingId:  data.tracking_id ?? `GIG-${Date.now()}`,
      partnerTrackingUrl: data.tracking_url ?? `https://giglogistics.com/track/${data.tracking_id}`,
      estimatedDelivery:  new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  async trackDelivery(partnerTrackingId: string): Promise<PartnerTrackingResult> {
    return {
      status:    'in_transit',
      location:  'Lagos Hub',
      updatedAt: new Date(),
      events:    [],
    };
  }

  async cancelDelivery(partnerTrackingId: string): Promise<boolean> {
    try {
      await this.post('/shipment/cancel', { tracking_id: partnerTrackingId });
      return true;
    } catch {
      return false;
    }
  }
}
