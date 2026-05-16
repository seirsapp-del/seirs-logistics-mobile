import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver } from './driver.entity';
import { DriverTrip } from './driver-trip.entity';
import { DriverStatusBroadcast } from './driver-status-broadcast.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Wallet } from '../payments/wallet.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverTrip, DriverStatusBroadcast, Delivery, Wallet]),
    TrackingModule,
    FraudModule,
  ],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
