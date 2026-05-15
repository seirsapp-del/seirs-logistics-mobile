import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverEarning } from './driver-earning.entity';
import { User } from '../users/user.entity';
import { EarningsService } from './earnings.service';
import { EarningsController } from './earnings.controller';
import { FlutterwaveModule } from '../payments/flutterwave.module';

@Module({
  imports:     [
    TypeOrmModule.forFeature([DriverEarning, User]),
    FlutterwaveModule,
  ],
  providers:   [EarningsService],
  controllers: [EarningsController],
  exports:     [EarningsService],
})
export class EarningsModule {}
