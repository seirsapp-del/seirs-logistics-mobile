import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PoolingService } from './pooling.service';

@UseGuards(JwtAuthGuard)
@Controller('pooling')
export class PoolingController {
  constructor(private readonly svc: PoolingService) {}

  // POST /api/v1/pooling/check-fit — internal hook called by matching service
  @Post('check-fit')
  checkFit(@Body() body: any) {
    return this.svc.checkFit(body);
  }

  @Get('driver/:driverId/active')
  active(@Param('driverId') driverId: string) {
    return this.svc.getActive(driverId);
  }

  @Post('open')
  open(@Body() body: { driverId: string; deliveryId: string; originLat: number; originLng: number; terminalLat: number; terminalLng: number; etaMinutes: number }) {
    return this.svc.openGroup(
      body.driverId, body.deliveryId,
      body.originLat, body.originLng,
      body.terminalLat, body.terminalLng,
      body.etaMinutes,
    );
  }

  @Post(':id/complete-leg')
  completeLeg(@Param('id') id: string, @Body() body: { deliveryId: string }) {
    return this.svc.completeLeg(id, body.deliveryId);
  }
}
