import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MultiDropRoutingService, Stop } from './multi-drop-routing.service';

@UseGuards(JwtAuthGuard)
@Controller('multi-drop-routing')
export class MultiDropRoutingController {
  constructor(private readonly svc: MultiDropRoutingService) {}

  // POST /api/v1/multi-drop-routing/optimize
  @Post('optimize')
  optimize(@Body() body: { pickup: Stop; drops: Stop[] }) {
    return this.svc.optimize(body.pickup, body.drops);
  }

  // POST /api/v1/multi-drop-routing/recompute
  @Post('recompute')
  recompute(@Body() body: { currentLat: number; currentLng: number; remainingStops: Stop[] }) {
    return this.svc.recomputeFromCurrentPosition(body.currentLat, body.currentLng, body.remainingStops);
  }
}
