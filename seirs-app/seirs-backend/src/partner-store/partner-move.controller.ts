import {
  Controller, Get, Post, Patch, Param, Body, UseGuards,
} from '@nestjs/common';
import { PartnerMoveService } from './partner-move.service';
import { ParcelRecoveryService } from './parcel-recovery.service';
import { PartnerStoreService } from './partner-store.service';
import { RecoveryOutcome } from './parcel-recovery-task.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * A shop asking to trade from a different building.
 *
 * Every route here resolves the store from the SIGNED-IN USER, never from
 * an id in the path. A guard proves who someone is, not what they own, and
 * a storeId parameter on a partner route is an invitation to move somebody
 * else's shop.
 */
@UseGuards(JwtAuthGuard)
@Controller('partner-store/move')
export class PartnerMoveController {
  constructor(private readonly moves: PartnerMoveService) {}

  /** GET /api/v1/partner-store/move  the shop's own move screen. */
  @Get()
  mine(@CurrentUser() user: any) {
    return this.moves.myMoveRequest(user.id);
  }

  /** POST /api/v1/partner-store/move  file one. */
  @Post()
  request(
    @CurrentUser() user: any,
    @Body() body: {
      newStoreAddress?: string;
      newStoreLat?: number;
      newStoreLng?: number;
      reason?: string;
      movingOn?: string;
      stillTradingAtOld?: boolean;
    },
  ) {
    return this.moves.requestMove(user.id, body);
  }

  /**
   * POST /api/v1/partner-store/move/documents/:docId  { url, lat?, lng?, accuracyM? }
   *
   * A photo of the NEW premises. Only the four documents marked
   * reaskOn: 'premises_move' are accepted: the owner's ID and the company
   * papers are not asked for again, because the person and the business
   * have not moved, only the building.
   */
  @Post('documents/:docId')
  uploadDoc(
    @CurrentUser() user: any,
    @Param('docId') docId: string,
    @Body() body: { url: string; lat?: number; lng?: number; accuracyM?: number },
  ) {
    return this.moves.uploadMoveDoc(user.id, docId, body?.url, {
      lat: body?.lat, lng: body?.lng, accuracyM: body?.accuracyM,
    });
  }

  /** PATCH /api/v1/partner-store/move/withdraw  cancel before a decision. */
  @Patch('withdraw')
  withdraw(@CurrentUser() user: any) {
    return this.moves.withdrawMove(user.id);
  }
}

/**
 * The reviewer's side.
 *
 * Split into its own controller with its own guard rather than sharing the
 * partner one, so an ordinary partner token can never reach a decision
 * route by guessing a path.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/partner-moves')
export class AdminPartnerMovesController {
  constructor(
    private readonly moves: PartnerMoveService,
    private readonly rec: ParcelRecoveryService,
  ) {}

  /** GET /api/v1/admin/partner-moves  the queue, oldest first. */
  @Get()
  queue() {
    return this.moves.listPending();
  }

  /** GET /api/v1/admin/partner-moves/store/:storeId  one shop's pending move. */
  @Get('store/:storeId')
  forStore(@Param('storeId') storeId: string) {
    return this.moves.getForStore(storeId);
  }

  /**
   * GET /api/v1/admin/partner-moves/store/:storeId/parcels
   *
   * The full audit: every parcel in the shop, whose it is, how long it has
   * been there, its whole lifecycle and its chain of custody.
   *
   * Lives here because a move is what forced it to exist, but it is not
   * move-specific: the same list is what a suspension or a shop closing
   * needs, and both currently show a bare count too.
   */
  @Get('store/:storeId/parcels')
  parcels(@Param('storeId') storeId: string) {
    return this.moves.parcelAudit(storeId);
  }

  /**
   * GET /api/v1/admin/partner-moves/store/:storeId/recovery
   *
   * Parcels left behind when a shop was suspended or wound down, each with
   * what has been recorded about it.
   */
  @Get('store/:storeId/recovery')
  recovery(@Param('storeId') storeId: string) {
    return this.rec.listForStore(storeId);
  }

  /**
   * PATCH /api/v1/admin/partner-moves/recovery/:taskId
   *
   * Say what happened to one parcel. An outcome is required and there is
   * no "other": every value names a real destination, including
   * unaccounted for, so an honest answer always has somewhere to go.
   */
  @Patch('recovery/:taskId')
  resolveRecovery(
    @Param('taskId') taskId: string,
    @CurrentUser() admin: any,
    @Body() body: { outcome: RecoveryOutcome; note?: string },
  ) {
    return this.rec.resolve(taskId, admin?.id, body?.outcome, body?.note);
  }

  /**
   * PATCH /api/v1/admin/partner-moves/store/:storeId/decide
   *
   * The only route that moves a live shop's address and pin.
   */
  @Patch('store/:storeId/decide')
  decide(
    @Param('storeId') storeId: string,
    @CurrentUser() admin: any,
    @Body() body: { approve: boolean; note?: string; rejectedItems?: string[] },
  ) {
    return this.moves.decide(storeId, !!body.approve, {
      adminId:       admin?.id,
      note:          body.note,
      rejectedItems: body.rejectedItems,
    });
  }
}


/**
 * Calls made to a partner shop before approving it.
 *
 * Its own controller because it is neither a move nor a document: it is
 * the record that a human spoke to a human, which is the one check in the
 * whole partner flow that a forged photograph cannot pass.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/partner-calls')
export class AdminPartnerCallsController {
  constructor(private readonly stores: PartnerStoreService) {}

  /** GET /api/v1/admin/partner-calls/:storeId */
  @Get(':storeId')
  list(@Param('storeId') storeId: string) {
    return this.stores.partnerCalls(storeId);
  }

  /** POST /api/v1/admin/partner-calls/:storeId */
  @Post(':storeId')
  log(
    @Param('storeId') storeId: string,
    @CurrentUser() admin: any,
    @Body() body: {
      scheduledFor?: string; connected?: boolean;
      spokeTo?: string; observations?: string; decision?: string;
    },
  ) {
    return this.stores.logPartnerCall(storeId, admin?.id, body);
  }
}
