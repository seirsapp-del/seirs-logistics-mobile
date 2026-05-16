import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevPlatformService } from './dev-platform.service';
import { DevPlatformController } from './dev-platform.controller';
import { ApiKey } from './api-key.entity';
import { WebhookEndpoint, WebhookDelivery } from './webhook.entity';
import { IdempotencyKey } from './idempotency-key.entity';
import { ApiKeyGuard } from './api-key.guard';
import { V1Service } from './v1.service';
import { V1Controller } from './v1.controller';
import { Delivery } from '../deliveries/delivery.entity';
import { BusinessModule } from '../business/business.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey, WebhookEndpoint, WebhookDelivery, IdempotencyKey, Delivery]),
    BusinessModule,
    DeliveriesModule,
    PricingModule,
  ],
  controllers: [DevPlatformController, V1Controller],
  providers:   [DevPlatformService, V1Service, ApiKeyGuard],
  exports:     [DevPlatformService],
})
export class DevPlatformModule implements OnModuleInit {
  constructor(
    private readonly devPlatformService: DevPlatformService,
    private readonly deliveriesService:  DeliveriesService,
  ) {}

  // Lazy wire — DeliveriesModule can't import DevPlatformModule (circular)
  // but DevPlatformModule imports DeliveriesModule, so we set the
  // optional property on the deliveries service here.
  onModuleInit() {
    (this.deliveriesService as any).devPlatformService = this.devPlatformService;
  }
}
