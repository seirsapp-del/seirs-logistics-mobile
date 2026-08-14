import { Body, Controller, Get, Post, UseGuards, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { PoolingService } from './pooling.service';

/**
 * Pooling (audit 2026-08-14).
 *
 * Every route here used to take the driverId from the request body or
 * the URL and trust it, behind a guard that only proved the caller was
 * signed in. Any account could read another driver's active pool groups,
 * open groups in their name, or complete their legs. The driver is now
 * always resolved from the authenticated user, and the body/param
 * driverId is gone rather than merely ignored: a field that is accepted
 * and discarded is the next person's bug.
 */
@UseGuards(JwtAuthGuard)
@Controller('pooling')
export class PoolingController {
  constructor(private readonly svc: PoolingService) {}

  // POST /api/v1/pooling/check-fit - would this leg fit my current route?
  @Post('check-fit')
  async checkFit(
    @CurrentUser() user: User,
    @Body() body: {
      newPickupLat: number; newPickupLng: number;
      newDropoffLat: number; newDropoffLng: number;
      newLegEtaMinutes: number;
    },
  ) {
    const driverId = await this.svc.requireOwnDriverId(user.id);
    return this.svc.checkFit({ ...body, driverId });
  }

  // GET /api/v1/pooling/active - my own active pool groups
  @Get('active')
  async active(@CurrentUser() user: User) {
    const driverId = await this.svc.requireOwnDriverId(user.id);
    return this.svc.getActive(driverId);
  }

  @Post('open')
  async open(
    @CurrentUser() user: User,
    @Body() body: {
      deliveryId: string;
      originLat: number; originLng: number;
      terminalLat: number; terminalLng: number;
      etaMinutes: number;
    },
  ) {
    const driverId = await this.svc.requireOwnDriverId(user.id);
    return this.svc.openGroup(
      driverId, body.deliveryId,
      body.originLat, body.originLng,
      body.terminalLat, body.terminalLng,
      body.etaMinutes,
    );
  }

  @Post(':id/complete-leg')
  completeLeg(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { deliveryId: string },
  ) {
    return this.svc.completeLeg(id, body.deliveryId, user.id);
  }
}
