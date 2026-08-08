import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { UserVerificationService } from './user-verification.service';
import { VerificationStatus } from './user-verification.entity';
import { RejectIdentityDto, ApproveIdentityDto, RevokeIdentityDto } from './dto/review-verification.dto';

/**
 * Admin review queue for identity verifications.
 * See docs/identity-policy.md. SLA is 24 hours to 3 business days,
 * FIFO by default.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/identity-verifications')
export class AdminUserVerificationController {
  constructor(private readonly svc: UserVerificationService) {}

  // GET /api/v1/admin/identity-verifications?status=submitted
  @Get()
  list(@Query('status') status?: string) {
    const s = (status ?? 'submitted') as VerificationStatus;
    return this.svc.adminList(s);
  }

  // GET /api/v1/admin/identity-verifications/:id
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.adminGetOne(id);
  }

  // POST /api/v1/admin/identity-verifications/:id/approve
  @Post(':id/approve')
  approve(
    @CurrentUser() admin: User,
    @Param('id')  id: string,
    @Body()       body: ApproveIdentityDto,
  ) {
    return this.svc.approve(id, admin.id, body.adminNote);
  }

  // POST /api/v1/admin/identity-verifications/:id/reject
  @Post(':id/reject')
  reject(
    @CurrentUser() admin: User,
    @Param('id')  id: string,
    @Body()       body: RejectIdentityDto,
  ) {
    return this.svc.reject(id, admin.id, body.reason, body.adminNote);
  }

  // POST /api/v1/admin/identity-verifications/:id/revoke
  // Invalidate a previously-approved verification (fake doc, expired,
  // policy change, etc.). Flips user back to unverified immediately.
  @Post(':id/revoke')
  revoke(
    @CurrentUser() admin: User,
    @Param('id')  id: string,
    @Body()       body: RevokeIdentityDto,
  ) {
    return this.svc.revoke(id, admin.id, body.reason, body.adminNote);
  }
}
