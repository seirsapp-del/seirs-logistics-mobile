import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PricingModule } from '../pricing/pricing.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from '../support/support-ticket.entity';

@Module({
  imports:     [PricingModule, TypeOrmModule.forFeature([SupportTicket])],
  controllers: [HealthController],
})
export class HealthModule {}
