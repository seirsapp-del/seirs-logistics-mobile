import { IsString, IsNumber, IsBoolean, IsOptional, IsArray, ValidateNested, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PackageSize, UrgencyLevel } from '../../deliveries/delivery.entity';

export class BulkDeliveryItemDto {
  @IsString()
  pickupAddress: string;

  @IsNumber() @Min(-90) @Max(90)
  pickupLat: number;

  @IsNumber() @Min(-180) @Max(180)
  pickupLng: number;

  @IsString()
  dropoffAddress: string;

  @IsNumber() @Min(-90) @Max(90)
  dropoffLat: number;

  @IsNumber() @Min(-180) @Max(180)
  dropoffLng: number;

  @IsString()
  packageDescription: string;

  @IsEnum(PackageSize)
  @IsOptional()
  packageSize?: PackageSize;

  @IsBoolean()
  @IsOptional()
  isFragile?: boolean;

  @IsEnum(UrgencyLevel)
  @IsOptional()
  urgency?: UrgencyLevel;

  // Recipient contact for notification
  @IsString()
  @IsOptional()
  recipientName?: string;

  @IsString()
  @IsOptional()
  recipientPhone?: string;
}

export class CreateBulkDeliveryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkDeliveryItemDto)
  deliveries: BulkDeliveryItemDto[];

  // Payment method for the entire batch
  @IsString()
  paymentMethod: 'wallet' | 'card' | 'invoice';

  // Optional purchase order reference
  @IsString()
  @IsOptional()
  poReference?: string;
}
