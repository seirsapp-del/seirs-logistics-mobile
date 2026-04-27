import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver } from './driver.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [TypeOrmModule.forFeature([Driver]), TrackingModule, FraudModule],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
