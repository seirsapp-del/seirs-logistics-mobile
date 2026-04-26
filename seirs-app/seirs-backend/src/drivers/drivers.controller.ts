import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { DriversService } from './drivers.service';
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

  // GET /api/v1/drivers/me
  @Get('me')
  getProfile(@CurrentUser() user: User) {
    return this.driversService.findByUserId(user.id);
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
}
