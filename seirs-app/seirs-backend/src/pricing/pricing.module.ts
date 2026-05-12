import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateCard } from './rate-card.entity';
import { ServiceCategory } from './service-category.entity';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';

/**
 * Pricing system — RateCard + ServiceCategory entities, plus the
 * PricingService that turns booking inputs into a full PriceBreakdown.
 *
 * Imported by BusinessModule wherever a booking is created.
 *
 * On first boot, PricingService.onModuleInit seeds default rates +
 * categories matching seirs-pricing-spec.html v1. Subsequent boots are
 * no-ops — admin updates come through the dashboard.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RateCard, ServiceCategory])],
  providers: [PricingService],
  controllers: [PricingController],
  exports: [PricingService],
})
export class PricingModule {}
