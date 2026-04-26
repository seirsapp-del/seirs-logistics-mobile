import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { PricingService } from './pricing.service';
import { Delivery } from './delivery.entity';
import { MatchingModule } from '../matching/matching.module';
import { TrackingModule } from '../tracking/tracking.module';
import { MatchingService } from '../matching/matching.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { FallbackModule } from '../fallback/fallback.module';
import { FallbackService } from '../fallback/fallback.service';
import { NotificationsService } from '../notifications/notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery]),
    MatchingModule,
    TrackingModule,
    forwardRef(() => PaymentsModule),
    FallbackModule,
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, PricingService],
  exports: [DeliveriesService, PricingService],
})
export class DeliveriesModule implements OnModuleInit {
  constructor(
    private deliveriesService:    DeliveriesService,
    private matchingService:      MatchingService,
    private trackingGateway:      TrackingGateway,
    private paymentsService:      PaymentsService,
    private fallbackService:      FallbackService,
    private notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    this.deliveriesService.matchingService      = this.matchingService;
    this.deliveriesService.trackingGateway      = this.trackingGateway;
    this.deliveriesService.paymentsService      = this.paymentsService;
    this.deliveriesService.fallbackService      = this.fallbackService;
    this.deliveriesService.notificationsService = this.notificationsService;

    // Give NotificationsService a reference to the gateway for WS delivery
    this.notificationsService.trackingGateway = this.trackingGateway;
  }
}
