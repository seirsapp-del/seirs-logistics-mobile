import { Logger, Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { SupportModule } from '../support/support.module';
import { TypeOrmModule, InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { PricingService } from './pricing.service';
import { RouteDistanceService } from './route-distance.service';
import { Delivery } from './delivery.entity';
import { DeliveryEvent } from './delivery-event.entity';
import { MatchingModule } from '../matching/matching.module';
import { TrackingModule } from '../tracking/tracking.module';
import { MatchingService } from '../matching/matching.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { FallbackModule } from '../fallback/fallback.module';
import { FallbackService } from '../fallback/fallback.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { FxModule } from '../fx/fx.module';
import { DriversModule } from '../drivers/drivers.module';
import { DriversService } from '../drivers/drivers.service';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { User } from '../users/user.entity';
import { ChatModule } from '../chat/chat.module';
import { RoutingModule } from '../routing/routing.module';
import { ChatService } from '../chat/chat.service';
import { StoreDropoff } from '../partner-store/store-dropoff.entity';
import { FeesModule } from '../fees/fees.module';
import { MapsModule } from '../maps/maps.module';
import { PricingModule } from '../pricing/pricing.module';
import { FeesService } from '../fees/fees.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery, DeliveryEvent, User, StoreDropoff]),
    FeesModule,
    SupportModule,
    MapsModule,
    PricingModule,
    MatchingModule,
    TrackingModule,
    forwardRef(() => PaymentsModule),
    FallbackModule,
    FxModule,
    forwardRef(() => DriversModule),
    MaintenanceModule,
    LoyaltyModule,
    ChatModule,
    RoutingModule,
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, PricingService, RouteDistanceService],
  /**
   * RouteDistanceService is exported (2026-08-31) so the counter flow can
   * measure a real road route instead of a straight line. It keeps a
   * learned road/straight ratio per zone and a request cache, so sharing
   * the one instance is the point: a second copy would relearn and
   * recache the same journeys.
   */
  exports: [DeliveriesService, PricingService, RouteDistanceService],
})
export class DeliveriesModule implements OnModuleInit {
  private readonly logger = new Logger(DeliveriesModule.name);

  constructor(
    private deliveriesService:    DeliveriesService,
    private matchingService:      MatchingService,
    private trackingGateway:      TrackingGateway,
    private paymentsService:      PaymentsService,
    private fallbackService:      FallbackService,
    private notificationsService: NotificationsService,
    private mailService:          MailService,
    private driversService:       DriversService,
    private loyaltyService:       LoyaltyService,
    @InjectRepository(User)          private usersRepo:          Repository<User>,
    @InjectRepository(DeliveryEvent) private deliveryEventsRepo: Repository<DeliveryEvent>,
    @InjectRepository(StoreDropoff)  private storeDropoffsRepo:  Repository<StoreDropoff>,
    private feesService:          FeesService,
    private chatService:          ChatService,
    @InjectDataSource()           private readonly ds: DataSource,
  ) {}

