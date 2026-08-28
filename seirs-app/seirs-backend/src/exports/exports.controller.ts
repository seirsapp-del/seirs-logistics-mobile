import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ExportsService } from './exports.service';
import {
  EXPORTS_FINANCE_PERMISSION,
  EXPORTS_OPERATIONAL_PERMISSION,
  ExportPermissionGuard,
  RequireExportPermission,
} from './export-permission.guard';

/**
 * CSV exports for the admin dashboard.
 *
 * Until this existed there was exactly one export in the whole admin,
 * the NDPR bundle for a single user, so reconciling a payout run against
 * a bank statement or handing an accountant a month of revenue meant
 * reading numbers off a web page and retyping them.
 *
 * THREE guards, in order, and each does a different job:
 *
 *   JwtAuthGuard           are you signed in
 *   AdminGuard             are you staff
 *   ExportPermissionGuard  were you granted THIS export
 *
 * The third is the one that matters. A guard proves identity, not
 * entitlement, and a signed-in content editor is still a signed-in
 * person who should not be able to download the customer table. The
 * permission guard sits at controller level rather than per route on
 * purpose: it refuses any handler that fails to declare a permission, so
 * the next export somebody adds is closed until it is named rather than
 * open until somebody remembers.
 *
 * Every route streams. Nothing is assembled in memory, and every
 * download writes an audit row naming the actor, the export, the range
 * and the row count.
 */
@UseGuards(JwtAuthGuard, AdminGuard, ExportPermissionGuard)
@Controller('admin/exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  // -- Money. Reconciled against a bank statement, so stricter. ------------

  /**
   * The reconciliation export: one row per transfer that actually left,
   * with what was requested, what was sent, what was withheld, our
   * reference and the Flutterwave id.
   */
  @Get('driver-payouts')
  @RequireExportPermission(EXPORTS_FINANCE_PERMISSION)
  driverPayouts(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() admin: User,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.exports.streamCsv('driver-payouts', from, to, admin, req.ip, res);
  }

  @Get('driver-earnings')
  @RequireExportPermission(EXPORTS_FINANCE_PERMISSION)
  driverEarnings(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() admin: User,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.exports.streamCsv('driver-earnings', from, to, admin, req.ip, res);
  }

  @Get('payments')
  @RequireExportPermission(EXPORTS_FINANCE_PERMISSION)
  payments(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() admin: User,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.exports.streamCsv('payments', from, to, admin, req.ip, res);
  }

  @Get('deliveries')
  @RequireExportPermission(EXPORTS_FINANCE_PERMISSION)
  deliveries(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() admin: User,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.exports.streamCsv('deliveries', from, to, admin, req.ip, res);
  }

  // -- Operational -------------------------------------------------------

  @Get('drivers')
  @RequireExportPermission(EXPORTS_OPERATIONAL_PERMISSION)
  drivers(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() admin: User,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.exports.streamCsv('drivers', from, to, admin, req.ip, res);
  }

  @Get('customers')
  @RequireExportPermission(EXPORTS_OPERATIONAL_PERMISSION)
  customers(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() admin: User,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.exports.streamCsv('customers', from, to, admin, req.ip, res);
  }

  @Get('support-tickets')
  @RequireExportPermission(EXPORTS_OPERATIONAL_PERMISSION)
  supportTickets(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() admin: User,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.exports.streamCsv('support-tickets', from, to, admin, req.ip, res);
  }
}
