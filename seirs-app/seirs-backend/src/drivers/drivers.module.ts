import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver } from './driver.entity';
import { DriverTrip } from './driver-trip.entity';
import { DriverStatusBroadcast } from './driver-status-broadcast.entity';
import { DriverSubscription } from './driver-subscription.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Wallet } from '../payments/wallet.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { FraudModule } from '../fraud/fraud.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import { FeesModule } from '../fees/fees.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverTrip, DriverStatusBroadcast, DriverSubscription, Delivery, Wallet]),
    TrackingModule,
    FraudModule,
    NotificationsModule,
    FeesModule,
  ],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule implements OnModuleInit {
  constructor(
    private readonly driversService:      DriversService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Wire the auto-checkin cron's push channel without a circular import.
  onModuleInit() {
    this.driversService.notificationsService = this.notificationsService;
  }
}
