import {
  Controller, Get, Param, Query, Res, UseGuards, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StatementsService } from './statements.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

/**
 * Statement download and verification.
 *
 * Three audiences: a partner or driver pulling their own, an admin
 * producing one on someone's behalf (support and tax questions), and the
 * public verification check that makes the PDF worth anything.
 */
@Controller()
export class StatementsController {
  constructor(
    private readonly svc: StatementsService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  private send(res: Response, pdf: Buffer, filename: string) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }

  // ── Mine ───────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/statements/partner?from=&to=
   * The signed-in partner's own counter earnings.
   */
  @UseGuards(JwtAuthGuard)
  @Get('statements/partner')
  async myPartnerStatement(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const rows = await this.ds.query(
      `SELECT "partnerStoreId" FROM users WHERE id = $1 LIMIT 1`, [user.id],
    );
    const storeId = rows?.[0]?.partnerStoreId;
    if (!storeId) throw new ForbiddenException('You do not run a partner store.');

    const data = await this.svc.partnerStatement(storeId, from, to);
    const { pdf, filename } = await this.svc.issue(data);
    this.send(res, pdf, filename);
  }

  /**
   * GET /api/v1/statements/driver?from=&to=
   * The signed-in driver's own earnings.
   */
  @UseGuards(JwtAuthGuard)
  @Get('statements/driver')
  async myDriverStatement(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const rows = await this.ds.query(
      `SELECT id FROM drivers WHERE "userId" = $1 LIMIT 1`, [user.id],
    );
    const driverId = rows?.[0]?.id;
    if (!driverId) throw new ForbiddenException('You do not have a driver profile.');

    const data = await this.svc.driverStatement(driverId, from, to);
    const { pdf, filename } = await this.svc.issue(data as any);
    this.send(res, pdf, filename);
  }

  // ── Admin, on someone's behalf ─────────────────────────────────────────

  /**
   * Support gets asked for these constantly, usually around tax time, and
   * usually by someone who cannot work the app. Marked on the document as
   * admin-issued so it is never passed off as self-served.
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/statements/:type/:id')
  async adminStatement(
    @Param('type') type: string,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (type !== 'partner' && type !== 'driver') {
      throw new NotFoundException('Statement type must be partner or driver.');
    }
    const data = type === 'partner'
      ? await this.svc.partnerStatement(id, from, to)
      : await this.svc.driverStatement(id, from, to);
    const { pdf, filename } = await this.svc.issue(data as any, 'support');
    this.send(res, pdf, filename);
  }

  // ── Public verification ────────────────────────────────────────────────

  /**
   * The reason the PDF is worth anything. Open to the world on purpose:
   * a bank or tax officer holding the document must be able to check it
   * without a SEIRS account.
   */
  @Public()
  @Get('verify/:code')
  verify(@Param('code') code: string) {
    return this.svc.verify(code);
  }
}
