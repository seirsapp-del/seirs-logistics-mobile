import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeesService } from './fees.service';
import { FeesController } from './fees.controller';
import { Fee } from './fee.entity';
import { FeeHistory } from './fee-history.entity';
import { TrackingModule } from '../tracking/tracking.module';

// The fees_unit_enum self-heal lives in FeesService.onModuleInit, NOT
// here: Nest runs provider hooks before the module class hook, so an
// ALTER TYPE in this file would fire after the seeding that needs it.
@Module({
  imports:     [TypeOrmModule.forFeature([Fee, FeeHistory]), TrackingModule],
  controllers: [FeesController],
  providers:   [FeesService],
  exports:     [FeesService],
})
export class FeesModule {}
