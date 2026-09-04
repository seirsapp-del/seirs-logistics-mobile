import {
  Controller, Get, Post, Patch, Param, Query, Body, UseGuards,
  DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { PartnerDocumentsService } from './partner-documents.service';
import { PartnerStoreService } from './partner-store.service';
import { KycDocumentsService } from '../kyc/kyc-documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { KycDocStatus } from '../kyc/kyc-document.entity';

/**
 * Partner store KYC review, one document at a time.
 *
 * The routes mirror admin/driver-documents deliberately, down to the verb
 * names, because they are the same decisions made by the same reviewers
 * about the same kinds of file. A shop's certificate and a rider's licence
 * should not need two different sets of buttons.
 *
 * Whole-store approve and reject stay where they already are, in the admin
 * module: one answers "should this business be a partner", the other
 * answers "is this photograph readable". They are different questions and
 * the founder has both.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/partner-documents')
export class AdminPartnerDocumentsController {
  constructor(
    private readonly partnerDocs: PartnerDocumentsService,
    private readonly kyc: KycDocumentsService,
    // Only for use-as-pin, which writes the store row rather than a document.
    private readonly stores: PartnerStoreService,
  ) {}

  // GET /api/v1/admin/partner-documents?status=submitted&page=1&storeId=
  @Get()
  list(
    @Query('status') status?: KycDocStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('storeId') storeId?: string,
  ) {
    return this.partnerDocs.adminList(status, page, storeId);
  }

  // GET /api/v1/admin/partner-documents/counts
  @Get('counts')
  counts() {
    return this.partnerDocs.counts();
  }

  // GET /api/v1/admin/partner-documents/expiring?days=30
  // The list to work through, not a number. A CAC certificate and an
  // owner's ID both run out; a storefront photo does not and never
  // appears here.
  @Get('expiring')
  expiring(@Query('days') days?: string) {
    return this.partnerDocs.expiring(Number(days) || 30);
  }

  // POST /api/v1/admin/partner-documents/:id/approve  { expiresAt? }
  @Post(':id/approve')
  approve(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body?: { expiresAt?: string | null },
  ) {
    return this.kyc.review(id, user.id, 'approved', undefined, body?.expiresAt ?? null);
  }

  // POST /api/v1/admin/partner-documents/:id/reject  { reason }
  // The reason is required by the service, not optional here by accident:
  // without it they upload the same unreadable photo again.
  @Post(':id/reject')
  reject(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.kyc.review(id, user.id, 'rejected', body?.reason);
  }

  // POST /api/v1/admin/partner-documents/:id/needs-replacing  { reason? }
  // For a certificate that was fine and has run out. Distinct from reject,
  // which says they did something wrong. Time passing is not a fault, and
  // treating it as one is how you lose a shop that has done nothing.
  @Post(':id/needs-replacing')
  needsReplacing(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.kyc.review(id, user.id, 'needs_replacing', body?.reason);
  }

  // PATCH /api/v1/admin/partner-documents/:id/expiry  { expiresAt }
  // Settable at any time, not only at approval: going through approve
  // would fire a fresh "approved" notice for a decision made days ago.
  // Null clears it.
  @Patch(':id/expiry')
  setExpiry(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { expiresAt: string | null },
  ) {
    return this.kyc.setExpiry(id, user.id, body?.expiresAt ?? null);
  }

  // GET /api/v1/admin/partner-documents/store/:storeId
  // Everything one shop has, for its own page. The founder's rule:
  // everything about a partner lives where the partner already is.
  @Get('store/:storeId')
  forStore(@Param('storeId') storeId: string) {
    return this.partnerDocs.listForStore(storeId);
  }

  /**
   * PATCH /api/v1/admin/partner-documents/:storeId/:docId/use-as-pin
   *
   * Promote a photograph's recorded location to be the shop's map pin, so
   * the position becomes something measured outside the building rather
   * than picked from an address list.
   */
  @Patch(':storeId/:docId/use-as-pin')
  useAsPin(
    @Param('storeId') storeId: string,
    @Param('docId')   docId: string,
    @CurrentUser()    admin: any,
  ) {
    return this.stores.adoptDocumentLocationAsPin(storeId, docId, admin?.id);
  }
}