  async onModuleInit() {
    this.deliveriesService.matchingService      = this.matchingService;
    this.deliveriesService.trackingGateway      = this.trackingGateway;
    this.deliveriesService.paymentsService      = this.paymentsService;
    this.deliveriesService.fallbackService      = this.fallbackService;
    this.deliveriesService.notificationsService = this.notificationsService;
    this.deliveriesService.mailService          = this.mailService;
    this.deliveriesService.driversService       = this.driversService;
    this.deliveriesService.loyaltyService       = this.loyaltyService;
    this.deliveriesService.usersRepoRef         = this.usersRepo;
    this.deliveriesService.chatService          = this.chatService;
    this.deliveriesService.deliveryEventsRepo   = this.deliveryEventsRepo;
    this.deliveriesService.storeDropoffsRepo    = this.storeDropoffsRepo;
    this.deliveriesService.feesServiceRef       = this.feesService;
    // Post-payment dispatch: the webhook confirms escrow inside
    // PaymentsService, which then needs to kick matching over here.
    (this.paymentsService as any).deliveriesServiceRef = this.deliveriesService;
    (this.deliveriesService as any).paymentsServiceRef = this.paymentsService;

    // Give NotificationsService a reference to the gateway for WS delivery
    this.notificationsService.trackingGateway = this.trackingGateway;

    // Self-heal: create delivery_events + its index if missing. Matches
    // the pattern in ChatModule so the app keeps working without a
    // manual SYNC_DB=true toggle on Railway.
    try {
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "delivery_events" (
          "id"           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
          "deliveryId"   uuid        NOT NULL REFERENCES "deliveries" ("id") ON DELETE CASCADE,
          "type"         varchar(32) NOT NULL,
          "actorRole"    varchar(16) NOT NULL,
          "actorUserId"  uuid        NULL,
          "description"  text        NULL,
          "lat"          numeric(9,6) NULL,
          "lng"          numeric(9,6) NULL,
          "meta"         jsonb        NULL,
          "createdAt"    timestamptz  NOT NULL DEFAULT NOW()
        )
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "delivery_events_delivery_created_idx"
          ON "delivery_events" ("deliveryId", "createdAt")
      `);
      // Messaging-system columns (2026-08-09): customer instructions for
      // the driver + the admin chat-reopen override for the PII TTL.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "deliveryInstructions" varchar(500) NULL
      `);
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "chatReopenedUntil" timestamptz NULL
      `);
      // Driver-initiated cancellations (founder 2026-08-23): the audit
      // trail behind the daily allowance and the fraud view.
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "driver_cancellations" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "deliveryId" uuid NOT NULL,
          "driverId" uuid NOT NULL,
          "reason" varchar(30) NOT NULL,
          "note" text NULL,
          "stage" varchar(20) NOT NULL,
          "kind" varchar(10) NOT NULL DEFAULT 'package',
          "createdAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_dc_driver_day" ON "driver_cancellations" ("driverId", "createdAt")
      `);
      // Per-stop verification codes for multi-drop runs (2026-08-09).
      await this.ds.query(`
        ALTER TABLE "delivery_stops"
          ADD COLUMN IF NOT EXISTS "stopCode" varchar(12) NULL
      `);
      // Per-leg road km on runs (2026-08-22): measured at booking, shown
      // on the admin delivery page.
      await this.ds.query(`
        ALTER TABLE "delivery_stops"
          ADD COLUMN IF NOT EXISTS "legKm" numeric(8,2) NULL
      `);

