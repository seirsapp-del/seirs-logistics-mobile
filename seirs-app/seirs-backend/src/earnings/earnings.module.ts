import { Module, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverEarning } from './driver-earning.entity';
import { DriverPayout } from './driver-payout.entity';
import { User } from '../users/user.entity';
import { AuditLogEntry } from '../admin/audit-log.entity';
import { EarningsService } from './earnings.service';
import { EarningsController } from './earnings.controller';
import { FlutterwaveModule } from '../payments/flutterwave.module';
import { FeesModule } from '../fees/fees.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports:     [
    TypeOrmModule.forFeature([DriverEarning, DriverPayout, User, AuditLogEntry]),
    FlutterwaveModule,
    FeesModule,
    NotificationsModule,
  ],
  providers:   [EarningsService],
  controllers: [EarningsController],
  exports:     [EarningsService],
})
export class EarningsModule implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * synchronize is false in production, so a new table has to be created
   * here or the first payout after deploy throws on an object that does
   * not exist. IF NOT EXISTS keeps it idempotent across restarts.
   */
  async onModuleInit() {
    const statements = [
      `CREATE TABLE IF NOT EXISTS "driver_payouts" (
         "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         "driver_id" uuid NOT NULL,
         "driver_name" character varying(200),
         "requested_ngn" numeric(12,2) NOT NULL,
         "sent_ngn" numeric(12,2) NOT NULL,
         "holdback_ngn" numeric(12,2) NOT NULL DEFAULT 0,
         "reference" character varying(200) NOT NULL,
         "flutterwave_transfer_id" character varying(100),
         "earning_count" integer NOT NULL DEFAULT 0,
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "driver_payouts_reference_idx" ON "driver_payouts" ("reference")`,
      `CREATE INDEX IF NOT EXISTS "driver_payouts_driver_idx" ON "driver_payouts" ("driver_id")`,
    ];
    for (const sql of statements) {
      try { await this.dataSource.query(sql); } catch { /* already present */ }
    }
  }
}
