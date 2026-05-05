import { IsBoolean, IsEmail, IsEnum, IsISO8601, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { UserRole } from '../../users/user.entity';
import { VehicleType } from '../../drivers/driver.entity';

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

  // Spec V8 §1.13 — captured at registration via deep-link query param.
  // Reward fulfilment moves into the referral module in a later batch;
  // for now the value is just stored on the user record for attribution.
  @IsOptional()
  @IsString()
  referralCode?: string;
}
