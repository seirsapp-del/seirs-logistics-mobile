import { Logger, Module, OnModuleInit, forwardRef } from '@nestjs/common';
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
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, PricingService, RouteDistanceService],
  exports: [DeliveriesService, PricingService],
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
      // Per-stop verification codes for multi-drop runs (2026-08-09).
      await this.ds.query(`
        ALTER TABLE "delivery_stops"
          ADD COLUMN IF NOT EXISTS "stopCode" varchar(12) NULL
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
          ADD COLUMN IF NOT EXISTS "redirectFeePaidAt" timestamptz NULL
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
