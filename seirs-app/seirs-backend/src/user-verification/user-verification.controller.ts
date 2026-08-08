import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { UserVerificationService } from './user-verification.service';
import { SubmitIdentityDto } from './dto/submit-verification.dto';

/**
 * User-facing identity verification endpoints. Mounted under /users/me
 * so it lives with the rest of the account-management surface.
 */
@UseGuards(JwtAuthGuard)
@Controller('users/me/identity-verification')
export class UserVerificationController {
  constructor(private readonly svc: UserVerificationService) {}

  // POST /api/v1/users/me/identity-verification
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post()
  submit(@CurrentUser() user: User, @Body() dto: SubmitIdentityDto) {
    return this.svc.submit(user.id, dto);
  }

  // GET /api/v1/users/me/identity-verification
  @Get()
  status(@CurrentUser() user: User) {
    return this.svc.myStatus(user.id);
  }

  // DELETE /api/v1/users/me/identity-verification/:id
  @Delete(':id')
  withdraw(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.withdraw(user.id, id);
  }
}
