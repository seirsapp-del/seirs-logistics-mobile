import { Module, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver } from './driver.entity';
import { TripStop } from './trip-stop.entity';
import { DriverTrip } from './driver-trip.entity';
import { DriverStatusBroadcast } from './driver-status-broadcast.entity';
import { DriverSubscription } from './driver-subscription.entity';
import { DriverLevelChange } from './driver-level-change.entity';
import { DriverVehicleChange } from './driver-vehicle-change.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Wallet } from '../payments/wallet.entity';
import { DriverEarning } from '../earnings/driver-earning.entity';
import { TrackingModule } from '../tracking/tracking.module';
import { FraudModule } from '../fraud/fraud.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import { FeesModule } from '../fees/fees.module';
import { AdminDriverDocumentsController } from './admin-driver-documents.controller';
import { KycDocument } from '../kyc/kyc-document.entity';

@Module({
  imports: [
    // KycDocument is registered here as well as in the global KycModule.
    // DriversService injects its repository directly for the driver-only
    // queries (the queue list, the vehicle sync), and relying on a global
    // re-export for that would turn a provider-resolution mistake into a
    // boot crash rather than a compile error.
    TypeOrmModule.forFeature([Driver, DriverTrip, TripStop, DriverStatusBroadcast, DriverSubscription, DriverLevelChange, DriverVehicleChange, Delivery, Wallet, DriverEarning, KycDocument]),
    TrackingModule,
    FraudModule,
    NotificationsModule,
    FeesModule,
  ],
  controllers: [DriversController, AdminDriverDocumentsController],
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
    /**
     * Why a driver's status is what it is. Added 2026-08-28: the
     * rejection reason was emailed and never stored, so nobody could
     * answer a rider asking why they were turned down. Self-heal rather
     * than a migration file, matching the rest of this module.
     */
    /**
     * driver_documents, the KYC review queue (2026-08-31).
     *
     * synchronize is off in production, so a new entity does NOT get a
     * table on deploy. Created here with the same self-heal pattern the
     * rest of this module uses, rather than a migration file nobody runs.
     */
    try {
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "driver_documents" (
          "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "driver_id"       uuid NOT NULL REFERENCES "drivers"("id") ON DELETE CASCADE,
          "docId"           varchar NOT NULL,
          "url"             varchar NOT NULL,
          "status"          varchar(20) NOT NULL DEFAULT 'submitted',
          "rejectionReason" text NULL,
          "reviewed_by_id"  uuid NULL,
          "reviewedAt"      timestamptz NULL,
          "version"         integer NOT NULL DEFAULT 1,
          "expiresAt"       date NULL,
          "createdAt"       timestamptz NOT NULL DEFAULT now(),
          "updatedAt"       timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.ds.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "driver_documents_driver_doc"
           ON "driver_documents" ("driver_id", "docId")`,
      );
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "driver_documents_status_created"
           ON "driver_documents" ("status", "createdAt")`,
      );
      await this.ds.query(
        `ALTER TABLE "driver_documents" ADD COLUMN IF NOT EXISTS "expiresAt" date NULL`,
      );
      // Warn-once bookkeeping for the daily expiry notice (2026-09-02).
      await this.ds.query(
        `ALTER TABLE "driver_documents" ADD COLUMN IF NOT EXISTS "expiryWarnedAt" timestamptz NULL`,
      );
    } catch (e: any) {
      console.error(`driver_documents table ensure failed: ${e?.message ?? e}`);
    }

    // Which documents a turned-down vehicle change was turned down over
    // (2026-09-01). Additive and safe to re-run. Nullable on purpose: every
    // decision made before today has no such list, and inventing one would
    // put words in a reviewer's mouth.
    try {
      await this.ds.query(
        `ALTER TABLE "driver_vehicle_changes" ADD COLUMN IF NOT EXISTS "rejectedItems" text NULL`,
      );
    } catch (e: any) {
      console.error(`vehicle-change rejectedItems self-heal failed: ${e?.message ?? e}`);
    }

    try {
      await this.ds.query(`
        ALTER TABLE "drivers"
          ADD COLUMN IF NOT EXISTS "statusReason" text NULL,
          ADD COLUMN IF NOT EXISTS "statusChangedByUserId" uuid NULL,
          ADD COLUMN IF NOT EXISTS "statusChangedAt" timestamptz NULL
      `);
    } catch (e: any) {
      console.error(`drivers status-reason self-heal failed: ${e?.message ?? e}`);
    }

    /*
     * The vehicle-document backfill moved to KycModule on 2026-09-02,
     * along with the table it wrote into. Keeping a second copy here
     * would have inserted into driver_documents, which nothing reads
     * any more.
     */

    this.driversService.notificationsService = this.notificationsService;

    // Value levels (2026-08-22): additive migrations, safe to re-run.
    try {
      await this.ds.query(`
        ALTER TABLE "drivers"
          ADD COLUMN IF NOT EXISTS "valueLevel" integer NOT NULL DEFAULT 1,
          ADD COLUMN IF NOT EXISTS "corridorDestLat" numeric(10,7) NULL,
          ADD COLUMN IF NOT EXISTS "corridorDestLng" numeric(10,7) NULL,
          ADD COLUMN IF NOT EXISTS "corridorLabel" varchar(120) NULL,
          ADD COLUMN IF NOT EXISTS "corridorExpiresAt" timestamptz NULL,
          /* Standing interstate preference (2026-08-31). Defaults true so
             every existing rider keeps exactly the work they had; this is
             a switch to opt OUT of, not one to discover before earning.
             maxTripKm is the rider's OWN ceiling, distinct from the
             vehicle's maxRouteKm on the rate card. */
          ADD COLUMN IF NOT EXISTS "acceptsInterstate" boolean NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "maxTripKm" integer NULL,
          /* When they say they work (2026-09-02). Null means never set,
             which must keep every job they already had. */
          ADD COLUMN IF NOT EXISTS "workingHours" jsonb NULL
      `);
      await this.ds.query(`
        ALTER TABLE "driver_trips"
          ADD COLUMN IF NOT EXISTS "acceptsPassengers" boolean NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS "seatsTotal" integer NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "seatsBooked" integer NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS "acceptsPackages" boolean NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "pickupMode" varchar(12) NOT NULL DEFAULT 'along_route',
          ADD COLUMN IF NOT EXISTS "pickupAddress" varchar(255) NULL,
          ADD COLUMN IF NOT EXISTS "pickupLat" numeric(10,7) NULL,
          ADD COLUMN IF NOT EXISTS "pickupLng" numeric(10,7) NULL,
          ADD COLUMN IF NOT EXISTS "routeKm" numeric(8,1) NULL
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

      // Vehicle ownership + self-serve vehicle change (2026-08-25).
      // Additive, safe to re-run. Existing riders default to 'self',
      // which is what the platform silently assumed about all of them
      // until now: the declaration is only meaningful once a rider has
      // actually been asked, so `vehicleOwnerConsentAt IS NULL` is the
      // marker for "never asked", not "answered no".
      await this.ds.query(`
        ALTER TABLE "drivers"
          ADD COLUMN IF NOT EXISTS "vehicleOwnership" varchar(16) NOT NULL DEFAULT 'self',
          ADD COLUMN IF NOT EXISTS "vehicleOwnerName" varchar(120) NULL,
          ADD COLUMN IF NOT EXISTS "vehicleOwnerPhone" varchar(24) NULL,
          ADD COLUMN IF NOT EXISTS "vehicleOwnerRelationship" varchar(24) NULL,
          ADD COLUMN IF NOT EXISTS "vehicleOwnerConsentUrl" varchar(500) NULL,
          ADD COLUMN IF NOT EXISTS "vehicleOwnerIdUrl" varchar(500) NULL,
          ADD COLUMN IF NOT EXISTS "vehicleOwnerSignatureName" varchar(120) NULL,
          ADD COLUMN IF NOT EXISTS "vehicleOwnerConsentAt" timestamptz NULL
      `);
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "driver_vehicle_changes" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "driverId" uuid NOT NULL,
          "status" varchar(12) NOT NULL DEFAULT 'pending',
          "vehicleType" varchar(24) NOT NULL,
          "vehiclePlate" varchar(16) NULL,
          "make" varchar(64) NULL,
          "model" varchar(64) NULL,
          "year" varchar(8) NULL,
          "color" varchar(32) NULL,
          "photoExteriorUrl" varchar(500) NULL,
          "photoInteriorUrl" varchar(500) NULL,
          "photoPlateUrl" varchar(500) NULL,
          "ownershipProofUrl" varchar(500) NULL,
          "insuranceCertUrl" varchar(500) NULL,
          "ownership" varchar(16) NOT NULL DEFAULT 'self',
          "ownerName" varchar(120) NULL,
          "ownerPhone" varchar(24) NULL,
          "ownerRelationship" varchar(24) NULL,
          "ownerConsentUrl" varchar(500) NULL,
          "ownerIdUrl" varchar(500) NULL,
          "ownerSignatureName" varchar(120) NULL,
          "ownerConsentAt" timestamptz NULL,
          "ticketId" uuid NULL,
          "reason" text NULL,
          "decidedByAdminId" uuid NULL,
          "decidedAt" timestamptz NULL,
          "decisionNote" text NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_dvc_driver" ON "driver_vehicle_changes" ("driverId")
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_dvc_status" ON "driver_vehicle_changes" ("status")
      `);
      /**
       * Destination coordinates on a declared trip.
       *
       * Without these the server could only resolve a destination
       * through a hardcoded twelve-city list, so a trip to anywhere
       * else declared successfully and could never be booked. Production
       * runs with synchronize off, so the columns have to be added here
       * or the entity has fields Postgres does not (2026-08-27).
       */
      await this.ds.query(`
        ALTER TABLE "driver_trips"
          ADD COLUMN IF NOT EXISTS "destLat" double precision NULL,
          ADD COLUMN IF NOT EXISTS "destLng" double precision NULL,
          ADD COLUMN IF NOT EXISTS "destAddress" varchar(240) NULL
      `);

      /**
       * Trip stops. synchronize is off in production, so a new table has
       * to be created here or the first declaration after deploy throws
       * on an object that does not exist.
       */
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "trip_stops" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "trip_id" uuid NOT NULL REFERENCES "driver_trips"("id") ON DELETE CASCADE,
          "sequence" integer NOT NULL,
          "city" varchar(120) NOT NULL,
          "address" varchar(400) NOT NULL,
          "latitude" numeric(10,7) NOT NULL,
          "longitude" numeric(10,7) NOT NULL,
          "description" varchar(300),
          "km_from_origin" numeric(8,2) NOT NULL DEFAULT 0,
          "arrived_at" TIMESTAMP WITH TIME ZONE,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
      `);
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "trip_stops_trip_seq_idx" ON "trip_stops" ("trip_id", "sequence")`,
      );
    } catch (e) {
      // A failed migration must not stop boot; the entity sync path
      // covers dev, and the next boot retries.
      // eslint-disable-next-line no-console
      console.error('drivers level migration skipped:', (e as any)?.message ?? e);
    }
  }
}
