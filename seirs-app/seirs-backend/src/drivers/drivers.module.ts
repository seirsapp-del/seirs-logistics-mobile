import { Module, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver } from './driver.entity';
import { DriverTrip } from './driver-trip.entity';
import { DriverStatusBroadcast } from './driver-status-broadcast.entity';
import { DriverSubscription } from './driver-subscription.entity';
import { DriverLevelChange } from './driver-level-change.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Wallet } from '../payments/wallet.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { FraudModule } from '../fraud/fraud.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import { FeesModule } from '../fees/fees.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverTrip, DriverStatusBroadcast, DriverSubscription, DriverLevelChange, Delivery, Wallet]),
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
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  // Wire the auto-checkin cron's push channel without a circular import.
  async onModuleInit() {
    this.driversService.notificationsService = this.notificationsService;

    // Value levels (2026-08-22): additive migrations, safe to re-run.
    try {
      await this.ds.query(`
        ALTER TABLE "drivers"
          ADD COLUMN IF NOT EXISTS "valueLevel" integer NOT NULL DEFAULT 1,
          ADD COLUMN IF NOT EXISTS "corridorDestLat" numeric(10,7) NULL,
          ADD COLUMN IF NOT EXISTS "corridorDestLng" numeric(10,7) NULL,
          ADD COLUMN IF NOT EXISTS "corridorLabel" varchar(120) NULL,
          ADD COLUMN IF NOT EXISTS "corridorExpiresAt" timestamptz NULL
      `);
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "driver_level_changes" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "driverId" uuid NOT NULL,
          "fromLevel" integer NOT NULL,
          "toLevel" integer NOT NULL,
          "reason" text NOT NULL,
          "requestedByAdminId" uuid NOT NULL,
          "status" varchar(12) NOT NULL DEFAULT 'pending',
          "decidedByAdminId" uuid NULL,
          "decidedAt" timestamptz NULL,
          "decisionNote" text NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_dlc_driver" ON "driver_level_changes" ("driverId")
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_dlc_status" ON "driver_level_changes" ("status")
      `);
    } catch (e) {
      // A failed migration must not stop boot; the entity sync path
      // covers dev, and the next boot retries.
      // eslint-disable-next-line no-console
      console.error('drivers level migration skipped:', (e as any)?.message ?? e);
    }
  }
}
