import {
  Controller, Get, Post, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { SpecialRequestsService } from './special-requests.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * What a sender can reach.
 *
 * Deliberately a separate controller from the admin one, rather than one
 * route branching on who is asking. Two leaks were fixed earlier tonight
 * that had exactly that shape: an endpoint serving two audiences, with the
 * redaction living somewhere else or nowhere. A special request carries
 * our margin on the quote, the escalation trail, the call log and every
 * superseded price. Splitting the routes means none of that has a path to
 * a sender's phone at all, rather than a branch somebody must remember.
 */
@UseGuards(JwtAuthGuard)
@Controller('special-requests')
export class SpecialRequestsController {
  constructor(private readonly svc: SpecialRequestsService) {}

  /** POST /api/v1/special-requests */
  @Post()
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.svc.create(user.id, body);
  }

  /** GET /api/v1/special-requests/mine */
  @Get('mine')
  listMine(@CurrentUser() user: any) {
    return this.svc.listMine(user.id);
  }

  /**
   * GET /api/v1/special-requests/:id
   *
   * Resolved against the signed-in user, never trusting the id alone. A
   * guard proves who somebody is, not what they own.
   */
  @Get(':id')
  detail(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.mine(user.id, id);
  }

  /** POST /api/v1/special-requests/:id/withdraw */
  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.withdraw(user.id, id);
  }

  /**
   * POST /api/v1/special-requests/:id/accept
   *
   * Takes no quote id. It accepts the CURRENT quote, and the server
   * refuses one that has lapsed, so a screen loaded an hour ago cannot
   * bind us to a price we have since replaced or that fuel has overtaken.
   */
  @Post(':id/accept')
  accept(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.accept(user.id, id);
  }
}

/**
 * The reviewer's side. Everything the sender's routes withhold.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/special-requests')
export class AdminSpecialRequestsController {
  constructor(private readonly svc: SpecialRequestsService) {}

  /** GET /api/v1/admin/special-requests?status=&from=&to= */
  @Get()
  queue(
    @Query('status') status?: string,
    @Query('from')   from?: string,
    @Query('to')     to?: string,
  ) {
    return this.svc.adminQueue(status, from, to);
  }

  /** GET /api/v1/admin/special-requests/:id */
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.svc.adminDetail(id);
  }

  /** POST /api/v1/admin/special-requests/:id/quote */
  @Post(':id/quote')
  quote(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() body: { lines?: any[]; note?: string; expiresInHours?: number },
  ) {
    return this.svc.quote(id, admin?.id, body as any);
  }

  /** POST /api/v1/admin/special-requests/:id/decline  { reason } */
  @Post(':id/decline')
  decline(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() body: { reason?: string },
  ) {
    return this.svc.decline(id, admin?.id, body?.reason);
  }

  /** POST /api/v1/admin/special-requests/:id/escalate  { toAdminId?, note } */
  @Post(':id/escalate')
  escalate(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() body: { toAdminId?: string; note?: string },
  ) {
    return this.svc.escalate(id, admin?.id, body?.toAdminId, body?.note);
  }

  /** POST /api/v1/admin/special-requests/:id/calls */
  @Post(':id/calls')
  logCall(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() body: { connected?: boolean; spokeTo?: string; notes?: string },
  ) {
    return this.svc.logCall(id, admin?.id, body);
  }
}
