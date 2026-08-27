import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TravelBuddyService } from './travel-buddy.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

/**
 * Travel Buddy seats, sold by the SEGMENT and booked in the order that
 * keeps money last: request, then agree, then pay.
 *
 * Every route here proves the ACTOR against the RESOURCE, not just that
 * a valid token was presented. JwtAuthGuard establishes who is calling
 * and nothing more: a driver may only act on requests against their own
 * trip, and a passenger may only act on their own booking. Those checks
 * live in the service so no route can quietly skip one.
 */
@UseGuards(JwtAuthGuard)
@Controller('travel-buddy')
export class TravelBuddyController {
  constructor(private readonly travelBuddy: TravelBuddyService) {}

  // ── Browsing and quoting ─────────────────────────────────────────────

  // GET /api/v1/travel-buddy/trips/:tripId/availability
  // Seats free on EVERY segment, not one number for the whole route.
  @Get('trips/:tripId/availability')
  availability(@Param('tripId') tripId: string) {
    return this.travelBuddy.tripAvailability(tripId);
  }

  // GET /api/v1/travel-buddy/trips/:tripId/quote?boardStopId=&alightStopId=&seats=&luggage=
  @Get('trips/:tripId/quote')
  quote(
    @Param('tripId') tripId: string,
    @Query('boardStopId')  boardStopId: string,
    @Query('alightStopId') alightStopId: string,
    @Query('seats')   seats?: string,
    @Query('luggage') luggage?: string,
  ) {
    return this.travelBuddy.quoteSegment(tripId, boardStopId, alightStopId, Number(seats ?? 1), luggage);
  }

  // ── Passenger ────────────────────────────────────────────────────────

  // POST /api/v1/travel-buddy/trips/:tripId/requests
  // Asks for a segment. NOTHING is charged: a decline costs nothing and
  // leaves no refund to chase.
  @Post('trips/:tripId/requests')
  request(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Body() body: { boardStopId?: string; alightStopId?: string; seats?: number; luggage?: string; note?: string },
  ) {
    return this.travelBuddy.requestSegment(user.id, tripId, body ?? {});
  }

  // POST /api/v1/travel-buddy/bookings/:id/pay
  // Mints the delivery row the fare is charged against, then the client
  // pays it through POST /payments/initiate. The seat is NOT held until
  // the webhook confirms the money.
  @Post('bookings/:id/pay')
  pay(@CurrentUser() user: User, @Param('id') id: string) {
    return this.travelBuddy.startPayment(user.id, id);
  }

  @Post('bookings/:id/cancel')
  cancel(@CurrentUser() user: User, @Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.travelBuddy.cancelByPassenger(user.id, id, body ?? {});
  }

  // The passenger's half of the anti-abuse controls on a drop.
  @Post('bookings/:id/confirm-drop')
  confirmDrop(@CurrentUser() user: User, @Param('id') id: string) {
    return this.travelBuddy.confirmDrop(user.id, id);
  }

  @Post('bookings/:id/dispute-drop')
  disputeDrop(@CurrentUser() user: User, @Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.travelBuddy.disputeDrop(user.id, id, body ?? {});
  }

  @Get('bookings/me')
  myBookings(@CurrentUser() user: User) {
    return this.travelBuddy.listForPassenger(user.id);
  }

  // ── Driver ───────────────────────────────────────────────────────────

  @Get('trips/:tripId/bookings')
  tripBookings(@CurrentUser() user: User, @Param('tripId') tripId: string) {
    return this.travelBuddy.listForDriver(user.id, tripId);
  }

  @Post('bookings/:id/accept')
  accept(@CurrentUser() user: User, @Param('id') id: string, @Body() body?: { note?: string }) {
    return this.travelBuddy.acceptRequest(user.id, id, body ?? {});
  }

  @Post('bookings/:id/decline')
  decline(@CurrentUser() user: User, @Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.travelBuddy.declineRequest(user.id, id, body ?? {});
  }

  // POST /api/v1/travel-buddy/bookings/:id/arrived { lat, lng }
  // Starts the no-show clock and records the rider's position, which is
  // the evidence a forfeited fare will be argued over.
  @Post('bookings/:id/arrived')
  arrived(@CurrentUser() user: User, @Param('id') id: string, @Body() body?: { lat?: number; lng?: number }) {
    return this.travelBuddy.markArrivedAtStop(user.id, id, body ?? {});
  }

  // Push or in-trip chat only. There is no SMS channel.
  @Post('bookings/:id/contact-attempt')
  contactAttempt(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body?: { channel?: string; note?: string },
  ) {
    return this.travelBuddy.recordContactAttempt(user.id, id, body ?? {});
  }

  @Post('bookings/:id/no-show')
  noShow(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body?: { lat?: number; lng?: number; note?: string },
  ) {
    return this.travelBuddy.markNoShow(user.id, id, body ?? {});
  }

  @Post('bookings/:id/board')
  board(@CurrentUser() user: User, @Param('id') id: string, @Body() body?: { lat?: number; lng?: number }) {
    return this.travelBuddy.markBoarded(user.id, id, body ?? {});
  }

  // Frees the seat across every segment after the alight stop.
  @Post('bookings/:id/drop')
  drop(@CurrentUser() user: User, @Param('id') id: string, @Body() body?: { lat?: number; lng?: number }) {
    return this.travelBuddy.markDropped(user.id, id, body ?? {});
  }

  // ── Shared ───────────────────────────────────────────────────────────

  @Get('bookings/:id')
  detail(@CurrentUser() user: User, @Param('id') id: string) {
    return this.travelBuddy.detail(id, user.id);
  }

  // The full trail: arrival, every contact attempt, departure, the drop
  // and its distance from the declared stop. Either party may read their
  // own booking's history, which is what makes a dispute checkable.
  @Get('bookings/:id/evidence')
  evidence(@CurrentUser() user: User, @Param('id') id: string) {
    return this.travelBuddy.evidence(id, user.id);
  }

  // ── Ops ──────────────────────────────────────────────────────────────

  // Drops nobody confirmed, drops outside the geofence, and drops the
  // passenger says never happened. A queue, never a block on a rider
  // mid-journey.
  @UseGuards(AdminGuard)
  @Get('admin/drop-review')
  dropReview(@Query('limit') limit?: string) {
    return this.travelBuddy.dropReviewQueue(Number(limit ?? 50));
  }
}
