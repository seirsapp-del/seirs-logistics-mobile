import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { DriverStatusBroadcastType } from './driver-status-broadcast.entity';
import { RedisService } from '../tracking/redis.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

/** Shared shape for the two vehicle-change entry points. */
interface VehicleChangeBody {
  vehicleType?:  string;
  vehiclePlate?: string;
  make?:  string;
  model?: string;
  year?:  string;
  color?: string;
  photoExteriorUrl?:  string;
  photoInteriorUrl?:  string;
  photoPlateUrl?:     string;
  ownershipProofUrl?: string;
  insuranceCertUrl?:  string;
  reason?: string;
  // Third-party ownership. Required when ownership is 'third_party'.
  ownership?:          string;
  ownerName?:          string;
  ownerPhone?:         string;
  ownerRelationship?:  string;
  ownerConsentUrl?:    string;
  ownerIdUrl?:         string;
  ownerSignatureName?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly redisService: RedisService,
  ) {}

  // GET /api/v1/drivers/me - driver profile + today/week earnings + wallet balance.
  // The driver home screen renders all three numbers; without enrichment the
  // home dashboard rendered ₦0 for everything (see ECOSYSTEM_AUDIT_2026-05-10).
  @Get('me')
  getProfile(@CurrentUser() user: User) {
    return this.driversService.findByUserIdWithEarnings(user.id);
  }

  // POST /api/v1/drivers/me/corridor { destLat, destLng, label?, hours? }
  // "I'm heading somewhere": jobs along the way find this courier.
  @Post('me/corridor')
  setCorridor(
    @CurrentUser() user: User,
    @Body() body: { destLat: number; destLng: number; label?: string; hours?: number },
  ) {
    return this.driversService.setCorridor(user.id, {
      destLat: Number(body?.destLat), destLng: Number(body?.destLng),
      label: body?.label, hours: body?.hours,
    });
  }

  @Delete('me/corridor')
  clearCorridor(@CurrentUser() user: User) {
    return this.driversService.clearCorridor(user.id);
  }

  // PATCH /api/v1/drivers/online  { isOnline: true/false }
  @Patch('online')
  toggleOnline(@CurrentUser() user: User, @Body() body: { isOnline: boolean }) {
    return this.driversService.toggleOnline(user.id, body.isOnline);
  }

  // PATCH /api/v1/drivers/location  { lat, lng }
  // Called by the driver app periodically (every 3-5s when on a delivery)
  @Patch('location')
  async updateLocation(
    @CurrentUser() user: User,
    @Body() body: { lat: number; lng: number },
  ) {
    const driver = await this.driversService.findByUserId(user.id);
    if (driver) {
      // Write to both DB (for persistence) and Redis (for real-time speed)
      await Promise.all([
        this.driversService.updateLocation(user.id, body.lat, body.lng),
        this.redisService.setDriverLocation(driver.id, body.lat, body.lng),
      ]);
    }
    return { ok: true };
  }

  // PATCH /api/v1/drivers/me/kyc  { docId, url }
  // Driver app calls this after each successful upload to R2 so the URL is
  // bound to the driver record. docId must match Spec V8 §2.1 names.
  @Patch('me/kyc')
  updateKyc(
    @CurrentUser() user: User,
    @Body() body: { docId: string; url: string },
  ) {
    return this.driversService.updateKycDoc(user.id, body.docId, body.url);
  }

  // ── Driver Premium subscription (Spec V8 §2.13 / D35) ─────────────────────

  @Get('me/subscription')
  getSubscription(@CurrentUser() user: User) {
    return this.driversService.getSubscription(user.id);
  }

  @Post('me/subscription/activate')
  activateSubscription(@CurrentUser() user: User) {
    return this.driversService.activateSubscription(user.id);
  }

  @Post('me/subscription/pause')
  pauseSubscription(@CurrentUser() user: User) {
    return this.driversService.pauseSubscription(user.id);
  }

  @Post('me/subscription/cancel')
  cancelSubscription(@CurrentUser() user: User) {
    return this.driversService.cancelSubscription(user.id);
  }

  // ── Vehicle: live record, ownership declaration, change requests ───────
  //
  // 2026-08-25. Founder asked for "self-serve with admin approval ... just
  // like change bank account", so these mirror the payout-bank routes:
  // a GET that reports the live value AND anything pending, a submit that
  // only ever parks a request, and a withdraw. Nothing here moves the live
  // vehicleType: matching and pricing read it, so only an admin approval
  // may change it.

  // GET /api/v1/drivers/me/vehicle
  @Get('me/vehicle')
  getVehicle(@CurrentUser() user: User) {
    return this.driversService.getVehicle(user.id);
  }

  // POST /api/v1/drivers/me/vehicle-change
  @Post('me/vehicle-change')
  submitVehicleChange(
    @CurrentUser() user: User,
    @Body() body: VehicleChangeBody,
  ) {
    return this.driversService.submitVehicleChange(user.id, body);
  }

  // DELETE /api/v1/drivers/me/vehicle-change - rider pulls it back.
  @Delete('me/vehicle-change')
  withdrawVehicleChange(@CurrentUser() user: User) {
    return this.driversService.withdrawVehicleChange(user.id);
  }

  // PATCH /api/v1/drivers/me/vehicle-ownership
  // Declare whether the rider owns the vehicle, and if not, who does and
  // that they signed off. Initial KYC only: once approved, ownership moves
  // through the change flow like everything else about the vehicle.
  @Patch('me/vehicle-ownership')
  declareVehicleOwnership(
    @CurrentUser() user: User,
    @Body() body: {
      ownership?:          string;
      ownerName?:          string;
      ownerPhone?:         string;
      ownerRelationship?:  string;
      ownerConsentUrl?:    string;
      ownerIdUrl?:         string;
      ownerSignatureName?: string;
    },
  ) {
    return this.driversService.declareVehicleOwnership(user.id, body);
  }

  // PATCH /api/v1/drivers/me/vehicle
  // Kept for driver builds shipped before 2026-08-25, which call this.
  // Forwards to the change flow, so an old build gets a clear list of
  // what is still missing rather than registering an unproven vehicle.
  @Patch('me/vehicle')
  updateVehicle(
    @CurrentUser() user: User,
    @Body() body: VehicleChangeBody,
  ) {
    return this.driversService.updateVehicle(user.id, body);
  }

  // GET /api/v1/drivers/demand-zones
  // Returns up to 20 demand-density zones in a ~25km radius around the
  // driver's last known position. Intensity scaled 0.0-1.0 from order count.
  @Get('demand-zones')
  demandZones(@CurrentUser() user: User) {
    return this.driversService.getDemandZones(user.id);
  }

  // GET /api/v1/drivers/me/deletion-readiness
  // Spec V8 - pre-flight blockers for self-delete (active deliveries +
  // wallet balance must clear first). Used by the driver app's delete-
  // account screen to disable the delete button until the user resolves
  // each blocker.
  @Get('me/deletion-readiness')
  deletionReadiness(@CurrentUser() user: User) {
    return this.driversService.getDeletionReadiness(user.id);
  }

  // Spec V8 §2.11 - Last Order (wind-down) toggle. One-way until
  // full sign-off; service throws LAST_ORDER_LOCKED on disable attempt.
  @Patch('last-order-mode')
  setLastOrderMode(@CurrentUser() user: User, @Body() body: { enabled: boolean }) {
    return this.driversService.setLastOrderMode(user.id, !!body.enabled);
  }

  // Spec V8 §2.18 - Interstate trip declarations.
  @Post('interstate-trips')
  declareInterstateTrip(@CurrentUser() user: User, @Body() body: {
    fromCity: string; toCity: string; departAt: string; spareCapacityKg: number;
  
    acceptsPassengers?: boolean; seatsTotal?: number; acceptsPackages?: boolean;
    pickupMode?: 'fixed' | 'along_route'; pickupAddress?: string;
    pickupLat?: number; pickupLng?: number; routeKm?: number;
  }) {
    return this.driversService.declareInterstateTrip(user.id, body);
  }

  @Get('interstate-trips/me')
  myInterstateTrips(@CurrentUser() user: User) {
    return this.driversService.listMyInterstateTrips(user.id);
  }

  /**
   * GET /api/v1/drivers/interstate-trips/:id/stops
   *
   * The declared route as a line, in travel order. A passenger picks
   * their board and alight stops from this, which is what makes a
   * segment priceable and what fixes the exact place two people are
   * meant to meet.
   */
  @Get('interstate-trips/:id/stops')
  interstateTripStops(@Param('id') id: string) {
    return this.driversService.tripStops(id);
  }

  @Patch('interstate-trips/:id/cancel')
  cancelInterstateTrip(@CurrentUser() user: User, @Param('id') id: string) {
    return this.driversService.cancelInterstateTrip(user.id, id);
  }

  // Spec V8 §2.14 - three-tap status broadcast. Persisted + WS-fanned
  // to admin + active customer (when deliveryId supplied).
  @Post('status-broadcasts')
  recordStatusBroadcast(@CurrentUser() user: User, @Body() body: {
    type: DriverStatusBroadcastType; deliveryId?: string; lat?: number; lng?: number;
  }) {
    return this.driversService.recordStatusBroadcast(user.id, body);
  }

  // Spec V8 §2.9 - yearly earnings aggregate for FIRS filing.
  // Optional ?year=2026 to scope to one year; default returns all years.
  @Get('me/tax-summary')
  taxSummary(@CurrentUser() user: User, @Query('year') year?: string) {
    const y = year ? Number(year) : undefined;
    return this.driversService.getTaxSummary(user.id, Number.isFinite(y) ? y : undefined);
  }

  // GET /api/v1/drivers/me/ratings - real customer ratings on this
  // driver's deliveries (average, star breakdown, recent comments).
  // Replaces the mock ratings screen (production audit 2026-08-10).
  @Get('me/ratings')
  myRatings(@CurrentUser() user: User) {
    return this.driversService.getMyRatings(user.id);
  }
}
