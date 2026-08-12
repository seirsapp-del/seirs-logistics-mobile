import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { FlutterwaveModule } from './flutterwave.module';
import { Payment } from './payment.entity';
import { Wallet } from './wallet.entity';
import { SavedCard } from './saved-card.entity';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { EarningsModule } from '../earnings/earnings.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Wallet, SavedCard]),
    FlutterwaveModule,
    forwardRef(() => DeliveriesModule),
    EarningsModule,
    LoyaltyModule,
    MaintenanceModule,
  ],
  controllers: [PaymentsController],
  providers:   [PaymentsService],
  exports:     [PaymentsService, FlutterwaveModule],
})
export class PaymentsModule implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  // Idempotent self-heal so SYNC_DB is never needed: pending-bank-change
  // columns (admin-reviewed bank replacement, 2026-08-09 policy).
  async onModuleInit() {
    const alters = [
      `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "pendingBankName" character varying`,
      `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "pendingBankCode" character varying`,
      `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "pendingBankAccountNumber" character varying`,
      `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "pendingBankAccountName" character varying`,
      `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "pendingBankRequestedAt" timestamptz`,
      `ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "pendingBankTicketId" uuid`,
      // Demo/marketing accounts (2026-08-12 security review): dispatch,
      // directory, and withdrawal guards all read this flag.
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isDemo" boolean NOT NULL DEFAULT false`,
      `CREATE INDEX IF NOT EXISTS "users_is_demo_idx" ON "users" ("isDemo")`,
      // What a payment is FOR: keeps the failed-delivery redirect fee
      // from being mistaken for the fare and released to a driver.
      `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "purpose" character varying(16) NOT NULL DEFAULT 'delivery'`,
    ];
    for (const sql of alters) {
      try { await this.dataSource.query(sql); }
      catch { /* column exists or table not yet created; both fine */ }
    }
  }
}
