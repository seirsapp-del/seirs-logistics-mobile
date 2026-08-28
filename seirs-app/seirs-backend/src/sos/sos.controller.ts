import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards,
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
  /**
   * GET /api/v1/sos/history?status=&limit=
   *
   * Every alert with what was done about it. Resolving has recorded a
   * note since 2026-08-24 and nothing could read one back, so a resolved
   * alert left the product entirely. For a safety feature that is the
   * wrong shape: the history is what shows a pattern, and it is the only
   * evidence SEIRS responded if an incident is ever disputed.
   */
  @Get('history')
  history(
    @CurrentUser() admin: User,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('deliveryId') deliveryId?: string,
  ) {
    return this.svc.listHistory(admin, {
      status, limit: Number(limit ?? 100), userId, deliveryId,
    });
  }

  @Get('active')
  listActive(@CurrentUser() user: User) {
    return this.svc.listActive(user);
  }
}
