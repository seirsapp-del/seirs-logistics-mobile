import { IsBoolean, IsEmail, IsEnum, IsISO8601, IsObject, IsOptional, IsString, Length, Matches, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../users/user.entity';
import { VehicleType } from '../../drivers/driver.entity';

// Optional home address captured at signup. Same shape as the jsonb
// column on User.homeAddress and as HomeAddressDto on update-profile, so
// the value written here is the value the profile screen later edits.
export class RegisterHomeAddressDto {
  @IsString() @Length(1, 40)
  label!: string;

  @IsString() @Length(2, 200)
  street!: string;

  @IsString() @Length(2, 80)
  city!: string;

  @IsString() @Length(2, 80)
  state!: string;

  @IsOptional()
  @IsObject()
  coords?: { lat: number; lng: number } | null;
}

export class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  // Password policy: 8+ chars with uppercase, lowercase, number, symbol.
  // Must stay in sync with shared/utils/password.ts (single source of truth
  // for the frontend). Admin accounts use a stricter 12-char rule enforced
  // separately in the admin module.
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,}$/, {
    message: 'Password must include uppercase, lowercase, a number, and a symbol.',
  })
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @IsOptional()
  @IsBoolean()
  ageConfirmed?: boolean;

  @IsOptional()
  @IsISO8601()
  termsAcceptedAt?: string;

  // Spec V8 §1.13 - captured at registration via deep-link query param.
  // Reward fulfilment moves into the referral module in a later batch;
  // for now the value is just stored on the user record for attribution.
  @IsOptional()
  @IsString()
  referralCode?: string;

  // Optional on purpose. Collecting it speeds up the first booking by
  // pre-filling pickup, but signup is where people drop out, so it must
  // never block account creation.
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RegisterHomeAddressDto)
  homeAddress?: RegisterHomeAddressDto;
}
