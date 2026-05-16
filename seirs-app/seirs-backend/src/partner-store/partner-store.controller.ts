import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PartnerStoreService } from './partner-store.service';
import { DropoffMode } from './store-dropoff.entity';
import { HandoffMethod } from '../identity/handoff-record.entity';

@UseGuards(JwtAuthGuard)
@Controller('partner-store')
export class PartnerStoreController {
  constructor(private readonly svc: PartnerStoreService) {}

  // ── Customer / sender ──────────────────────────────────────────────────

  // GET /api/v1/partner-store/capacity/nearby?lat=&lng=&radiusKm=
  // Customer picks a pickup store — returns capacity bucket so they
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
  // Either dropCode (SDR-XXXXXXXX) or 6-char backup — server treats them the same.
  @Get('dropoff/:code')
  getByCode(@Param('code') code: string) {
    return this.svc.findByCode(code);
  }

  // GET /api/v1/partner-store/dropoff/me
  // Sender's full drop-off history.
  @Get('my-dropoffs')
  listMine(@CurrentUser() user: any) {
    return this.svc.listForSender(user.id);
  }

  // ── Partner staff side ─────────────────────────────────────────────────

  // POST /api/v1/partner-store/receive
  @Post('receive')
  receive(
    @CurrentUser() staff: any,
    @Body() body: {
      code:             string;
      weightKg:         number;
      receivedPhotoUrl: string;
      senderOtp:        string;
    },
  ) {
    return this.svc.receiveAtStore(staff.id, body);
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
    },
  ) {
    return this.svc.releaseToRecipient(staff.id, body);
  }

  // GET /api/v1/partner-store/store/:storeId/dropoffs?onlyActive=true
  @Get('store/:storeId/dropoffs')
  listForStore(
    @Param('storeId') storeId: string,
    @Query('onlyActive') onlyActive?: string,
  ) {
    return this.svc.listForStore(storeId, { onlyActive: onlyActive === 'true' });
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
  overstays(@Param('storeId') storeId: string) {
    return this.svc.listOverstays(storeId);
  }

  // GET /api/v1/partner-store/store/:storeId/deletion-readiness
  // Spec V8 — pre-flight blockers before closing a partner store.
  // Returns blockers list (in-store packages, scheduled drop-offs)
  // so the partner-app UI can guide the operator through cleanup.
  @Get('store/:storeId/deletion-readiness')
  deletionReadiness(@Param('storeId') storeId: string) {
    return this.svc.getDeletionReadiness(storeId);
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
    },
  ) {
    return this.svc.submitPartnerApplication(user.id, body);
  }

  // GET /api/v1/partner-store/my-application — user polls status of their
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
