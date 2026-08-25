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
      /**
       * The typed full name of the human signing for this handover
       * (2026-08-25). A store denying a package ever arrived is answered
       * by a named human, not by a store id and a timestamp.
       *
       * On method 'typed_signature' the server files this on whichever
       * side of the handover the STORE is standing, because the counter
       * is the party whose word is in doubt and the rider is already
       * identified by this request's JWT:
       *
       *   store_to_driver  store hands over  -> stored as releasedByName
       *   driver_to_store  store takes it in -> stored as signatureName
       *
       * Send a first and last name. The server rejects a single word.
       */
      signatureName?: string;
      /**
       * Explicit override for the HANDING-OVER side. Only needed by
       * callers that know both names, such as the partner counter
       * releasing to a recipient it has just verified.
       */
      releasedByName?: string;
      /** Store this happened at. Resolved from the drop-off when omitted. */
      partnerStoreId?: string;
    },
  ) {
    return this.identityService.verifyHandoff({ deliveryId, ...body }, user.id);
  }

  // GET /api/v1/identity/handoff/:deliveryId/chain
  // Full chain-of-custody for a delivery - used by admin disputes view
  // and the customer trip-detail screen. Parties to the delivery and
  // admins only: the records carry typed legal names, government ID type
  // and last four, and doorstep photos.
  //
  // Accepts a drop-off id as well as a delivery id (2026-08-25), and
  // returns the records filed under BOTH: a counter receipt is written
  // against the drop-off, the road journey against the delivery, so
  // searching either one used to show half a chain at best.
  @Get('handoff/:deliveryId/chain')
  chain(@Param('deliveryId') deliveryId: string, @CurrentUser() user: User) {
    return this.identityService.getHandoffChain(deliveryId, user.id);
  }

  // GET /api/v1/identity/handoff/:deliveryId/custody
  //
  // The chain plus the question the Liability Disputes page is actually
  // asking: who is holding this package right now, and who carries the
  // loss if it went missing at this moment. Spec V8's matrix reduces to
  // one rule (whoever last signed holds it until the next party signs),
  // so the answer is derived from the chain rather than kept as a second
  // source of truth that can disagree with it.
  //
  // Separate from /chain, which still returns a bare array: changing that
  // shape would break the tracking screens already reading it.
  @Get('handoff/:deliveryId/custody')
  custody(@Param('deliveryId') deliveryId: string, @CurrentUser() user: User) {
    return this.identityService.getCustodySummary(deliveryId, user.id);
  }
}