      // Seats held by a Travel Buddy booking, so an abandoned unpaid one
      // can be released instead of holding the seat for ever.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "seatCount" integer NULL
      `);
      // Paid-dispatch gate (2026-08-16): dispatch waits for money.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "paymentHeldAt" timestamptz NULL
      `);
      // Multi-package rebuild (2026-08-16): each stop is one package with
      // its own photo set, description, category, weight, public tracking
      // code and attributed price. Partial unique index keeps package
      // codes collision-safe without blocking legacy NULL rows.
      await this.ds.query(`
        ALTER TABLE "delivery_stops"
          ADD COLUMN IF NOT EXISTS "packagePhotoUrls" jsonb NULL,
          ADD COLUMN IF NOT EXISTS "packageDescription" text NULL,
          ADD COLUMN IF NOT EXISTS "categoryCode" varchar(40) NULL,
          ADD COLUMN IF NOT EXISTS "weightKg" numeric(8,2) NULL,
          ADD COLUMN IF NOT EXISTS "packageTrackingCode" varchar(16) NULL,
          ADD COLUMN IF NOT EXISTS "packagePriceNgn" numeric(12,2) NULL
      `);
      // Sender drops at a counter, driver collects there (2026-08-16).
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "pickupStoreId" uuid NULL
      `);
      // What the partner counters earned on this run (2026-08-16).
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "partnerHandlingNgn" numeric(12,2) NOT NULL DEFAULT 0
      `);
      // Packages of a cancelled run need their own terminal state, so the
      // stop status enum gains 'cancelled' (2026-08-17).
      await this.ds.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_stops_status_enum')
             AND NOT EXISTS (
               SELECT 1 FROM pg_enum e
                 JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'delivery_stops_status_enum' AND e.enumlabel = 'cancelled'
             ) THEN
            ALTER TYPE "delivery_stops_status_enum" ADD VALUE 'cancelled';
          END IF;
        END $$;
      `);
      // Runs cancelled before the stop sweep existed still list their
      // packages as pending on the sender's screen. Bring them in line.
      await this.ds.query(`
        UPDATE "delivery_stops" s
           SET status = 'cancelled'
          FROM "deliveries" d
         WHERE d.id = s."deliveryId"
           AND d.status = 'cancelled'
           AND s.status NOT IN ('delivered', 'failed', 'cancelled')
      `);
      // Loyalty reversal guard for refunded runs (2026-08-16).
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "loyaltyClawedBackAt" timestamptz NULL
      `);
      // Per-package destination partner store (2026-08-16).
      await this.ds.query(`
        ALTER TABLE "delivery_stops"
          ADD COLUMN IF NOT EXISTS "destinationStoreId" uuid NULL
      `);
      // Customer-parity per-package fields (2026-08-16).
      await this.ds.query(`
        ALTER TABLE "delivery_stops"
          ADD COLUMN IF NOT EXISTS "receiverFirstName" varchar(60) NULL,
          ADD COLUMN IF NOT EXISTS "receiverLastName" varchar(60) NULL,
          ADD COLUMN IF NOT EXISTS "declaredValueNgn" numeric(12,2) NULL,
          ADD COLUMN IF NOT EXISTS "fallbackPref" varchar(12) NULL,
          ADD COLUMN IF NOT EXISTS "fallbackNeighbourName" varchar(80) NULL
      `);
      await this.ds.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "delivery_stops_pkg_code_uniq"
          ON "delivery_stops" ("packageTrackingCode")
          WHERE "packageTrackingCode" IS NOT NULL
      `);
      // High-value handoff policy (2026-08-10): sender-declared value
      // drives the mandatory signature gate on DELIVERED.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "declaredValueNgn" numeric(12,2) NULL
      `);
      // Receiver system (2026-08-11): sender-named receiver + prefs.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "receiverFirstName" varchar(60) NULL,
          ADD COLUMN IF NOT EXISTS "receiverLastName" varchar(60) NULL,
          ADD COLUMN IF NOT EXISTS "receiverPhone" varchar(32) NULL,
          ADD COLUMN IF NOT EXISTS "disputedAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "disputeReason" varchar(40) NULL,
          ADD COLUMN IF NOT EXISTS "disputePhotoUrl" text NULL,
          ADD COLUMN IF NOT EXISTS "driverAcceptedLat" double precision NULL,
          ADD COLUMN IF NOT EXISTS "driverAcceptedLng" double precision NULL,
          ADD COLUMN IF NOT EXISTS "driverAcceptedDistanceKm" double precision NULL,
          ADD COLUMN IF NOT EXISTS "receiverVerifyPref" varchar(12) NULL,
          ADD COLUMN IF NOT EXISTS "fallbackPref" varchar(12) NULL,
          ADD COLUMN IF NOT EXISTS "fallbackNeighbourName" varchar(80) NULL
      `);
      // Failed-delivery flow (2026-08-11): arrival window + redirect fee.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "arrivalIssueAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "senderResponseBy" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "arrivalResolution" varchar(12) NULL,
          ADD COLUMN IF NOT EXISTS "redirectFeeNgn" numeric(12,2) NULL,

          ADD COLUMN IF NOT EXISTS "redirectFeePaidAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "redirectFeePayer" varchar(10) NULL,
          ADD COLUMN IF NOT EXISTS "driverFailedTripNgn" numeric(12,2) NULL,
          ADD COLUMN IF NOT EXISTS "disputeEscalatedAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "returnRequestedAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "returnStatus" varchar(12) NULL,
          ADD COLUMN IF NOT EXISTS "returnQuoteNgn" numeric(12,2) NULL,
          ADD COLUMN IF NOT EXISTS "returnQuoteKm" double precision NULL,
          ADD COLUMN IF NOT EXISTS "returnDecidedAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "returnDecidedBy" uuid NULL,
          ADD COLUMN IF NOT EXISTS "returnDecisionNote" text NULL,
          ADD COLUMN IF NOT EXISTS "returnPaidAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "disposedAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "disposalPhotoUrl" text NULL,
          ADD COLUMN IF NOT EXISTS "disposalNote" text NULL,
          ADD COLUMN IF NOT EXISTS "termsAcceptedAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "kind" varchar(10) NOT NULL DEFAULT 'package',
          ADD COLUMN IF NOT EXISTS "tripId" uuid NULL,
          ADD COLUMN IF NOT EXISTS "tripOfferedAt" timestamptz NULL,
          /* Which states the run connects, and which zone tier fired
             (2026-08-31). Derived at pricing time since the state-aware
             tier shipped and thrown away every time, so a 15 to 40
             percent surcharge could never be reconciled, reported on, or
             even named to the sender who paid it. */
          ADD COLUMN IF NOT EXISTS "pickupStateCode" varchar(2) NULL,
          ADD COLUMN IF NOT EXISTS "dropoffStateCode" varchar(2) NULL,
          ADD COLUMN IF NOT EXISTS "zoneTier" varchar(30) NULL

      `);
      /* Admin filters interstate work by these two, and the ops board
         groups by corridor. Both are range scans over a small set. */
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_deliveries_states"
          ON "deliveries" ("pickupStateCode", "dropoffStateCode")
      `);

      // Mid-delivery address change (2026-08-21): support-decided, paid
      // before it applies.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "addressChangeRequestedAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "addressChangeStatus" varchar(12) NULL,
          ADD COLUMN IF NOT EXISTS "addressChangeNewAddress" text NULL,
          ADD COLUMN IF NOT EXISTS "addressChangeNewLat" double precision NULL,
          ADD COLUMN IF NOT EXISTS "addressChangeNewLng" double precision NULL,
          ADD COLUMN IF NOT EXISTS "addressChangeQuoteNgn" numeric(12,2) NULL,
          ADD COLUMN IF NOT EXISTS "addressChangeQuoteKm" double precision NULL,
          ADD COLUMN IF NOT EXISTS "addressChangeDecidedAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "addressChangeDecidedBy" uuid NULL,
          ADD COLUMN IF NOT EXISTS "addressChangeDecisionNote" text NULL,
          ADD COLUMN IF NOT EXISTS "addressChangePaidAt" timestamptz NULL
      `);
      // Who actually accepted the package (2026-08-12). The proof photo
      // answers "was it delivered"; this answers "to whom", which is the
      // question an actual dispute turns on.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "receivedByRelation" varchar(12) NULL,
          ADD COLUMN IF NOT EXISTS "receivedByName" varchar(80) NULL
      `);
      // Booking inputs the customer app always sent but the API silently
      // dropped (2026-08-13): the package photos it forces the sender to
      // take, the payment method, and the cash-on-delivery amount.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "packagePhotos" jsonb NULL,
          ADD COLUMN IF NOT EXISTS "paymentMethod" varchar(16) NULL,
          ADD COLUMN IF NOT EXISTS "codAmountNgn" numeric(12,2) NULL
      `);
      // Night ops (2026-08-11): real scheduled dispatch + night fee.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "scheduledFor" timestamptz NULL
      `);
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "nightFeeNgn" numeric(12,2) NULL
      `);
      // Road-distance quoting (2026-08-15): which source measured the fare's
      // distance, and the traffic-aware duration when Google answered.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "quotedDistanceSource" varchar(16) NULL,
          ADD COLUMN IF NOT EXISTS "quotedDurationMin" numeric(6,1) NULL
      `);
      // Customer cancellation (2026-08-14): the fee that was quoted in
      // the app but never priced, stored, or charged.
      await this.ds.query(`
        ALTER TABLE "deliveries"
          ADD COLUMN IF NOT EXISTS "cancellationFeeNgn" numeric(12,2) NULL,
          ADD COLUMN IF NOT EXISTS "cancelledAt" timestamptz NULL,
          ADD COLUMN IF NOT EXISTS "cancellationReason" varchar(200) NULL
      `);
      // Partial unique index: every non-null stop code must be unique
      // platform-wide (recipient N can only ever claim stop N). Legacy
      // null rows are exempt.
      await this.ds.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "delivery_stops_stopcode_uniq"
          ON "delivery_stops" ("stopCode") WHERE "stopCode" IS NOT NULL
      `);
      this.logger.log('delivery_events schema self-heal complete');
    } catch (e: any) {
      this.logger.warn(`delivery_events self-heal skipped: ${e?.message ?? e}`);
    }
  }
}
