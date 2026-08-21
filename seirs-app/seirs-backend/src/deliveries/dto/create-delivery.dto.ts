import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PackageSize, UrgencyLevel } from '../delivery.entity';

/**
 * One package inside a multi-package run.
 *
 * The business app has booked runs like this since its rebuild: one
 * driver, one pickup, one payment, and a separate public tracking code
 * per package so each receiver can follow their own parcel without
 * seeing the rest of the run. This is the customer-side equivalent, and
 * it writes the same DeliveryStop rows the business path writes.
 */
export class CreateDeliveryPackageDto {
  @IsString()
  address!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsString()
  recipientName!: string;

  @IsString()
  recipientPhone!: string;

  @IsOptional() @IsString()
  receiverFirstName?: string;

  @IsOptional() @IsString()
  receiverLastName?: string;

  @IsOptional() @IsString()
  packageDescription?: string;

  @IsOptional() @IsString()
  categoryCode?: string;

  @IsOptional() @IsNumber()
  weightKg?: number;

  @IsOptional() @IsNumber()
  declaredValueNgn?: number;

  @IsOptional() @IsString()
  fallbackPref?: string;

  @IsOptional() @IsString()
  fallbackNeighbourName?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  packagePhotoUrls?: string[];

  @IsOptional() @IsString()
  notes?: string;
}

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

  /**
   * These four were REQUIRED, and the customer app has never sent any of
   * them, so every booking from the app was rejected with a validation
   * error (founder hit it 2026-08-13). The app collects richer inputs
   * instead: a category, a weight, and a chosen vehicle. They are now
   * optional and derived server-side in deliveries.service.create.
   *
   * Kept accepted rather than deleted: the business app and the
   * developer API still send them explicitly.
   */
  @IsOptional()
  @IsString()
  packageDescription?: string;

  // The customer app's field name for the same thing.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(PackageSize)
  packageSize?: PackageSize;

  @IsOptional()
  @IsBoolean()
  isFragile?: boolean;

  @IsOptional()
  @IsEnum(UrgencyLevel)
  urgency?: UrgencyLevel;

  /**
   * What the customer app actually sends. Without these declared,
   * whitelist:true silently STRIPPED them, so a booking would have been
   * saved with no weight, no vehicle and no photos even once the
   * validation errors above were fixed. The weight in particular is the
   * field the driver picks a vehicle from.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  // Service catalogue code. Stored on the delivery as categoryCode.
  @IsOptional()
  @IsString()
  packageCategory?: string;

  // Uploaded photos of the package at booking time. The app requires at
  // least one before it lets the customer continue, so throwing them
  // away server-side destroyed the sender's own evidence.
  @IsOptional()
  packagePhotos?: string[];

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  codAmountNgn?: number;

  // Send Now vs a scheduled slot. scheduledFor below carries the time.
  @IsOptional()
  @IsBoolean()
  scheduledNow?: boolean;

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

  // Requested pickup time (ISO string) for scheduled bookings. Omitted
  // = Send Now. Server-validated: must be in the future and within 7
  // days (night-ops build 2026-08-11; slots are 24/7 per founder).
  @IsOptional()
  @IsString()
  scheduledFor?: string;

  // Receiver system (founder 2026-08-11): who is collecting, how to
  // verify them, and what to do when nobody answers the door.
  @IsOptional() @IsString() @MaxLength(60)
  receiverFirstName?: string;

  @IsOptional() @IsString() @MaxLength(60)
  receiverLastName?: string;

  @IsOptional()
  @IsString()
  receiverPhone?: string;

  @IsOptional() @IsIn(['name', 'code', 'id'])
  receiverVerifyPref?: string;

  @IsOptional() @IsIn(['hand_only', 'neighbour', 'gate', 'store'])
  fallbackPref?: string;

  @IsOptional() @IsString() @MaxLength(80)
  fallbackNeighbourName?: string;

  /**
   * Optional. When present the booking is a multi-package run: one
   * driver, one payment, one DeliveryStop row per package, each with its
   * own public tracking code. Absent means the ordinary single-package
   * booking, so every existing caller is unaffected.
   *
   * Capped so one request cannot spawn an unbounded run; the vehicle
   * capacity caps in the Fee Catalogue are the real limit and are applied
   * in the service.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateDeliveryPackageDto)
  stops?: CreateDeliveryPackageDto[];

  /** Sender ticked the Terms of Service box at review. */
  @IsOptional()
  termsAccepted?: boolean;
}
