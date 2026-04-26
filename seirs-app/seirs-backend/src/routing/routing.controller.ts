import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { RoutingService, LatLng } from './routing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('routing')
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  // POST /api/v1/routing/optimize
  // Body: { stops: [{ lat, lng, label? }, ...] }
  @Post('optimize')
  optimize(@Body() body: { stops: LatLng[] }) {
    return this.routingService.optimizeRoute(body.stops ?? []);
  }
}
