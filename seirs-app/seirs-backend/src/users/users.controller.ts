import { Body, Controller, Delete, Get, Patch, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from './user.entity';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // GET /api/v1/users/me
  @Get('me')
  getProfile(@CurrentUser() user: User) {
    return this.usersService.findById(user.id);
  }

  // PATCH /api/v1/users/me
  @Patch('me')
  updateProfile(
    @CurrentUser() user: User,
    @Body() body: { name?: string; phone?: string; profilePhoto?: string },
  ) {
    return this.usersService.updateProfile(user.id, body);
  }

  // DELETE /api/v1/users/me  { password, reason? }
  // NDPR right to erasure — soft-delete with 30-day grace; reactivated
  // automatically if user logs in within window. Daily archive cron
  // hard-deletes after the grace expires.
  @Delete('me')
  deleteAccount(
    @CurrentUser() user: User,
    @Body() body: { password: string; reason?: string },
  ) {
    return this.usersService.deleteAccount(user.id, body.password, body.reason);
  }

  // GET /api/v1/users/me/export
  // NDPR Article 24 — right to data portability. Returns a JSON
  // bundle of profile + deliveries + payments + handoff records etc.
  @Get('me/export')
  exportData(@CurrentUser() user: User) {
    return this.usersService.exportUserData(user.id);
  }

  // GET /api/v1/users/me/notification-prefs
  @Get('me/notification-prefs')
  async getNotificationPrefs(@CurrentUser() user: User) {
    const u = await this.usersService.findById(user.id);
    return { prefs: u.notificationPrefs ?? {} };
  }

  // PUT /api/v1/users/me/notification-prefs  { prefs: { key: boolean } }
  @Patch('me/notification-prefs')
  updateNotificationPrefs(
    @CurrentUser() user: User,
    @Body() body: { prefs: Record<string, boolean> },
  ) {
    return this.usersService.updateNotificationPrefs(user.id, body.prefs);
  }
}
