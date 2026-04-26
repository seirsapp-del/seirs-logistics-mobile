import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FallbackService } from './fallback.service';
import { Delivery } from '../deliveries/delivery.entity';
import { MatchingModule } from '../matching/matching.module';
import { PartnersModule } from '../partners/partners.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery]),
    MatchingModule,
    PartnersModule,
    TrackingModule,
  ],
  providers: [FallbackService],
  exports: [FallbackService],
})
export class FallbackModule {}
