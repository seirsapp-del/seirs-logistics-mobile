import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { SpecialRequest } from './special-request.entity';
import { SpecialRequestQuote, SpecialRequestCall } from './special-request-quote.entity';
import { SpecialRequestsService } from './special-requests.service';
import {
  SpecialRequestsController, AdminSpecialRequestsController,
} from './special-requests.controller';
import { FeesModule } from '../fees/fees.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SpecialRequest, SpecialRequestQuote, SpecialRequestCall]),
    // Quote expiry hours are a Fee Catalogue row, read rather than seeded.
    FeesModule,
  ],
  controllers: [SpecialRequestsController, AdminSpecialRequestsController],
  providers: [SpecialRequestsService],
  exports: [SpecialRequestsService],
})
export class SpecialRequestsModule implements OnModuleInit {
  private readonly logger = new Logger(SpecialRequestsModule.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Self-heal DDL, because synchronize is off in production.
   *
   * Each statement runs on its own rather than in one try/catch, so a
   * single failure cannot silently skip everything after it. That is the
   * shape that once left an approved store without its code while the
   * boot log looked clean.
   */
  private async run(label: string, sql: string) {
    try {
      await this.ds.query(sql);
    } catch (e: any) {
      this.logger.error(`special-requests self-heal (${label}) failed: ${e?.message ?? e}`);
    }
  }

  async onModuleInit() {
    await this.run('requests table', `
      CREATE TABLE IF NOT EXISTS "special_requests" (
        "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "reference"             varchar(20) NOT NULL,
        "senderUserId"          uuid NOT NULL,
        "status"                varchar(12) NOT NULL DEFAULT 'submitted',
        "category"              varchar(16) NOT NULL DEFAULT 'other',
        "description"           text NOT NULL,
        "weightKg"              numeric(10,2) NULL,
        "lengthCm"              int NULL,
        "widthCm"               int NULL,
        "heightCm"              int NULL,
        "liftingHands"          int NULL,
        "fragile"               boolean NOT NULL DEFAULT false,
        "hazardous"             boolean NOT NULL DEFAULT false,
        "temperatureControlled" boolean NOT NULL DEFAULT false,
        "timeCriticality"       text NULL,
        "pickupAddress"         text NOT NULL,
        "pickupLat"             numeric(10,7) NULL,
        "pickupLng"             numeric(10,7) NULL,
        "dropoffAddress"        text NOT NULL,
        "dropoffLat"            numeric(10,7) NULL,
        "dropoffLng"            numeric(10,7) NULL,
        "accessPickup"          text NULL,
        "accessDropoff"         text NULL,
        "pickupContactName"     varchar(120) NULL,
        "pickupContactPhone"    varchar(24) NULL,
        "dropoffContactName"    varchar(120) NULL,
        "dropoffContactPhone"   varchar(24) NULL,
        "photoUrls"             text NULL,
        "deliveryId"            uuid NULL,
        "assignedAdminId"       uuid NULL,
        "declineReason"         text NULL,
        "escalatedToAdminId"    uuid NULL,
        "escalationNote"        text NULL,
        "liabilityAcceptedAt"   timestamptz NULL,
        "createdAt"             timestamptz NOT NULL DEFAULT now(),
        "updatedAt"             timestamptz NOT NULL DEFAULT now()
      )`);

    await this.run('reference unique', `
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_special_request_reference"
        ON "special_requests" ("reference")`);
    await this.run('status index', `
      CREATE INDEX IF NOT EXISTS "idx_special_request_status_created"
        ON "special_requests" ("status", "createdAt")`);
    await this.run('sender index', `
      CREATE INDEX IF NOT EXISTS "idx_special_request_sender"
        ON "special_requests" ("senderUserId")`);

    await this.run('quotes table', `
      CREATE TABLE IF NOT EXISTS "special_request_quotes" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "requestId"       uuid NOT NULL,
        "lines"           jsonb NOT NULL,
        "totalNgn"        numeric(12,2) NOT NULL,
        "expiresAt"       timestamptz NOT NULL,
        "quotedByAdminId" uuid NULL,
        "note"            text NULL,
        "supersededAt"    timestamptz NULL,
        "acceptedAt"      timestamptz NULL,
        "createdAt"       timestamptz NOT NULL DEFAULT now()
      )`);

    /**
     * One live quote per request, enforced by the database.
     *
     * The service supersedes the previous quote before writing a new one,
     * but that is a read followed by a write: two admins quoting the same
     * job within a second would both see none live and both insert, and
     * "the current quote" would stop having an answer. Same reasoning as
     * the one-pending-move index.
     */
    await this.run('one live quote', `
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_special_quote_live"
        ON "special_request_quotes" ("requestId")
      WHERE "supersededAt" IS NULL`);

    await this.run('quotes index', `
      CREATE INDEX IF NOT EXISTS "idx_special_quote_request"
        ON "special_request_quotes" ("requestId", "createdAt")`);

    await this.run('calls table', `
      CREATE TABLE IF NOT EXISTS "special_request_calls" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "requestId"   uuid NOT NULL,
        "adminUserId" uuid NULL,
        "calledAt"    timestamptz NULL,
        "spokeTo"     varchar(120) NULL,
        "notes"       text NULL,
        "createdAt"   timestamptz NOT NULL DEFAULT now()
      )`);
    await this.run('calls index', `
      CREATE INDEX IF NOT EXISTS "idx_special_call_request"
        ON "special_request_calls" ("requestId", "createdAt")`);
  }
}
