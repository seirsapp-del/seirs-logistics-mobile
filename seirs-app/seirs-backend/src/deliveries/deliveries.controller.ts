import { BadRequestException, Body, Controller, Get, Param, Post, Patch, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { MaintenanceGuard } from '../maintenance/maintenance.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { User } from '../users/user.entity';
import { DeliveryStatus } from './delivery.entity';

@UseGuards(JwtAuthGuard)
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  // POST /api/v1/deliveries/quote - get price before booking
  // Maintenance-guarded so we don't show prices for trips that can't be booked.
  @UseGuards(MaintenanceGuard)
  @Post('quote')
  getQuote(@Body() dto: CreateDeliveryDto) {
    return this.deliveriesService.getQuote(dto);
  }

  // POST /api/v1/deliveries - create delivery
  @UseGuards(MaintenanceGuard)
  @Post()
  create(@Body() dto: CreateDeliveryDto, @CurrentUser() user: User) {
    return this.deliveriesService.create(dto, user);
  }

  // GET /api/v1/deliveries?page=1&limit=20 - customer's delivery history
  @Get()
  myDeliveries(
    @CurrentUser() user: User,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.deliveriesService.findByCustomer(
      user.id, Math.max(1, page), Math.min(100, Math.max(1, limit)), search,
    );
  }

  // GET /api/v1/deliveries/frequent-addresses
  // Returns the customer's most-used pickup + dropoff addresses in the
  // last 90 days, ranked by frequency. Powers the "suggested addresses"
  // section on the Saved Addresses screen.
  @Get('frequent-addresses')
  frequentAddresses(@CurrentUser() user: User) {
    return this.deliveriesService.frequentAddresses(user.id);
  }

  // GET /api/v1/deliveries/pulse
  // Aggregate community activity for social-proof "everyone is using it"
  // display on the Rewards tab. Public counts, no PII. Cached in-memory
  // for 5 min so a mass refresh doesn't hammer the DB.
  @Get('pulse')
  communityPulse() {
    return this.deliveriesService.communityPulse();
  }

  // GET /api/v1/deliveries/featured-promotion
  // Returns the admin-set featured redemption for the Rewards tab, or
  // null if none active. Admin edits via the platform_config table
  // (key: featured_promotion). Cheap read; no auth beyond JWT.
  @Get('featured-promotion')
  featuredPromotion() {
    return this.deliveriesService.getFeaturedPromotion();
  }

  // GET /api/v1/deliveries/driver - active deliveries assigned to this driver
  @Get('driver')
  driverDeliveries(@CurrentUser() user: User) {
    return this.deliveriesService.findActiveByDriverUserId(user.id);
  }

  // GET /api/v1/deliveries/available?lat=&lng=&radiusKm= - pending unassigned
  // jobs the driver could claim. Sorted by distance when lat/lng given.
  @Get('available')
  availableJobs(
    @CurrentUser() user: any,
    @Query('lat')      lat?:      string,
    @Query('lng')      lng?:      string,
    @Query('radiusKm', new DefaultValuePipe(25),  ParseIntPipe) radiusKm: number = 25,
    @Query('limit',    new DefaultValuePipe(30),  ParseIntPipe) limit:    number = 30,
  ) {
    const numLat = lat != null ? Number(lat) : undefined;
    const numLng = lng != null ? Number(lng) : undefined;
    return this.deliveriesService.findAvailable(numLat, numLng, radiusKm, limit, user?.id);
  }

  /**
   * GET /api/v1/deliveries/track/:code - public tracking by code (no login).
   *
   * 20 a minute per IP, not the global 300.
   *
   * A tracking code is a bearer token for a whole journey: this payload
   * carries the pickup address in full, the destination, the recipient's
   * first name, the driver's name and plate, and the driver's live position.
   * Guessing a code is not the worry, secureCode(8) is 32^8, but 300 tries a
   * minute is a generous budget for somebody working through a leaked list,
   * and nothing about honest use needs more than a handful.
   *
   * A real person refreshing a parcel page hits this every 30 seconds. Twenty
   * leaves room for several tabs and a shaky connection retrying, and still
   * makes a scan stand out.
   */
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Get('track/:code')
  track(@Param('code') code: string) {
    return this.deliveriesService.findByTracking(code);
  }

  // POST /api/v1/deliveries/:id/rate  { rating: 1-5, comment?: string }
  @Post(':id/rate')
  rate(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { rating: number; comment?: string },
  ) {
    const rating = Math.round(Number(body.rating));
    if (!rating || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5.');
    }
    return this.deliveriesService.rateDelivery(id, user.id, rating, body.comment?.slice(0, 500));
  }

  // POST /api/v1/deliveries/:id/redirect-to-store  { storeId }
  // Mid-flight rescue: customer moves the drop-off to a partner store
  // while the package is en route ("recipient not home"). Customer of
  // the delivery only; store must be approved + accepting.
  @Post(':id/redirect-to-store')
  redirectToStore(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { storeId: string },
  ) {
    if (!body?.storeId) throw new BadRequestException('storeId is required.');
    return this.deliveriesService.redirectToStore(id, user.id, body.storeId);
  }

  // POST /api/v1/deliveries/:id/redirect-fee/pay
  // Settles the failed-delivery redirect fee. Returns a Flutterwave
  // hosted-page URL; on confirmation the store identity + collection
  // code unmask on the tracking payload and the store may release.
  @Post(':id/redirect-fee/pay')
  payRedirectFee(@Param('id') id: string, @CurrentUser() user: User) {
    return this.deliveriesService.startRedirectFeePayment(id, user.id);
  }

  // POST /api/v1/deliveries/:id/address-change/decide  (admin only)
  // Support approves or rejects. Guarded here rather than in
  // AdminController because the logic lives on DeliveriesService and
  // AdminController has no handle on it.
  @UseGuards(AdminGuard)
  @Post(':id/address-change/decide')
  decideAddressChange(
    @Param('id') id: string,
    @CurrentUser() admin: User,
    @Body() body: { approve: boolean; note?: string; overrideQuoteNgn?: number },
  ) {
    return this.deliveriesService.decideAddressChange(id, admin.id, body);
  }

  // POST /api/v1/deliveries/track/:code/collection-payment
  // Public: whoever holds the tracking link can settle what is owed on a
  // package sitting at a counter. This is what makes "pay to reveal"
  // workable for a receiver who has no SEIRS account.
  @Public()
  @Post('track/:code/collection-payment')
  payCollection(
    @Param('code') code: string,
    @Body() body: { email?: string; name?: string; phone?: string },
  ) {
    return this.deliveriesService.startCollectionPayment(code, body ?? {});
  }

  // POST /api/v1/deliveries/:id/dispose  { photoUrl, note? }
  // Rider records that a perishable was disposed of. Photo required:
  // Terms 8.4 promises evidence is retained, and without one this is
  // just an assertion that food was destroyed.
  @Post(':id/dispose')
  recordDisposal(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { photoUrl?: string; note?: string },
  ) {
    return this.deliveriesService.recordDisposal(id, user.id, body ?? {});
  }

  // GET /api/v1/deliveries/:id/refund-preview?percent=50  (admin only)
  // Shows which pocket a refund comes out of before anyone commits to
  // it. Read-only: nothing moves until the POST below.
  @UseGuards(AdminGuard)
  @Get(':id/refund-preview')
  refundPreview(@Param('id') id: string, @Query('percent') percent: string) {
    return this.deliveriesService.previewRefund(id, Number(percent));
  }

  // POST /api/v1/deliveries/:id/refund  { percent, note? }  (admin only)
  @UseGuards(AdminGuard)
  @Post(':id/refund')
  issueRefund(
    @Param('id') id: string,
    @CurrentUser() admin: User,
    @Body() body: { percent: number; note?: string },
  ) {
    return this.deliveriesService.issueRefund(id, admin.id, body);
  }

  // GET /api/v1/deliveries/:id/return-quote
  // What it costs to bring this package home from wherever it is now.
  // The destination is the delivery's own pickup address and there is
  // deliberately no parameter to change it.
  @Get(':id/return-quote')
  getReturnQuote(@Param('id') id: string, @CurrentUser() user: User) {
    return this.deliveriesService.getReturnQuote(id, user.id);
  }

  // POST /api/v1/deliveries/:id/return
  // At a counter this is self-service. On a bike it opens a support
  // ticket, because turning a rider around is not a sender's call.
  @Post(':id/return')
  requestReturn(
    @Param('id') id: string,
    @CurrentUser() user: User,
    // What the app showed the sender. Echoed back so a price that
    // moved between quote and confirm re-asks instead of committing.
    @Body() body?: { acceptedTotalNgn?: number },
  ) {
    return this.deliveriesService.requestReturn(id, user.id, body?.acceptedTotalNgn);
  }

  // POST /api/v1/deliveries/:id/return/pay
  @Post(':id/return/pay')
  payReturn(@Param('id') id: string, @CurrentUser() user: User) {
    return this.deliveriesService.startReturnPayment(id, user.id);
  }

  // POST /api/v1/deliveries/:id/return/decide  (admin only)
  @UseGuards(AdminGuard)
  @Post(':id/return/decide')
  decideReturn(
    @Param('id') id: string,
    @CurrentUser() admin: User,
    @Body() body: { approve: boolean; note?: string; overrideQuoteNgn?: number },
  ) {
    return this.deliveriesService.decideReturn(id, admin.id, body);
  }

  // POST /api/v1/deliveries/:id/address-change  { address, lat?, lng? }
  // The sender gave the wrong address and the rider is already carrying
  // the package. This only opens a request and quotes it: support has to
  // approve, and the sender has to pay, before anything moves.
  @Post(':id/address-change')
  requestAddressChange(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { address: string; lat?: number; lng?: number },
  ) {
    if (!body?.address) throw new BadRequestException('address is required.');
    return this.deliveriesService.requestAddressChange(id, user.id, body);
  }

  // GET /api/v1/deliveries/:id/address-change
  @Get(':id/address-change')
  getAddressChange(@Param('id') id: string, @CurrentUser() user: User) {
    return this.deliveriesService.getAddressChange(id, user.id);
  }

  // POST /api/v1/deliveries/:id/address-change/pay
  // Only payable once support has approved. Applying the new address
  // happens in the payments webhook, so the rider is redirected by money
  // that actually arrived rather than by a client saying it did.
  @Post(':id/address-change/pay')
  payAddressChange(@Param('id') id: string, @CurrentUser() user: User) {
    return this.deliveriesService.startAddressChangePayment(id, user.id);
  }

  // POST /api/v1/deliveries/:id/arrival-issue
  // Driver arrived, nobody available. Opens the sender's 5-minute
  // response window and fires the sender notification.
  @Post(':id/arrival-issue')
  arrivalIssue(@Param('id') id: string, @CurrentUser() user: User) {
    return this.deliveriesService.reportArrivalIssue(id, user.id);
  }

  // POST /api/v1/deliveries/:id/arrival-response  { action }
  // Sender's answer inside the window: wait | neighbour | gate | store.
  // High-value packages refuse gate/neighbour server-side.
  @Post(':id/arrival-response')
  arrivalResponse(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { action: string },
  ) {
    if (!body?.action) throw new BadRequestException('action is required.');
    return this.deliveriesService.respondToArrivalIssue(id, user.id, body.action);
  }

  // POST /api/v1/deliveries/:id/scan-verify  { scannedCode }
  // Gap 5 evidence trail: the driver's QR scan at hand-off is verified
  // server-side and logged to delivery_events (SCAN type) so disputes
  // have scan evidence. Returns { match } either way; the client's UI
  // already showed its own local verdict, this is the audit copy.
  @Post(':id/scan-verify')
  scanVerify(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { scannedCode: string },
  ) {
    return this.deliveriesService.verifyPackageScan(id, user.id, body?.scannedCode ?? '');
  }

  // PATCH /api/v1/deliveries/:id/status
  //
  // Driver-only progress endpoint. The guard below authenticates but does
  // not authorise, so the actor is passed down and checked against the
  // delivery's assigned driver in the service: this route moves escrow.
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: {
      status: DeliveryStatus;
      proofPhotoUrl?: string;
      // Who actually took the package. Recorded for dispute resolution:
      // "delivered" is a weak answer to "delivered to whom".
      receivedByRelation?: string;
      receivedByName?: string;
    },
  ) {
    return this.deliveriesService.updateStatus(id, body.status, body.proofPhotoUrl, {
      relation: body.receivedByRelation,
      name:     body.receivedByName,
    }, user.id);
  }

  // ── Travel Buddy (founder 2026-08-23) ────────────────────────────────
  // GET /api/v1/deliveries/travel-buddy/trips?from=&to=
  @Get('travel-buddy/trips')
  browseTrips(
    @Query('from') from: string,
    @Query('to') to: string,
    // forPackages=1 narrows to riders carrying freight, for the business
    // app's Cargo Space screen. A trader wanting room for 100 kg of yam
    // must not be shown a car with two seats free.
    @Query('forPackages') forPackages?: string,
  ) {
    return (this.deliveriesService as any).driversService.browseTrips(
      from ?? '', to ?? '', forPackages === '1' || forPackages === 'true',
    );
  }

  // POST /api/v1/deliveries/travel-buddy/trips/:tripId/book { seats, luggage }
  @Post('travel-buddy/trips/:tripId/book')
  bookTripSeats(
    @Param('tripId') tripId: string,
    @CurrentUser() user: any,
    @Body() body: {
      seats?: number; luggage?: string;
      /** The segment this passenger is riding, when they are not taking
       *  the whole trip. Both stops must belong to the trip and be in
       *  order. Omit for an end-to-end booking. */
      boardStopId?: string; alightStopId?: string;
    },
  ) {
    return this.deliveriesService.bookTripSeats(tripId, user, body ?? {});
  }

  // POST /api/v1/deliveries/:id/decline-trip-offer: the declared driver
  // turns a seat booking down; the customer is refunded in full.
  @Post(':id/decline-trip-offer')
  declineTripOffer(@Param('id') id: string, @CurrentUser() user: any) {
    return this.deliveriesService.declineTripOffer(id, user.id);
  }

  // POST /api/v1/deliveries/:id/driver-cancel { reason, note? }
  // Driver backs out of an accepted job. The customer never pays:
  // escrow stays and the booking re-dispatches (founder 2026-08-23).
  @Post(':id/driver-cancel')
  driverCancel(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { reason: string; note?: string },
  ) {
    return this.deliveriesService.driverCancel(id, user.id, String(body?.reason ?? ''), body?.note);
  }

  /**
   * PATCH /api/v1/deliveries/:id - change a booking before paying for it.
   *
   * Only while nothing has been paid and no driver is assigned. The
   * server re-prices every edit through the active rate card and returns
   * the before and after, so the app can show what the change cost
   * before the customer pays.
   */
  @Patch(':id')
  editUnpaid(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: any,
  ) {
    return this.deliveriesService.editUnpaidBooking(id, user.id, body ?? {});
  }

  // POST /api/v1/deliveries/:id/cancel - customer cancels their own booking
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { reason?: string },
  ) {
    return this.deliveriesService.cancelByCustomer(id, user.id, body?.reason);
  }

  // POST /api/v1/deliveries/:id/report-issue - the assigned rider raises a
  // problem with this job (wrong parcel, overweight, sender absent, unsafe)
  // and attaches a photo. Ownership is checked in the service: the token
  // proves who the rider is, not that this delivery is theirs.
  @Post(':id/report-issue')
  reportIssue(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { reason: string; note?: string; photoUrl?: string },
  ) {
    return this.deliveriesService.reportIssue(id, user.id, body);
  }

  // GET /api/v1/deliveries/:id/cancel-quote - what cancelling costs right now
  @Get(':id/cancel-quote')
  cancelQuote(@Param('id') id: string, @CurrentUser() user: User) {
    return this.deliveriesService.getCancellationQuote(id, user.id);
  }

  // GET /api/v1/deliveries/:id - single delivery with driver + breakdown
  // Must come AFTER all literal-segment routes above so they don't get
  // caught by :id.
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.deliveriesService.findByIdForUser(id, user.id);
  }

  // POST /api/v1/deliveries/:id/email-receipt - resend the receipt email
  @Post(':id/email-receipt')
  emailReceipt(@Param('id') id: string, @CurrentUser() user: User) {
    return this.deliveriesService.emailReceipt(id, user.id);
  }

  // POST /api/v1/deliveries/:id/claim - driver picks up an unassigned job
  @Post(':id/claim')
  claim(@Param('id') id: string, @CurrentUser() user: User) {
    return this.deliveriesService.claimByDriver(id, user.id);
  }
}
