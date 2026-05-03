import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver } from './driver.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [TypeOrmModule.forFeature([Driver, Delivery]), TrackingModule, FraudModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
