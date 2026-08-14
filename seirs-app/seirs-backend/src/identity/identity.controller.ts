import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { IdentityService } from './identity.service';
import { HandoffMethod, HandoffStage } from './handoff-record.entity';

// All identity endpoints require auth - partner staff, drivers, and
// admin reviewing chain-of-custody records all sign in.
@UseGuards(JwtAuthGuard)
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  // GET /api/v1/identity/lookup/:code
  // Partner/driver scans the recipient's SEIRS QR - server returns the
  // expected name so the staff member can prompt the recipient to speak it.
  // Rate-limited per caller: this maps a SEIRS ID to a real person's name
  // and photo, so unthrottled it is a name-harvesting endpoint.
  @Get('lookup/:code')
  lookup(@Param('code') code: string, @CurrentUser() user: User) {
    return this.identityService.lookupBySeirsId(code, user.id);
  }

  // POST /api/v1/identity/handoff/:deliveryId/issue-otp
  // Triggered by partner/driver when starting the recipient handoff -
  // emails a 6-digit OTP to the customer. Rate-limited to 3/min per recipient.
  @Post('handoff/:deliveryId/issue-otp')
  issueOtp(
    @Param('deliveryId') deliveryId: string,
    @CurrentUser() user: User,
    @Body() body: { recipientUserId?: string },
  ) {
    // No recipientUserId = receiver has no account; code goes to the
    // sender's email to forward (founder 2026-08-11).
    return this.identityService.issueHandoffOtp(deliveryId, body?.recipientUserId, user.id);
  }

  // POST /api/v1/identity/handoff/:deliveryId/verify
  // Accepts either physical-ID + OTP path, or SEIRS-ID + typed-name path.
  // On success returns the handoff record id for attaching to delivery audit.
  @Post('handoff/:deliveryId/verify')
  verify(
    @Param('deliveryId') deliveryId: string,
    @CurrentUser() user: User,
    @Body() body: {
      stage:        HandoffStage;
      method:       HandoffMethod;
      fromUserId?:  string;
      idType?:      string;
      idNumber?:    string;
      otp?:         string;
      idPhotoUrl?:  string;
      seirsCode?:   string;
      typedName?:   string;
      proofPhotoUrl?: string;
    },
  ) {
    return this.identityService.verifyHandoff({ deliveryId, ...body }, user.id);
  }

  // GET /api/v1/identity/handoff/:deliveryId/chain
  // Full chain-of-custody for a delivery - used by admin disputes view
  // and the customer trip-detail screen. Parties to the delivery and
  // admins only: the records carry typed legal names, government ID type
  // and last four, and doorstep photos.
  @Get('handoff/:deliveryId/chain')
  chain(@Param('deliveryId') deliveryId: string, @CurrentUser() user: User) {
    return this.identityService.getHandoffChain(deliveryId, user.id);
  }
}
