import { Logger, Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TravelBuddyController } from './travel-buddy.controller';
import { TravelBuddyService } from './travel-buddy.service';
import { SeatBooking } from './seat-booking.entity';
import { SeatBookingEvent } from './seat-booking-event.entity';
import { DriverTrip } from '../drivers/driver-trip.entity';
import { TripStop } from '../drivers/trip-stop.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { FeesModule } from '../fees/fees.module';
import { PricingModule } from '../pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { DriversModule } from '../drivers/drivers.module';
import { DriversService } from '../drivers/drivers.service';
import { ParcelRequest } from './parcel-request.entity';
import { RouteAlert } from './route-alert.entity';
import { ParcelRequestsService } from './parcel-requests.service';
import { ParcelRequestsController } from './parcel-requests.controller';
import { User } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SeatBooking, SeatBookingEvent, DriverTrip, TripStop, Delivery, ParcelRequest, RouteAlert, User]),
    FeesModule,
    PricingModule,
    NotificationsModule,
    /**
     * Imported for INITIALISATION ORDER, not for a provider.
     *
     * seat_bookings carries foreign keys to trip_stops, and trip_stops
     * is itself created by DriversModule.onModuleInit because production
     * runs with schema sync off. Nest initialises a module's imports
     * first, so naming DriversModule here guarantees the table this one
     * points at exists before it tries to point at it. Without the edge
     * the first boot on a fresh database can lose the race, log the
     * failure and only heal on the next restart.
     */
    DriversModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => DeliveriesModule),
  ],
  controllers: [TravelBuddyController, ParcelRequestsController],
  providers: [TravelBuddyService, ParcelRequestsService],
  exports: [TravelBuddyService, ParcelRequestsService],
})
export class TravelBuddyModule implements OnModuleInit {
  private readonly logger = new Logger(TravelBuddyModule.name);

