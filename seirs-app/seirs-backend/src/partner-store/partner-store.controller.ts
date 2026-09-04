import {
  Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PartnerStoreService } from './partner-store.service';
import { PartnerDocumentsService } from './partner-documents.service';
import { PartnerPayoutsService } from './partner-payouts.service';
import { DropoffMode } from './store-dropoff.entity';
import { HandoffMethod } from '../identity/handoff-record.entity';

@UseGuards(JwtAuthGuard)
@Controller('partner-store')
export class PartnerStoreController {
  constructor(
    private readonly svc: PartnerStoreService,
    private readonly docs: PartnerDocumentsService,
    private readonly payouts: PartnerPayoutsService,
  ) {}

  // ── Where the shop is paid ─────────────────────────────────────────────

  /** GET /api/v1/partner-store/my-bank. Account number is masked. */
  @Get('my-bank')
  myBank(@CurrentUser() user: any) {
    return this.payouts.myBankDetails(user.id);
  }

  /**
   * POST /api/v1/partner-store/my-bank  { bankName, bankCode, accountNumber }
   *
   * Resolved with the bank before it is stored, and the NAME stored is
   * the bank's answer rather than what was typed. The first account
   * saves instantly; replacing one queues for a human and the live
   * account keeps paying until then.
   */
  @Post('my-bank')
  setBank(
    @CurrentUser() user: any,
    @Body() body: { bankName: string; bankCode: string; accountNumber: string },
  ) {
    return this.payouts.setBankDetails(user.id, body);
  }

  // ── KYC documents ──────────────────────────────────────────────────────

  /**
   * GET /api/v1/partner-store/my-documents
   *
   * Every document with its own status, including the ones never sent, so
   * the app can say which is still wanted rather than leaving a gap.
   */
  @Get('my-documents')
  myDocuments(@CurrentUser() user: any) {
    return this.docs.myDocuments(user.id);
  }

  /**
   * POST /api/v1/partner-store/my-documents/:docId  { url }
   *
   * Replace ONE document. Before this the only way to answer a rejected
   * CAC photo was to resubmit the whole application, which reset the store
   * to pending review and discarded the decisions already made on the
   * other two files.
   */
  @Post('my-documents/:docId')
  uploadDocument(
    @CurrentUser() user: any,
    @Param('docId') docId: string,
    @Body() body: { url: string; lat?: number; lng?: number; accuracyM?: number },
  ) {
    /**
     * lat, lng and accuracyM are optional on the wire and only recorded
     * for the premises photographs. A phone that refused the permission,
     * or could not get a fix under a zinc roof, still uploads: the
     * absence is shown to the reviewer rather than used to refuse
     * somebody their application.
     */
    return this.docs.upload(user.id, docId, body?.url, {
      lat: body?.lat, lng: body?.lng, accuracyM: body?.accuracyM,
    });
  }

  // POST /api/v1/partner-store/:storeId/close  { reason? }
  // Owner (or admin) winds a shop down. Refuses to finish while
  // packages are still on the shelf; returns how many remain.
  @Post(':storeId/close')
  closeStore(
    @Param('storeId') storeId: string,
    @CurrentUser() user: any,
    @Body() body: { reason?: string },
  ) {
    return this.svc.beginStoreClosure(storeId, user.id, body?.reason);
  }

  // ── Public discovery ───────────────────────────────────────────────────

