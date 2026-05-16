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
import { MailService } from '../mail/mail.service';
import { FxModule } from '../fx/fx.module';
import { DriversModule } from '../drivers/drivers.module';
import { DriversService } from '../drivers/drivers.service';
import { MaintenanceModule } from '../maintenance/maintenance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery]),
    MatchingModule,
    TrackingModule,
    forwardRef(() => PaymentsModule),
    FallbackModule,
    FxModule,
    forwardRef(() => DriversModule),
    MaintenanceModule,
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
    private mailService:          MailService,
    private driversService:       DriversService,
  ) {}

  onModuleInit() {
    this.deliveriesService.matchingService      = this.matchingService;
    this.deliveriesService.trackingGateway      = this.trackingGateway;
    this.deliveriesService.paymentsService      = this.paymentsService;
    this.deliveriesService.fallbackService      = this.fallbackService;
    this.deliveriesService.notificationsService = this.notificationsService;
    this.deliveriesService.mailService          = this.mailService;
    this.deliveriesService.driversService       = this.driversService;

    // Give NotificationsService a reference to the gateway for WS delivery
    this.notificationsService.trackingGateway = this.trackingGateway;
  }
}
