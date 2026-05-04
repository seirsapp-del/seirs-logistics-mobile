import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeesService } from './fees.service';
import { FeesController } from './fees.controller';
import { Fee } from './fee.entity';
import { FeeHistory } from './fee-history.entity';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports:     [TypeOrmModule.forFeature([Fee, FeeHistory]), TrackingModule],
  controllers: [FeesController],
  providers:   [FeesService],
  exports:     [FeesService],
})
export class FeesModule {}
