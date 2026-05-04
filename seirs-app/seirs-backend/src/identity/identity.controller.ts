import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { IdentityService } from './identity.service';
import { HandoffMethod, HandoffStage } from './handoff-record.entity';

// All identity endpoints require auth — partner staff, drivers, and
// admin reviewing chain-of-custody records all sign in.
@UseGuards(JwtAuthGuard)
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  // GET /api/v1/identity/lookup/:code
  // Partner/driver scans the recipient's SEIRS QR — server returns the
  // expected name so the staff member can prompt the recipient to speak it.
  @Get('lookup/:code')
  lookup(@Param('code') code: string) {
    return this.identityService.lookupBySeirsId(code);
  }

  // POST /api/v1/identity/handoff/:deliveryId/issue-otp
  // Triggered by partner/driver when starting the recipient handoff —
  // emails a 6-digit OTP to the customer. Rate-limited to 3/min per recipient.
  @Post('handoff/:deliveryId/issue-otp')
  issueOtp(
    @Param('deliveryId') deliveryId: string,
    @Body() body: { recipientUserId: string },
  ) {
    return this.identityService.issueHandoffOtp(deliveryId, body.recipientUserId);
  }

  // POST /api/v1/identity/handoff/:deliveryId/verify
  // Accepts either physical-ID + OTP path, or SEIRS-ID + typed-name path.
  // On success returns the handoff record id for attaching to delivery audit.
  @Post('handoff/:deliveryId/verify')
  verify(
    @Param('deliveryId') deliveryId: string,
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
    return this.identityService.verifyHandoff({ deliveryId, ...body });
  }

  // GET /api/v1/identity/handoff/:deliveryId/chain
  // Full chain-of-custody for a delivery — used by admin disputes view
  // and the customer trip-detail screen.
  @Get('handoff/:deliveryId/chain')
  chain(@Param('deliveryId') deliveryId: string) {
    return this.identityService.getHandoffChain(deliveryId);
  }
}
