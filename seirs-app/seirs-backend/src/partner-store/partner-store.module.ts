import { Logger, Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PartnerStoreService } from './partner-store.service';
import { PartnerStoreController } from './partner-store.controller';
import { PartnerDocumentsService } from './partner-documents.service';
import { AdminPartnerDocumentsController } from './admin-partner-documents.controller';
import { KycDocument } from '../kyc/kyc-document.entity';
import { StoreDropoff } from './store-dropoff.entity';
import { PartnerStore } from '../business/partner-store.entity';
import { PartnerSponsorship } from './partner-sponsorship.entity';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { FeesModule } from '../fees/fees.module';
import { IdentityModule } from '../identity/identity.module';
import { PricingModule } from '../pricing/pricing.module';
import { PartnerPayout } from '../business/partner-payout.entity';
import { PaymentsModule } from '../payments/payments.module';
import { MailModule } from '../mail/mail.module';
// Real road distance for counter-to-counter quotes (2026-08-31). The
// straight line this used to price on is ~20% short over an interstate
// leg, and SEIRS ate the difference on every one.
import { DeliveriesModule } from '../deliveries/deliveries.module';

/**
 * Idempotent boot-time schema self-heal for the partner_stores table.
 * Matches the pattern used by ChatModule / SupportModule / DeliveriesModule
 * so Railway does not need a manual SYNC_DB toggle when we add nullable
 * columns like the new storeLat / storeLng added for /find-a-partner
 * distance sort.
 */
@Module({
  imports: [
    // KycDocument registered locally as well as globally, so a provider
    // resolution mistake is a compile error rather than a boot crash.
    TypeOrmModule.forFeature([StoreDropoff, PartnerStore, User, PartnerSponsorship, Delivery, PartnerPayout, KycDocument]),
    FeesModule,
    IdentityModule,
    PricingModule,
    forwardRef(() => DeliveriesModule),
    forwardRef(() => PaymentsModule),
    MailModule,
  ],
  controllers: [PartnerStoreController, AdminPartnerDocumentsController],
  providers:   [PartnerStoreService, PartnerDocumentsService],
  exports:     [PartnerStoreService],
})
export class PartnerStoreModule implements OnModuleInit {
  private readonly logger = new Logger(PartnerStoreModule.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Each statement runs on its own. The whole block used to sit in one
   * try/catch, so a single failure silently skipped everything after it:
   * an approved store never received its storeCode and its owner saw
   * "Code pending approval" on a counter that was live and taking
   * drop-offs (founder 2026-08-16, still unfixed on 2026-08-17 because
   * the backfill below never ran).
   */
  private async run(label: string, sql: string): Promise<void> {
    try {
      await this.ds.query(sql);
    } catch (e: any) {
      this.logger.error(`partner-store self-heal FAILED [${label}]: ${e?.message ?? e}`);
    }
  }

  async onModuleInit() {
    try {
    // Repair the missing back-link on any account that owns a store but
    // has no partnerStoreId: without it every partner endpoint 403s.
    await this.run('backfill user.partnerStoreId', `
      UPDATE "users" u
         SET "partnerStoreId" = s.id
        FROM "partner_stores" s
       WHERE s."userId" = u.id
         AND u."partnerStoreId" IS NULL
    `);
    // Money on a drop-off (2026-08-18). Production does not auto-sync,
    // so the columns are added here alongside the rest of the self-heal.
    await this.run('dropoff money columns', `
        ALTER TABLE "store_dropoffs"
          ADD COLUMN IF NOT EXISTS "recipientLat" numeric(9,6) NULL,
          ADD COLUMN IF NOT EXISTS "recipientLng" numeric(9,6) NULL,
          ADD COLUMN IF NOT EXISTS "paidAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "partnerHandlingNgn" numeric(12,2) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "driverEarningsNgn" numeric(12,2) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "topUpOwedNgn" numeric(12,2) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "topUpPaidAt" timestamptz NULL
      `);
    // Drop-off payments hang off the drop-off, not a delivery.
    await this.run('payments.dropoffId', `
        ALTER TABLE "payments"
          ADD COLUMN IF NOT EXISTS "dropoffId" uuid NULL
      `);
    await this.run('step1', `
        ALTER TABLE "partner_stores"
          ADD COLUMN IF NOT EXISTS "storeLat" numeric(9,6) NULL
      `);
    await this.run('step2', `
        ALTER TABLE "partner_stores"
          ADD COLUMN IF NOT EXISTS "storeLng" numeric(9,6) NULL
      `);
      // Public store code (2026-08-12): identifies the physical shop on
      // labels, in the customer picker, and to support.
    await this.run('step3', `
        ALTER TABLE "partner_stores"
          ADD COLUMN IF NOT EXISTS "storeCode" varchar(12) NULL
      `);
    await this.run('step4', `
        CREATE UNIQUE INDEX IF NOT EXISTS "partner_stores_store_code_uniq"
          ON "partner_stores" ("storeCode") WHERE "storeCode" IS NOT NULL
      `);
      // Backfill: stores approved before codes existed still need one,
      // since customers are already being sent to them. Postgres-side so
      // it is a single statement regardless of how many rows exist.
    await this.run('step5', `
        UPDATE "partner_stores"
           SET "storeCode" = 'PART-' || upper(substr(md5(random()::text || id::text), 1, 4))
         WHERE "storeCode" IS NULL
           AND status IN ('approved', 'active')
      `);
      // Storage-policy columns (2026-08-09): once-only overstay warning
      // stamp + flat return fee owed/paid tracking.
    await this.run('step6', `
        ALTER TABLE "store_dropoffs"
          ADD COLUMN IF NOT EXISTS "senderOverstayNotifiedAt" timestamptz NULL
      `);
    await this.run('step7', `
        ALTER TABLE "store_dropoffs"
          ADD COLUMN IF NOT EXISTS "returnFeeOwedNgn" numeric(12,2) NOT NULL DEFAULT 0
      `);
    await this.run('step8', `
        ALTER TABLE "store_dropoffs"
          ADD COLUMN IF NOT EXISTS "returnFeePaidAt" timestamptz NULL
      `);
      // Link to the driver-leg Delivery created when the package hits
      // AWAITING_DRIVER (2026-08-10: store packages used to sit in a
      // queue no driver could see).
    await this.run('step9', `
        ALTER TABLE "store_dropoffs"
          ADD COLUMN IF NOT EXISTS "deliveryId" uuid NULL
      `);
      // Optional recipient email so no-account recipients can receive
      // the collection OTP by email (no SMS per launch policy).
    await this.run('step10', `
        ALTER TABLE "store_dropoffs"
          ADD COLUMN IF NOT EXISTS "recipientEmail" varchar(255) NULL
      `);
      this.logger.log('partner_stores schema self-heal complete');
    } catch (e: any) {
      this.logger.warn(`partner_stores self-heal skipped: ${e?.message ?? e}`);
    }
  }
}
