import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LaunchResetService } from './launch-reset.service';
import { LAUNCH_RESET_PHRASE } from './launch-reset.types';

/**
 * The launch reset endpoints.
 *
 * Three guards, in order, because a token is not standing:
 *
 *   JwtAuthGuard    - the request carries a valid session
 *   AdminGuard      - that session belongs to staff
 *   SuperAdminGuard - that staff member is a super admin, read live from
 *                     the database rather than from the 30-minute token,
 *                     so a demotion takes effect immediately
 *
 * The service then checks the actor's own row again (still exists, still
 * active, still staff, not itself a demo account). A guard proves who is
 * asking; it cannot prove they should be allowed to do THIS to THESE
 * records, and this endpoint deletes accounts.
 */
@UseGuards(JwtAuthGuard, AdminGuard, SuperAdminGuard)
@Controller('launch-reset')
export class LaunchController {
  constructor(private readonly launchReset: LaunchResetService) {}

  /**
   * GET /api/v1/launch-reset/preview
   *
   * Reads only. Returns exactly what a run would remove, counted by
   * entity type with a sample, plus every account that is being kept
   * and why. Nobody presses a destructive button on trust.
   */
  @Get('preview')
  preview(@CurrentUser() admin: any, @Req() req: Request) {
    return this.launchReset.preview(admin, req.ip);
  }

  /**
   * POST /api/v1/launch-reset/execute
   *
   * Body:
   *   confirm                   the exact phrase, typed by a human
   *   expectedDeletableAccounts the count the preview showed
   *
   * The phrase stops a stray click. The echoed count stops a replay: a
   * captured request no longer matches a set that has changed, so it is
   * refused instead of running against accounts nobody reviewed.
   */
  @Post('execute')
  execute(
    @CurrentUser() admin: any,
    @Body() body: { confirm?: string; expectedDeletableAccounts?: number },
    @Req() req: Request,
  ) {
    return this.launchReset.execute(admin, body ?? {}, req.ip);
  }

  /**
   * GET /api/v1/launch-reset/phrase
   *
   * So the screen can show the phrase it is about to demand without
   * hard-coding a second copy that could drift from the server's.
   */
  @Get('phrase')
  phrase() {
    return { phrase: LAUNCH_RESET_PHRASE };
  }
}
