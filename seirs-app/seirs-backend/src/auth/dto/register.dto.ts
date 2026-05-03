import { IsBoolean, IsEmail, IsEnum, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../users/user.entity';
import { VehicleType } from '../../drivers/driver.entity';

export class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsString()
  @MinLength(8)
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
