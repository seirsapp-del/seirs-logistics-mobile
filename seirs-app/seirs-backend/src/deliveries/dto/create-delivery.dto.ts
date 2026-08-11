import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PackageSize, UrgencyLevel } from '../delivery.entity';

export class CreateDeliveryDto {
  @IsString()
  pickupAddress: string;

  @IsNumber()
  pickupLat: number;

  @IsNumber()
  pickupLng: number;

  @IsString()
  dropoffAddress: string;

  @IsNumber()
  dropoffLat: number;

  @IsNumber()
  dropoffLng: number;

  @IsString()
  packageDescription: string;

  @IsEnum(PackageSize)
  packageSize: PackageSize;

  @IsBoolean()
  isFragile: boolean;

  @IsEnum(UrgencyLevel)
  urgency: UrgencyLevel;

  // Optional free-text instructions from the customer for the driver.
  // e.g. "Call when at gate, security code 4231", "Leave with reception".
  // Auto-injected into the chat as the first system message on ASSIGNED
  // transition so drivers see it inline without a separate tab. 500 chars
  // is Uber-style - enough for detail, not enough to write a novel.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryInstructions?: string;

  // Sender-declared package value in NGN (optional). At or above the
  // Fee Catalogue's high_value_threshold_ngn it makes the driver-side
  // handoff signature MANDATORY on delivery (founder policy 2026-08-10:
  // high-value only) and feeds future insurance cover.
  @IsOptional()
  @IsNumber()
  @Min(0)
  declaredValueNgn?: number;
}
