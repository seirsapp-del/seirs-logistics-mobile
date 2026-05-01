import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BulkService } from './bulk.service';
import { BulkController } from './bulk.controller';
import { Delivery } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';
import { PricingService } from '../deliveries/pricing.service';
import { FxModule } from '../fx/fx.module';

@Module({
  imports: [TypeOrmModule.forFeature([Delivery, User]), FxModule],
  providers: [BulkService, PricingService],
  controllers: [BulkController],
})
export class BulkModule {}
