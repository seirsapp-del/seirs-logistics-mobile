import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports:     [PricingModule],
  controllers: [HealthController],
})
export class HealthModule {}
