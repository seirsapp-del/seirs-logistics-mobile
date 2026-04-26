import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BulkService } from './bulk.service';
import { BulkController } from './bulk.controller';
import { Delivery } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';
import { PricingService } from '../deliveries/pricing.service';

@Module({
  imports: [TypeOrmModule.forFeature([Delivery, User])],
  providers: [BulkService, PricingService],
  controllers: [BulkController],
})
export class BulkModule {}
