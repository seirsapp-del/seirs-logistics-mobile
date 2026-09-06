import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { FlutterwaveModule } from './flutterwave.module';
import { Payment } from './payment.entity';
import { Wallet } from './wallet.entity';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { EarningsModule } from '../earnings/earnings.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Wallet]),
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
  private readonly logger = new Logger(PaymentsModule.name);

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
      // A payment rail is not knowable until the provider reports one,
      // so a row has to be allowed to exist without a method. Until this
      // ran, the column was NOT NULL and every creation path filled it
      // with a placeholder CARD to satisfy the constraint.
      `ALTER TABLE "payments" ALTER COLUMN "method" DROP NOT NULL`,
    ];
    for (const sql of alters) {
      try { await this.dataSource.query(sql); }
      catch { /* column exists or table not yet created; both fine */ }
    }

    await this.healPaymentMethodEnum();
  }

  /**
   * Add rails to the payments.method enum that the deployed type does
   * not have yet. USSD is the first: checkout has always offered it via
   * payment_options, so it was already reachable by a customer.
   *
   * The type name is resolved from the catalogue rather than assumed to
   * be "payments_method_enum". A hardcoded name wrapped in the usual
   * try/catch fails SILENTLY, and the failure mode is not cosmetic: the
   * TypeScript keeps compiling, the enum keeps looking right, and every
   * insert carrying the new value throws in production instead. If the
   * lookup finds nothing, that is worth a log line, not a swallow.
   *
   * ADD VALUE runs as its own statement per value, never batched: some
   * Postgres versions refuse more than one ADD VALUE per transaction,
   * and a batch would take the whole heal down with it. IF NOT EXISTS
   * makes each one safe to re-run on every boot.
   */
  private async healPaymentMethodEnum() {
    const values = ['ussd'];

    let typeName: string | undefined;
    try {
      const rows: Array<{ typname: string }> = await this.dataSource.query(
        `SELECT t.typname
           FROM pg_type t
           JOIN pg_attribute a ON a.atttypid = t.oid
           JOIN pg_class     c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'payments'
            AND a.attname = 'method'
            AND t.typtype = 'e'
            AND n.nspname = ANY (current_schemas(false))
          LIMIT 1`,
      );
      typeName = rows?.[0]?.typname;
    } catch (e: any) {
      this.logger.warn(`Could not read the payments.method enum type: ${e?.message ?? e}`);
      return;
    }

    if (!typeName) {
      // A fresh database that has not built the table yet is the benign
      // case. A deployed one reaching here means new rails cannot be
      // written and somebody needs to know before a customer finds out.
      this.logger.warn(
        'No enum type backs payments.method, so rails ' +
        `[${values.join(', ')}] were not added. Expected on a fresh database only.`,
      );
      return;
    }

    for (const v of values) {
      try {
        await this.dataSource.query(
          `ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS '${v}'`,
        );
      } catch (e: any) {
        this.logger.warn(`Could not add '${v}' to ${typeName}: ${e?.message ?? e}`);
      }
    }
  }
}
