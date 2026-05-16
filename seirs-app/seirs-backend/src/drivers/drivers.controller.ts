import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { DriverStatusBroadcastType } from './driver-status-broadcast.entity';
import { RedisService } from '../tracking/redis.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('drivers')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly redisService: RedisService,
  ) {}

  // GET /api/v1/drivers/me — driver profile + today/week earnings + wallet balance.
  // The driver home screen renders all three numbers; without enrichment the
  // home dashboard rendered ₦0 for everything (see ECOSYSTEM_AUDIT_2026-05-10).
  @Get('me')
  getProfile(@CurrentUser() user: User) {
    return this.driversService.findByUserIdWithEarnings(user.id);
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

  // GET /api/v1/drivers/demand-zones
  // Returns up to 20 demand-density zones in a ~25km radius around the
  // driver's last known position. Intensity scaled 0.0-1.0 from order count.
  @Get('demand-zones')
  demandZones(@CurrentUser() user: User) {
    return this.driversService.getDemandZones(user.id);
  }

  // GET /api/v1/drivers/me/deletion-readiness
  // Spec V8 — pre-flight blockers for self-delete (active deliveries +
  // wallet balance must clear first). Used by the driver app's delete-
  // account screen to disable the delete button until the user resolves
  // each blocker.
  @Get('me/deletion-readiness')
  deletionReadiness(@CurrentUser() user: User) {
    return this.driversService.getDeletionReadiness(user.id);
  }

  // Spec V8 §2.11 — Last Order (wind-down) toggle. One-way until
  // full sign-off; service throws LAST_ORDER_LOCKED on disable attempt.
  @Patch('last-order-mode')
  setLastOrderMode(@CurrentUser() user: User, @Body() body: { enabled: boolean }) {
    return this.driversService.setLastOrderMode(user.id, !!body.enabled);
  }

  // Spec V8 §2.18 — Interstate trip declarations.
  @Post('interstate-trips')
  declareInterstateTrip(@CurrentUser() user: User, @Body() body: {
    fromCity: string; toCity: string; departAt: string; spareCapacityKg: number;
  }) {
    return this.driversService.declareInterstateTrip(user.id, body);
  }

  @Get('interstate-trips/me')
  myInterstateTrips(@CurrentUser() user: User) {
    return this.driversService.listMyInterstateTrips(user.id);
  }

  @Patch('interstate-trips/:id/cancel')
  cancelInterstateTrip(@CurrentUser() user: User, @Param('id') id: string) {
    return this.driversService.cancelInterstateTrip(user.id, id);
  }

  // Spec V8 §2.14 — three-tap status broadcast. Persisted + WS-fanned
  // to admin + active customer (when deliveryId supplied).
  @Post('status-broadcasts')
  recordStatusBroadcast(@CurrentUser() user: User, @Body() body: {
    type: DriverStatusBroadcastType; deliveryId?: string; lat?: number; lng?: number;
  }) {
    return this.driversService.recordStatusBroadcast(user.id, body);
  }

  // Spec V8 §2.9 — yearly earnings aggregate for FIRS filing.
  // Optional ?year=2026 to scope to one year; default returns all years.
  @Get('me/tax-summary')
  taxSummary(@CurrentUser() user: User, @Query('year') year?: string) {
    const y = year ? Number(year) : undefined;
    return this.driversService.getTaxSummary(user.id, Number.isFinite(y) ? y : undefined);
  }
}
