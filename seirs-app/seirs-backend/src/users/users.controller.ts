import { Body, Controller, Delete, Get, Headers, Ip, Patch, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from './user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';

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
  // Rate-limited to 3 changes per minute. legitimate users edit profile
  // rarely; higher rates are almost always abuse (bulk-rename bots or
  // impersonation attempts). Cool-down + name-content rules enforced in
  // service layer via UpdateProfileDto.
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Patch('me')
  updateProfile(
    @CurrentUser() user: User,
    @Body() body: UpdateProfileDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.usersService.updateProfile(user.id, body, {
      actorRole: 'self',
      ipAddress: ip,
      userAgent: userAgent ?? null,
    });
  }

  // GET /api/v1/users/me/profile-changes
  // NDPR + user self-service: see your own history of profile edits.
  // Reassuring: users can see exactly what/when they (or admin) changed.
  @Get('me/profile-changes')
  getProfileAudit(@CurrentUser() user: User) {
    return this.usersService.getProfileAudit(user.id);
  }

  // DELETE /api/v1/users/me  { password, reason? }
  // NDPR right to erasure. soft-delete with 30-day grace; reactivated
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
  // NDPR Article 24. right to data portability. Returns a JSON
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