  constructor(
    private readonly travelBuddy: TravelBuddyService,
    private readonly payments:    PaymentsService,
    private readonly deliveries:  DeliveriesService,
    private readonly drivers:     DriversService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async onModuleInit() {
    // Refunds go out through the existing Flutterwave escrow path.
    this.travelBuddy.paymentsServiceRef = this.payments;

    /**
     * Declaring a trip is the only moment a new corridor appears, and
     * DriversService owns that moment. Wired the same lazy way as every
     * other cross-module reference here, because this module already
     * imports DriversModule and the reverse would be a cycle.
     */
    (this.drivers as any).travelBuddyRef = this.travelBuddy;

    /**
     * parcel_requests: the negotiation that happens BEFORE any money
     * moves (2026-08-31). Created here rather than in a migration file,
     * matching how every other module in this codebase adds its tables,
     * because production runs with schema sync off.
     */
    try {
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "parcel_requests" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "tripId" uuid NOT NULL,
          "senderUserId" uuid NOT NULL,
          "status" varchar(20) NOT NULL DEFAULT 'requested',
          "pickupAddress" text NOT NULL,
          "pickupLat" numeric(10,7) NOT NULL,
          "pickupLng" numeric(10,7) NOT NULL,
          "dropoffAddress" text NOT NULL,
          "dropoffLat" numeric(10,7) NOT NULL,
          "dropoffLng" numeric(10,7) NOT NULL,
          "weightKg" numeric(10,2) NOT NULL DEFAULT 0,
          "categoryCode" varchar(40) NULL,
          "packageDescription" text NULL,
          "declaredValueNgn" numeric(12,2) NULL,
          "preferredStoreId" uuid NULL,
          "senderInstructions" text NULL,
          "quotedNgn" numeric(12,2) NULL,
          "quotedKm" numeric(10,2) NULL,
          "counterDropAddress" text NULL,
          "counterDropLat" numeric(10,7) NULL,
          "counterDropLng" numeric(10,7) NULL,
          "counterNote" text NULL,
          "counterQuotedNgn" numeric(12,2) NULL,
          "counterQuotedKm" numeric(10,2) NULL,
          "counteredAt" timestamptz NULL,
          "answeredAt" timestamptz NULL,
          "declineReason" text NULL,
          "deliveryId" uuid NULL,
          "expiresAt" timestamptz NOT NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_parcel_requests_trip"
          ON "parcel_requests" ("tripId", "status")
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_parcel_requests_sender"
          ON "parcel_requests" ("senderUserId", "status")
      `);
      // The expiry cron scans on this.
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_parcel_requests_expiry"
          ON "parcel_requests" ("status", "expiresAt")
      `);
    } catch (e: any) {
      this.logger.error(`parcel_requests self-heal failed: ${e?.message ?? e}`);
    }

    /**
     * route_alerts: corridors people asked for and nobody runs yet
     * (founder 2026-09-04). Created here for the same reason as every
     * other table in this module, production runs with schema sync off.
     */
    try {
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "route_alerts" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" uuid NOT NULL,
          "fromCity" varchar(120) NOT NULL,
          "toCity" varchar(120) NOT NULL,
          "notifiedAt" timestamptz NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await this.ds.query(`
        CREATE INDEX IF NOT EXISTS "idx_route_alerts_corridor"
          ON "route_alerts" ("fromCity", "toCity")
      `);
      // One standing alert per person per corridor: asking twice is the
      // same request, not two.
      await this.ds.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "idx_route_alerts_user_route"
          ON "route_alerts" ("userId", "fromCity", "toCity")
      `);
    } catch (e: any) {
      this.logger.error(`route_alerts self-heal failed: ${e?.message ?? e}`);
    }

    /**
     * The payment hook.
     *
     * DeliveriesService.kickDispatch runs the moment the webhook
     * confirms escrow. A seat booking's delivery must NOT go back
     * through the generic trip-offer path there: the driver already
     * agreed to this exact segment at this exact fare before any money
     * moved, so asking them a second time would let them walk away from
     * an agreement the passenger has now paid against. Lazily wired,
     * the same way deliveries and drivers already wire each other, so
     * neither module has to import the other.
     */
    (this.deliveries as any).seatBookingsService = this.travelBuddy;

    /**
     * And the other direction: a seat's delivery moves through
     * DeliveriesService.updateStatus, never through a direct UPDATE.
     * That method is where escrow is released to the rider on DELIVERED
     * and where the timeline both parties read is written, so a status
     * written behind its back would end a journey and strand the fare.
     */
    this.travelBuddy.deliveriesServiceRef = this.deliveries;

    /**
     * synchronize is FALSE in production, so a new table has to be
     * created here or the first request after deploy throws on an object
     * that does not exist. Same pattern as trip_stops in DriversModule.
     * Everything below is additive and safe to re-run.
     */
    try {
      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "seat_bookings" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "trip_id" uuid NOT NULL REFERENCES "driver_trips"("id") ON DELETE CASCADE,
          "passenger_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "board_stop_id" uuid NOT NULL REFERENCES "trip_stops"("id") ON DELETE CASCADE,
          "alight_stop_id" uuid NOT NULL REFERENCES "trip_stops"("id") ON DELETE CASCADE,
          "board_sequence" integer NOT NULL,
          "alight_sequence" integer NOT NULL,
          "seats" integer NOT NULL DEFAULT 1,
          "segment_km" numeric(8,2) NOT NULL DEFAULT 0,
          "price_ngn" numeric(12,2) NOT NULL DEFAULT 0,
          "driver_earnings_ngn" numeric(12,2) NOT NULL DEFAULT 0,
          "luggage" varchar(12) NULL,
          "status" varchar(20) NOT NULL DEFAULT 'requested',
          "passenger_note" varchar(300) NULL,
          "driver_note" varchar(300) NULL,
          "delivery_id" uuid NULL,
          "requested_at" TIMESTAMP WITH TIME ZONE NULL,
          "accepted_at" TIMESTAMP WITH TIME ZONE NULL,
          "declined_at" TIMESTAMP WITH TIME ZONE NULL,
          "payment_due_at" TIMESTAMP WITH TIME ZONE NULL,
          "paid_at" TIMESTAMP WITH TIME ZONE NULL,
          "boarded_at" TIMESTAMP WITH TIME ZONE NULL,
          "board_lat" numeric(10,7) NULL,
          "board_lng" numeric(10,7) NULL,
          "dropped_at" TIMESTAMP WITH TIME ZONE NULL,
          "drop_lat" numeric(10,7) NULL,
          "drop_lng" numeric(10,7) NULL,
          "drop_distance_m" numeric(10,2) NULL,
          "drop_off_geofence" boolean NOT NULL DEFAULT false,
          "drop_confirmed_at" TIMESTAMP WITH TIME ZONE NULL,
          "drop_disputed_at" TIMESTAMP WITH TIME ZONE NULL,
          "drop_review_reason" varchar(200) NULL,
          "arrived_at" TIMESTAMP WITH TIME ZONE NULL,
          "arrived_lat" numeric(10,7) NULL,
          "arrived_lng" numeric(10,7) NULL,
          "no_show_deadline_at" TIMESTAMP WITH TIME ZONE NULL,
          "no_show_at" TIMESTAMP WITH TIME ZONE NULL,
          "departed_lat" numeric(10,7) NULL,
          "departed_lng" numeric(10,7) NULL,
          "contact_attempts" integer NOT NULL DEFAULT 0,
          "cancelled_at" TIMESTAMP WITH TIME ZONE NULL,
          "cancellation_reason" varchar(200) NULL,
          "refund_ngn" numeric(12,2) NULL,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
      `);

      /**
       * The capacity query is the hot path on this table: for one trip
       * it scans live bookings and compares two sequence columns against
       * each segment. This index is exactly that shape.
       */
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "seat_bookings_trip_status_idx" ON "seat_bookings" ("trip_id", "status")`,
      );
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "seat_bookings_trip_range_idx" ON "seat_bookings" ("trip_id", "board_sequence", "alight_sequence")`,
      );
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "seat_bookings_passenger_idx" ON "seat_bookings" ("passenger_id", "status")`,
      );
      /**
       * One booking per delivery. The webhook looks a booking up BY
       * delivery id to decide whether the money that just landed holds a
       * seat, so two bookings sharing one delivery would make that
       * lookup ambiguous and silently hold the wrong seat.
       */
      await this.ds.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "seat_bookings_delivery_uniq" ON "seat_bookings" ("delivery_id") WHERE "delivery_id" IS NOT NULL`,
      );

      await this.ds.query(`
        CREATE TABLE IF NOT EXISTS "seat_booking_events" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "booking_id" uuid NOT NULL REFERENCES "seat_bookings"("id") ON DELETE CASCADE,
          "type" varchar(32) NOT NULL,
          "actor_role" varchar(16) NOT NULL,
          "actor_user_id" uuid NULL,
          "lat" numeric(10,7) NULL,
          "lng" numeric(10,7) NULL,
          "note" text NULL,
          "meta" jsonb NULL,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
      `);
      await this.ds.query(
        `CREATE INDEX IF NOT EXISTS "seat_booking_events_booking_idx" ON "seat_booking_events" ("booking_id", "created_at")`,
      );

      this.logger.log('seat_bookings schema self-heal complete');
    } catch (e: any) {
      // A failed migration must not stop boot; the next boot retries.
      this.logger.error(`seat_bookings self-heal FAILED: ${e?.message ?? e}`);
    }
  }
}
