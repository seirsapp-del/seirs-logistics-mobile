import { BadRequestException, Body, Controller, Get, Param, Post, Patch, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { User } from '../users/user.entity';
import { DeliveryStatus } from './delivery.entity';

@UseGuards(JwtAuthGuard)
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  // POST /api/v1/deliveries/quote — get price before booking
  @Post('quote')
  getQuote(@Body() dto: CreateDeliveryDto) {
    return this.deliveriesService.getQuote(dto);
  }

  // POST /api/v1/deliveries — create delivery
  @Post()
  create(@Body() dto: CreateDeliveryDto, @CurrentUser() user: User) {
    return this.deliveriesService.create(dto, user);
  }

  // GET /api/v1/deliveries?page=1&limit=20 — customer's delivery history
  @Get()
  myDeliveries(
    @CurrentUser() user: User,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.deliveriesService.findByCustomer(user.id, Math.max(1, page), Math.min(100, Math.max(1, limit)));
  }

  // GET /api/v1/deliveries/driver — active deliveries assigned to this driver
  @Get('driver')
  driverDeliveries(@CurrentUser() user: User) {
    return this.deliveriesService.findActiveByDriverUserId(user.id);
  }

  // GET /api/v1/deliveries/track/:code — public tracking by code (no login required)
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

  // PATCH /api/v1/deliveries/:id/status
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: DeliveryStatus; proofPhotoUrl?: string },
  ) {
    return this.deliveriesService.updateStatus(id, body.status, body.proofPhotoUrl);
  }
}
