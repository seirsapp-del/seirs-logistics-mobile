import {
  Body, Controller, Get, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { SosService } from './sos.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser }  from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('sos')
export class SosController {
  constructor(private readonly svc: SosService) {}

  // POST /api/v1/sos/trigger  { deliveryId?, lat?, lng?, note? }
  @Post('trigger')
  trigger(
    @CurrentUser() user: User,
    @Body() body: { deliveryId?: string; lat?: number; lng?: number; note?: string },
  ) {
    return this.svc.trigger(user, body ?? {});
  }

  // PATCH /api/v1/sos/:id/cancel - user cancels their own alert
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.cancel(id, user);
  }

  // PATCH /api/v1/sos/:id/resolve - admin marks alert as handled
  @Patch(':id/resolve')
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body?: { resolutionNote?: string },
  ) {
    return this.svc.resolve(id, user, body?.resolutionNote);
  }

  // PATCH /api/v1/sos/:id/note - the raiser says what is happening, on an
  // alert that has already been sent. Detail must never gate the alarm.
  @Patch(':id/note')
  addNote(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { note: string },
  ) {
    return this.svc.addNote(id, user, body?.note);
  }

  // GET /api/v1/sos/active - admin dashboard feed
  @Get('active')
  listActive(@CurrentUser() user: User) {
    return this.svc.listActive(user);
  }
}
