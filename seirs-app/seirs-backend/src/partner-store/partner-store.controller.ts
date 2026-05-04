import {
  Body, Controller, Get, Param, Post, Query, UseGuards,
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
}