  // GET /api/v1/partner-store/directory?q=&limit=&offset=&lat=&lng=
  //
  // SECURITY (founder 2026-08-12): this list used to publish every
  // approved store's EXACT street address, phone, coordinates, and
  // opening hours to anonymous visitors. In the Nigerian threat model
  // that is a shopping list: which shops hold packages, precisely
  // where, and when they are closed. Shops holding other people's goods
  // must not be enumerable by people who have never signed in.
  //
  // Anonymous callers now get AREA-LEVEL results only (shop name, city,
  // whether it is open now). Signing in reveals the exact address,
  // coordinates, phone, and storefront photo, because a customer
  // choosing a drop-off point genuinely needs them - and an account is
  // traceable, which anonymous scraping is not.
  @Public()
  @Get('directory')
  publicDirectory(
    @CurrentUser() user: any,
    @Query('q')                                              q?: string,
    @Query('limit',  new DefaultValuePipe(30),  ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0),   ParseIntPipe) offset?: number,
    @Query('lat')                                            lat?: string,
    @Query('lng')                                            lng?: string,
  ) {
    return this.svc.publicDirectory({
      q,
      limit:  limit!,
      offset: offset!,
      lat:    lat != null && lat !== '' ? Number(lat) : undefined,
      lng:    lng != null && lng !== '' ? Number(lng) : undefined,
      precise: !!user?.id,
    });
  }

  // ── Customer / sender ──────────────────────────────────────────────────

  // GET /api/v1/partner-store/capacity/nearby?lat=&lng=&radiusKm=
  // Customer picks a pickup store - returns capacity bucket so they
  // see "Plenty / Limited / Full" without exposing exact ops numbers.
  @Get('capacity/nearby')
  nearbyStores(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radius?: string,
  ) {
    return this.svc.listCapacityNearby(
      lat ? Number(lat) : undefined,
      lng ? Number(lng) : undefined,
      radius ? Number(radius) : 10,
    );
  }

  // POST /api/v1/partner-store/dropoff
  @Post('dropoff')
  schedule(
    @CurrentUser() user: any,
    @Body() body: {
      pickupStoreId:    string;
      mode:             DropoffMode;
      dropoffStoreId?:  string;
      recipientAddress?: string;
      recipientUserId?: string;
      recipientName:    string;
      recipientPhone:   string;
      weightKg:         number;
      packageDescription?: string;
      declaredValueNgn?: number;
    },
  ) {
    return this.svc.scheduleDropoff(user.id, body);
  }

  // GET /api/v1/partner-store/dropoff/:code
  // Either dropCode (SDR-XXXXXXXX) or 6-char backup - server treats them the same.
  @Get('dropoff/:code')
  getByCode(@Param('code') code: string) {
    return this.svc.findByCodeDetailed(code);
  }

  // GET /api/v1/partner-store/dropoff/me
  // Sender's full drop-off history.
  @Get('my-dropoffs')
  listMine(@CurrentUser() user: any) {
    return this.svc.listForSender(user.id);
  }

  // ── Partner staff side ─────────────────────────────────────────────────

  // POST /api/v1/partner-store/withdraw
  // Partner cashes out cleared counter earnings to their bank.
  @Post('withdraw')
  withdraw(@CurrentUser() user: any) {
    return this.svc.withdrawPartnerEarnings(user.id);
  }

  // POST /api/v1/partner-store/quote
  // What a drop-off will cost, before the sender commits to it.
  @Post('quote')
  quote(
    @Body() body: {
      pickupStoreId: string;
      mode: any;
      dropoffStoreId?: string;
      recipientLat?: number;
      recipientLng?: number;
      weightKg: number;
      categoryCode?: string;
      declaredValueNgn?: number;
    },
  ) {
    return this.svc.quoteDropoff(body);
  }

  // POST /api/v1/partner-store/dropoff/:id/pay
  // Sender pays the fare, or the difference the counter's scale found.
  @Post('dropoff/:id/pay')
  payDropoff(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { kind?: 'fare' | 'topup' },
  ) {
    return this.svc.payForDropoff(user.id, id, body?.kind ?? 'fare');
  }

  // POST /api/v1/partner-store/issue-otp
  // Staff at the counter asks the system to mail the person in front of
  // them a fresh code. Scoped to the store the package is actually at.
  @Post('issue-otp')
  issueOtp(
    @CurrentUser() staff: any,
    @Body() body: { code: string; purpose?: 'receive' | 'release' },
  ) {
    return this.svc.issueDropoffOtp(staff.id, body.code, body.purpose ?? 'receive');
  }

  // POST /api/v1/partner-store/receive
  //
  // The counter takes a package in from a SENDER. staffSignatureName is
  // the name the staff member types after the scan: a store that later
  // denies receiving a package is answered by a named human, not by a
  // store id and a timestamp (founder 2026-08-25). Optional on the wire
  // so partner builds already in the field keep working; the server falls
  // back to the signed-in staff account's name and records that it did.
  @Post('receive')
  receive(
    @CurrentUser() staff: any,
    @Body() body: {
      code:             string;
      weightKg:         number;
      receivedPhotoUrl: string;
      senderOtp:        string;
      staffSignatureName?: string;
    },
  ) {
    return this.svc.receiveAtStore(staff.id, body);
  }

  // POST /api/v1/partner-store/receive-from-driver
  //
  // The destination counter takes a package in from a RIDER. This is the
  // scan the liability matrix hangs "driver liable until the store scans"
  // on, and until now nothing performed it: the drop-off advanced purely
  // because the rider marked their own leg delivered. The rider stays on
  // the hook in the custody chain until a named human here signs.
  @Post('receive-from-driver')
  receiveFromDriver(
    @CurrentUser() staff: any,
    @Body() body: {
      code:                string;
      receivedPhotoUrl?:   string;
      staffSignatureName?: string;
    },
  ) {
    return this.svc.receiveFromDriver(staff.id, body);
  }

  // POST /api/v1/partner-store/release
  @Post('release')
  release(
    @CurrentUser() staff: any,
    @Body() body: {
      code:               string;
      method:             HandoffMethod;
      collectedPhotoUrl:  string;
      idType?:            string;
      idNumber?:          string;
      otp?:               string;
      idPhotoUrl?:        string;
      seirsCode?:         string;
      typedName?:         string;
      // The staff member handing it over, typed by them. The founder asked
      // whether the sender's receipt can show who collected the package:
      // it shows who released it too, so neither end is anonymous.
      staffSignatureName?: string;
    },
  ) {
    return this.svc.releaseToRecipient(staff.id, body);
  }

  // GET /api/v1/partner-store/store/:storeId/dropoffs?onlyActive=true
  @Get('store/:storeId/dropoffs')
  listForStore(
    @Param('storeId') storeId: string,
    @CurrentUser() staff: any,
    @Query('onlyActive') onlyActive?: string,
  ) {
    return this.svc.listForStore(storeId, staff.id, { onlyActive: onlyActive === 'true' });
  }

  // GET /api/v1/partner-store/store/:storeId/capacity
  @Get('store/:storeId/capacity')
  capacity(@Param('storeId') storeId: string) {
    return this.svc.getCapacity(storeId);
  }

  // PATCH /api/v1/partner-store/store/:storeId/status  { status: 'active' | 'paused' }
  @Patch('store/:storeId/status')
  setStatus(
    @Param('storeId') storeId: string,
    @CurrentUser() staff: any,
    @Body() body: { status: 'active' | 'paused' },
  ) {
    return this.svc.setStoreStatus(storeId, body.status, staff.id);
  }

  // GET /api/v1/partner-store/store/:storeId/overstays
  @Get('store/:storeId/overstays')
  overstays(@Param('storeId') storeId: string, @CurrentUser() staff: any) {
    return this.svc.listOverstays(storeId, staff.id);
  }

  // GET /api/v1/partner-store/store/:storeId/deletion-readiness
  // Spec V8 - pre-flight blockers before closing a partner store.
  // Returns blockers list (in-store packages, scheduled drop-offs)
  // so the partner-app UI can guide the operator through cleanup.
  @Get('store/:storeId/deletion-readiness')
  deletionReadiness(@Param('storeId') storeId: string, @CurrentUser() staff: any) {
    return this.svc.getDeletionReadiness(storeId, staff.id);
  }

  // ── Hybrid-account: user upgrades from Business Sender to also become a
  // Partner Store. Creates a PartnerStore in PENDING_REVIEW state. Admin
  // reviews KYC docs (storefront photo, CAC reg, owner ID, address) and
  // calls /admin/partner-stores/:id/approve to flip canPartner=true.
  // POST /api/v1/partner-store/apply
  @Post('apply')
  applyForPartnerStore(
    @CurrentUser() user: any,
    @Body() body: {
      storeName:          string;
      storeAddress:       string;
      phone:              string;
      maxCapacity?:       number;
      storefrontPhotoUrl: string;
      cacRegUrl?:         string;
      ownerIdUrl:         string;
      storeLat?:          number;
      storeLng?:          number;
    },
  ) {
    return this.svc.submitPartnerApplication(user.id, body);
  }

  // GET /api/v1/partner-store/my-application - user polls status of their
  // pending application. Returns null if they haven't applied.
  @Get('my-application')
  myApplication(@CurrentUser() user: any) {
    return this.svc.getMyApplication(user.id);
  }

  // ── Sponsored Placement (Spec V8 §4.11) ──────────────────────────────
  // Partner pays a monthly fee to be pinned at the top of the customer map
  // + drop-off picker. Live monthly price comes from FeesService so the
  // displayed cost always matches what would be charged.

  // GET /api/v1/partner-store/sponsorship/me
  @Get('sponsorship/me')
  mySponsorship(@CurrentUser() user: any) {
    return this.svc.getMySponsorship(user.id);
  }

  // POST /api/v1/partner-store/sponsorship/activate
  @Post('sponsorship/activate')
  activateSponsorship(@CurrentUser() user: any) {
    return this.svc.activateSponsorship(user.id);
  }

  // POST /api/v1/partner-store/sponsorship/pause
  @Post('sponsorship/pause')
  pauseSponsorship(@CurrentUser() user: any) {
    return this.svc.pauseSponsorship(user.id);
  }
}
