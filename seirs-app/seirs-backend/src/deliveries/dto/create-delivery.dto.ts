import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
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
}
