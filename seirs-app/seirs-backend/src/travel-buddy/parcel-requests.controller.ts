import {
  Body, Controller, Delete, Get, Param, Post, UseGuards,
} from '@nestjs/common';
import { ParcelRequestsService } from './parcel-requests.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

/**
 * Negotiating a parcel onto a declared trip, before any money moves.
 *
 *   POST   /parcel-requests/trips/:tripId   sender asks, with their own
 *                                           drop point and instructions
 *   GET    /parcel-requests/mine            what the sender is waiting on
 *   DELETE /parcel-requests/:id             sender withdraws
 *   POST   /parcel-requests/:id/accept-counter   sender takes the
 *                                                driver's alternative
 *
 *   GET    /parcel-requests/trips/:tripId/inbox  the rider's queue
 *   POST   /parcel-requests/:id/accept      rider takes it as asked
 *   POST   /parcel-requests/:id/counter     rider proposes another drop
 *   POST   /parcel-requests/:id/decline     rider says no, costs nobody
 *
 * Nothing here charges a card. Payment happens only once both sides have
 * agreed and a Delivery exists, which is the entire point: a refund on
 * Flutterwave is a second transaction with its own cost, not a
 * reversal.
 */
@UseGuards(JwtAuthGuard)
@Controller('parcel-requests')
export class ParcelRequestsController {
  constructor(private readonly svc: ParcelRequestsService) {}

  @Post('trips/:tripId')
  create(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Body() body: any,
  ) {
    return this.svc.createRequest(user.id, tripId, body ?? {});
  }

  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.svc.listMine(user.id);
  }

  @Delete(':id')
  withdraw(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.withdraw(user.id, id);
  }

  @Post(':id/accept-counter')
  acceptCounter(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.acceptCounter(user.id, id);
  }

  @Get('trips/:tripId/inbox')
  inbox(@CurrentUser() user: User, @Param('tripId') tripId: string) {
    return this.svc.listForTrip(user.id, tripId);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.accept(user.id, id);
  }

  @Post(':id/counter')
  counter(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { dropAddress: string; dropLat: number; dropLng: number; note?: string },
  ) {
    return this.svc.counter(user.id, id, body);
  }

  @Post(':id/decline')
  decline(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.svc.decline(user.id, id, body?.reason);
  }
}
