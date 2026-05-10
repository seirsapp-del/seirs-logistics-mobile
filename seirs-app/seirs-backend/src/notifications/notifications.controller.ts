import {
  Body, Controller, Get, Patch, Param, Post, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // GET /api/v1/notifications?page=1&limit=20
  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.findByUser(user.id, page, limit);
  }

  // GET /api/v1/notifications/unread-count
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: User) {
    const count = await this.svc.countUnread(user.id);
    return { count };
  }

  // PATCH /api/v1/notifications/:id/read
  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: User) {
    return this.svc.markRead(id, user.id);
  }

  // PATCH /api/v1/notifications/read-all
  @Patch('read-all')
  markAllRead(@CurrentUser() user: User) {
    return this.svc.markAllRead(user.id);
  }

  // POST /api/v1/notifications/register-token  { token: string | null }
  // Stores the device's FCM/Expo push token against the current user so
  // backend NotificationsService can target this device. Pass null to
  // clear (called on logout).
  @Post('register-token')
  async registerToken(
    @CurrentUser() user: User,
    @Body() body: { token: string | null },
  ) {
    await this.svc.registerToken(user.id, body?.token ?? null);
    return { ok: true };
  }
}
