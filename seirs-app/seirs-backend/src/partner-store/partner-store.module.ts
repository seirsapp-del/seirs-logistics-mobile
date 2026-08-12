import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PartnerStoreService } from './partner-store.service';
import { PartnerStoreController } from './partner-store.controller';
import { StoreDropoff } from './store-dropoff.entity';
import { PartnerStore } from '../business/partner-store.entity';
import { PartnerSponsorship } from './partner-sponsorship.entity';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { FeesModule } from '../fees/fees.module';
import { IdentityModule } from '../identity/identity.module';
import { MailModule } from '../mail/mail.module';

/**
 * Idempotent boot-time schema self-heal for the partner_stores table.
 * Matches the pattern used by ChatModule / SupportModule / DeliveriesModule
 * so Railway does not need a manual SYNC_DB toggle when we add nullable
 * columns like the new storeLat / storeLng added for /find-a-partner
 * distance sort.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([StoreDropoff, PartnerStore, User, PartnerSponsorship, Delivery]),
    FeesModule,
    IdentityModule,
    MailModule,
  ],
  controllers: [PartnerStoreController],
  providers:   [PartnerStoreService],
  exports:     [PartnerStoreService],
})
export class PartnerStoreModule implements OnModuleInit {
  private readonly logger = new Logger(PartnerStoreModule.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async onModuleInit() {
    try {
      await this.ds.query(`
        ALTER TABLE "partner_stores"
          ADD COLUMN IF NOT EXISTS "storeLat" numeric(9,6) NULL
      `);
      await this.ds.query(`
        ALTER TABLE "partner_stores"
          ADD COLUMN IF NOT EXISTS "storeLng" numeric(9,6) NULL
      `);
      // Public store code (2026-08-12): identifies the physical shop on
      // labels, in the customer picker, and to support.
      await this.ds.query(`
        ALTER TABLE "partner_stores"
          ADD COLUMN IF NOT EXISTS "storeCode" varchar(12) NULL
      `);
      await this.ds.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "partner_stores_store_code_uniq"
          ON "partner_stores" ("storeCode") WHERE "storeCode" IS NOT NULL
      `);
      // Backfill: stores approved before codes existed still need one,
      // since customers are already being sent to them. Postgres-side so
      // it is a single statement regardless of how many rows exist.
      await this.ds.query(`
        UPDATE "partner_stores"
           SET "storeCode" = 'PART-' || upper(substr(md5(random()::text || id::text), 1, 4))
         WHERE "storeCode" IS NULL
           AND status IN ('approved', 'active')
      `);
      // Storage-policy columns (2026-08-09): once-only overstay warning
      // stamp + flat return fee owed/paid tracking.
      await this.ds.query(`
        ALTER TABLE "store_dropoffs"
          ADD COLUMN IF NOT EXISTS "senderOverstayNotifiedAt" timestamptz NULL
      `);
      await this.ds.query(`
        ALTER TABLE "store_dropoffs"
          ADD COLUMN IF NOT EXISTS "returnFeeOwedNgn" numeric(12,2) NOT NULL DEFAULT 0
      `);
      await this.ds.query(`
        ALTER TABLE "store_dropoffs"
          ADD COLUMN IF NOT EXISTS "returnFeePaidAt" timestamptz NULL
      `);
      // Link to the driver-leg Delivery created when the package hits
      // AWAITING_DRIVER (2026-08-10: store packages used to sit in a
      // queue no driver could see).
      await this.ds.query(`
        ALTER TABLE "store_dropoffs"
          ADD COLUMN IF NOT EXISTS "deliveryId" uuid NULL
      `);
      // Optional recipient email so no-account recipients can receive
      // the collection OTP by email (no SMS per launch policy).
      await this.ds.query(`
        ALTER TABLE "store_dropoffs"
          ADD COLUMN IF NOT EXISTS "recipientEmail" varchar(255) NULL
      `);
      this.logger.log('partner_stores schema self-heal complete');
    } catch (e: any) {
      this.logger.warn(`partner_stores self-heal skipped: ${e?.message ?? e}`);
    }
  }
}
