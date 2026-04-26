import { Delivery } from '../../deliveries/delivery.entity';

export interface PartnerQuote {
  price:          number;
  currency:       string;
  estimatedDays:  number;
  serviceLevel:   string;
}

export interface PartnerBookingResult {
  partnerTrackingId:  string;
  partnerTrackingUrl: string;
  estimatedDelivery:  Date;
}

export interface PartnerTrackingResult {
  status:      string;
  location:    string;
  updatedAt:   Date;
  events:      { time: Date; description: string }[];
}

// Every partner adapter must implement this interface
export interface IPartnerAdapter {
  slug: string;
  getQuote(delivery: Delivery): Promise<PartnerQuote>;
  bookDelivery(delivery: Delivery): Promise<PartnerBookingResult>;
  trackDelivery(partnerTrackingId: string): Promise<PartnerTrackingResult>;
  cancelDelivery(partnerTrackingId: string): Promise<boolean>;
}
