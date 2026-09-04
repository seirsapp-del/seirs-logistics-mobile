import { Logger, Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PartnerStoreService } from './partner-store.service';
import { PartnerStoreController } from './partner-store.controller';
import { PartnerDocumentsService } from './partner-documents.service';
import { AdminPartnerDocumentsController } from './admin-partner-documents.controller';
import { PartnerPayoutsService } from './partner-payouts.service';
import { AdminPartnerPayoutsController } from './admin-partner-payouts.controller';
import { KycDocument } from '../kyc/kyc-document.entity';
import { StoreDropoff } from './store-dropoff.entity';
import { PartnerStore } from '../business/partner-store.entity';
import { PartnerSponsorship } from './partner-sponsorship.entity';
import { User } from '../users/user.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { PartnerMoveRequest } from './partner-move-request.entity';
import { PartnerMoveService } from './partner-move.service';
import { ParcelRecoveryTask } from './parcel-recovery-task.entity';
import { ParcelRecoveryService } from './parcel-recovery.service';
import { PartnerCallLog } from './partner-call-log.entity';
import {
  PartnerMoveController, AdminPartnerMovesController, AdminPartnerCallsController,
} from './partner-move.controller';
import { SupportModule } from '../support/support.module';
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
    TypeOrmModule.forFeature([StoreDropoff, PartnerStore, User, PartnerSponsorship, Delivery, PartnerPayout, KycDocument, PartnerMoveRequest, ParcelRecoveryTask, PartnerCallLog]),
    FeesModule,
    IdentityModule,
    PricingModule,
    forwardRef(() => DeliveriesModule),
    forwardRef(() => PaymentsModule),
    MailModule,
    // A move raises a support ticket the shop reads the outcome in.
    SupportModule,
  ],
  controllers: [PartnerStoreController, AdminPartnerDocumentsController, AdminPartnerPayoutsController,
                PartnerMoveController, AdminPartnerMovesController, AdminPartnerCallsController],
  providers:   [PartnerStoreService, PartnerDocumentsService, PartnerPayoutsService, PartnerMoveService, ParcelRecoveryService],
  exports:     [PartnerStoreService, PartnerMoveService, ParcelRecoveryService],
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
    /**
     * Somewhere to send a shop's money (2026-09-03).
     *
     * partner_payouts has held an amount, a period and a status since it
     * was built, with no destination and nothing that ever set the status
     * to 'paid'. A counter accrued handling fees into a ledger that could
     * not be settled. These columns are the rail.
     *
     * All nullable and all additive, so this is safe to re-run and safe
     * on a table with rows in it. Same self-heal pattern the rest of the
     * codebase uses, because synchronize is off in production.
     */
    try {
      await this.ds.query(`
        ALTER TABLE "partner_stores"
          ADD COLUMN IF NOT EXISTS "bankName"                 character varying NULL,
          ADD COLUMN IF NOT EXISTS "bankCode"                 character varying NULL,
          ADD COLUMN IF NOT EXISTS "bankAccountNumber"        character varying NULL,
          ADD COLUMN IF NOT EXISTS "bankAccountName"          character varying NULL,
          ADD COLUMN IF NOT EXISTS "bankVerifiedAt"           timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "pendingBankName"          character varying NULL,
          ADD COLUMN IF NOT EXISTS "pendingBankCode"          character varying NULL,
          ADD COLUMN IF NOT EXISTS "pendingBankAccountNumber" character varying NULL,
          ADD COLUMN IF NOT EXISTS "pendingBankAccountName"   character varying NULL,
          ADD COLUMN IF NOT EXISTS "pendingBankRequestedAt"   timestamptz NULL
      `);
      await this.ds.query(
        `ALTER TABLE "partner_stores" ADD COLUMN IF NOT EXISTS "workingHours" jsonb NULL`,
      );

      /**
       * The move-request table, created here rather than by synchronize,
       * which is off in production. Every column is spelled out so a
       * partially-created table from an interrupted boot heals rather than
       * silently staying wrong.
       */
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "partner_call_logs" (
          "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "partnerStoreId" uuid NOT NULL,
          "scheduledFor"   timestamptz NULL,
          "calledAt"       timestamptz NULL,
          "adminUserId"    uuid NULL,
          "spokeTo"        varchar(120) NULL,
          "observations"   text NULL,
          "decision"       text NULL,
          "createdAt"      timestamptz NOT NULL DEFAULT now()
        )`);
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "idx_calls_store_created"
           ON "partner_call_logs" ("partnerStoreId", "createdAt")`);

      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "parcel_recovery_tasks" (
          "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "partnerStoreId"    uuid NOT NULL,
          "dropoffId"         uuid NOT NULL,
          "dropCode"          varchar(24) NULL,
          "trigger"           varchar(12) NOT NULL,
          "status"            varchar(12) NOT NULL DEFAULT 'open',
          "outcome"           varchar(16) NULL,
          "note"              text NULL,
          "resolvedByAdminId" uuid NULL,
          "resolvedAt"        timestamptz NULL,
          "createdAt"         timestamptz NOT NULL DEFAULT now()
        )`);
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "idx_recovery_store_status"
           ON "parcel_recovery_tasks" ("partnerStoreId", "status")`);
      /**
       * One OPEN task per parcel, enforced by the database.
       *
       * openTasksFor already skips parcels that have an open task, but that
       * is a read followed by a write. Suspend a shop twice in quick
       * succession and both passes see no existing task and both insert,
       * leaving two jobs for one parcel and a count that can never reach
       * zero honestly.
       */
      await this.ds.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "uniq_recovery_open_per_parcel"
           ON "parcel_recovery_tasks" ("dropoffId")
         WHERE "status" = 'open'`);

      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "partner_move_requests" (
          "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "partnerStoreId"       uuid NOT NULL,
          "status"               varchar(12) NOT NULL DEFAULT 'pending',
          "newStoreAddress"      text NOT NULL,
          "newStoreLat"          numeric(10,7) NULL,
          "newStoreLng"          numeric(10,7) NULL,
          "reason"               text NULL,
          "movingOn"             date NULL,
          "stillTradingAtOld"    boolean NOT NULL DEFAULT true,
          "parcelsHeldAtRequest" int NOT NULL DEFAULT 0,
          "oldStoreAddress"      text NULL,
          "oldStoreLat"          numeric(10,7) NULL,
          "oldStoreLng"          numeric(10,7) NULL,
          "ticketId"             uuid NULL,
          "decidedByAdminId"     uuid NULL,
          "decidedAt"            timestamptz NULL,
          "decisionNote"         text NULL,
          "rejectedItems"        text NULL,
          "createdAt"            timestamptz NOT NULL DEFAULT now()
        )`);
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "idx_move_store_status"
           ON "partner_move_requests" ("partnerStoreId", "status")`);
      /**
       * One pending move per shop, enforced by the DATABASE.
       *
       * The service checks for an existing pending row first, but a check
       * followed by an insert is not atomic: two taps a moment apart both
       * read "none pending" and both write. Same lesson the payout
       * idempotency index records, which is that an application-level
       * check does not survive a race.
       */
      await this.ds.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "uniq_move_pending_per_store"
           ON "partner_move_requests" ("partnerStoreId")
         WHERE "status" = 'pending'`);
      await this.ds.query(`
        ALTER TABLE "partner_payouts"
          ADD COLUMN IF NOT EXISTS "paidToBankName"      character varying NULL,
          ADD COLUMN IF NOT EXISTS "paidToAccountNumber" character varying NULL,
          ADD COLUMN IF NOT EXISTS "paidToAccountName"   character varying NULL,
          ADD COLUMN IF NOT EXISTS "transferReference"   character varying NULL,
          ADD COLUMN IF NOT EXISTS "providerTransferId"  character varying NULL,
          ADD COLUMN IF NOT EXISTS "failureReason"       text NULL
      `);
      /**
       * The idempotency index, and it is UNIQUE on purpose.
       *
       * The reference is what stops a payout being sent twice. A unique
       * index means the database refuses a duplicate even if two requests
       * race past the application check, which is the only guarantee that
       * survives concurrency.
       */
      await this.ds.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "partner_payouts_transfer_ref"
           ON "partner_payouts" ("transferReference")
         WHERE "transferReference" IS NOT NULL`,
      );
    } catch (e: any) {
      this.logger.error(`partner payout rail self-heal failed: ${e?.message ?? e}`);
    }

    /**
     * Carry hours across ONLY for shops that actually chose them.
     *
     * partner_stores defaults operatingDays to Mon through Sat, openTime
     * to 08:00 and closeTime to 18:00, so every store on the platform
     * already "has hours" and not one owner picked them. Migrating those
     * would turn a default into a statement: withinWorkingHours reads
     * unset as open, but a migrated default says CLOSED ON SUNDAY, and
     * dispatch would start skipping shops on a rule nobody made.
     *
     * So a row is migrated only where at least one of the three differs
     * from its default. Everything else stays null and stays open.
     *
     * The asymmetry is deliberate and it is the reason to be cautious in
     * this direction: an over-open shop receives a parcel it can refuse,
     * an over-closed one silently disappears from the directory and
     * nobody finds out.
     */
    try {
      const DAY = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' } as const;
      const DEFAULT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      const rows: any[] = await this.ds.query(`
        SELECT id, "operatingDays", "openTime", "closeTime"
          FROM "partner_stores"
         WHERE "workingHours" IS NULL
      `);

      let migrated = 0;
      for (const r of rows) {
        const days  = Array.isArray(r.operatingDays) ? r.operatingDays : [];
        const open  = String(r.openTime  ?? '08:00');
        const close = String(r.closeTime ?? '18:00');

        const sameDays = days.length === DEFAULT_DAYS.length
          && DEFAULT_DAYS.every(d => days.includes(d));
        const untouched = sameDays && open === '08:00' && close === '18:00';
        if (untouched) continue;      // a default is not an answer

        const hours: Record<string, { enabled: boolean; start: string; end: string }> = {};
        for (const [label, key] of Object.entries(DAY)) {
          hours[key] = { enabled: days.includes(label), start: open, end: close };
        }
        await this.ds.query(
          `UPDATE "partner_stores" SET "workingHours" = $2 WHERE id = $1`,
          [r.id, JSON.stringify(hours)],
        );
        migrated++;
      }
      if (migrated) this.logger.log(`partner working hours carried across: ${migrated}`);
    } catch (e: any) {
      this.logger.error(`partner working hours migration failed: ${e?.message ?? e}`);
    }

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
