import { BadRequestException, Body, Controller, Get, Param, Post, Patch, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
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
    @Query('lat')      lat?:      string,
    @Query('lng')      lng?:      string,
    @Query('radiusKm', new DefaultValuePipe(25),  ParseIntPipe) radiusKm: number = 25,
    @Query('limit',    new DefaultValuePipe(30),  ParseIntPipe) limit:    number = 30,
  ) {
    const numLat = lat != null ? Number(lat) : undefined;
    const numLng = lng != null ? Number(lng) : undefined;
    return this.deliveriesService.findAvailable(numLat, numLng, radiusKm, limit);
  }

  // GET /api/v1/deliveries/track/:code - public tracking by code (no login required)
  @Public()
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
