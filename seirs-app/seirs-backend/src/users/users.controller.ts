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

  // DELETE /api/v1/users/me  { password }
  // NDPR right to erasure — soft-delete with 30-day grace; reactivated
  // automatically if user logs in within window.
  @Delete('me')
  deleteAccount(
    @CurrentUser() user: User,
    @Body() body: { password: string },
  ) {
    return this.usersService.deleteAccount(user.id, body.password);
  }
}
