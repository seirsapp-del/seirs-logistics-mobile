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

@Module({
  imports: [
    TypeOrmModule.forFeature([SeatBooking, SeatBookingEvent, DriverTrip, TripStop, Delivery]),
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
  controllers: [TravelBuddyController],
  providers: [TravelBuddyService],
  exports: [TravelBuddyService],
})
export class TravelBuddyModule implements OnModuleInit {
  private readonly logger = new Logger(TravelBuddyModule.name);

  constructor(
    private readonly travelBuddy: TravelBuddyService,
    private readonly payments:    PaymentsService,
    private readonly deliveries:  DeliveriesService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async onModuleInit() {
    // Refunds go out through the existing Flutterwave escrow path.
    this.travelBuddy.paymentsServiceRef = this.payments;

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
