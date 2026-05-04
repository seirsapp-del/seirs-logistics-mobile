import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OfflineSyncService } from './offline-sync.service';

@UseGuards(JwtAuthGuard)
@Controller('offline-sync')
export class OfflineSyncController {
  constructor(private readonly svc: OfflineSyncService) {}

  // POST /api/v1/offline-sync/gps-batch
  // Driver app calls this when network returns. Accepts up to N pings
  // recorded while offline.
  @Post('gps-batch')
  ingest(@CurrentUser() user: any, @Body() body: { pings: any[] }) {
    return this.svc.receiveBatch(user.id, body.pings ?? []);
  }

  @Get('trail/:deliveryId')
  trail(@Param('deliveryId') deliveryId: string) {
    return this.svc.getTrail(deliveryId);
  }

  @Get('driver/:driverId/trail')
  driverTrail(@Param('driverId') driverId: string, @Query('sinceMin') sinceMin?: string) {
    return this.svc.getDriverTrail(driverId, sinceMin ? Number(sinceMin) : 60);
  }
}
