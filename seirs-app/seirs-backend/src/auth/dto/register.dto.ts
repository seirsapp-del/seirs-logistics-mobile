import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
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
  role: UserRole; // 'customer' or 'driver'

  // Required only when role === 'driver'
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;
}
