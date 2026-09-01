import {
  Controller, Get, Post, Param, Query, Res, UseGuards, ForbiddenException, NotFoundException,
  DefaultValuePipe, ParseIntPipe,
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

  /**
   * GET /api/v1/statements/business?from=&to=
   * The signed-in sender's own delivery spend, as a PDF.
   *
   * Ownership is resolved from the signed-in user rather than taken as a
   * parameter, exactly as the two above do: the token proves who you
   * are, and the businessAccountId is then looked up from it, so there
   * is no id a caller could substitute for somebody else's company.
   */
  @UseGuards(JwtAuthGuard)
  @Get('statements/business')
  async myBusinessStatement(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const rows = await this.ds.query(
      `SELECT "businessAccountId" FROM users WHERE id = $1 LIMIT 1`, [user.id],
    );
    const businessAccountId = rows?.[0]?.businessAccountId;
    if (!businessAccountId) throw new ForbiddenException('You do not have a business account.');

    const data = await this.svc.businessStatement(businessAccountId, from, to);
    const { pdf, filename } = await this.svc.issue(data as any);
    this.send(res, pdf, filename);
  }

  /**
   * GET /api/v1/statements/customer?from=&to=
   * A person's own delivery and ride spend, as a PDF.
   */
  @UseGuards(JwtAuthGuard)
  @Get('statements/customer')
  async myCustomerStatement(
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.svc.customerStatement(user.id, from, to);
    const { pdf, filename } = await this.svc.issue(data as any);
    this.send(res, pdf, filename);
  }

  // ── Issue, and hand back a link rather than bytes ──────────────────────

  /**
   * The three routes above stream a PDF, which a browser handles well
   * and a React Native app does not: fetch there cannot write a binary
   * anywhere shareable without a filesystem module none of the apps
   * carry, and adding one is a native rebuild of all three.
   *
   * So these issue the statement and return its public download URL.
   * The app opens that URL and the platform does the downloading, which
   * also happens to be the thing the founder actually asked for: a
   * document that can be emailed, not just shared out of one phone.
   *
   * The link is public and keyed on the statement's own unguessable
   * code, so nothing is signed and nothing needs to be. It expires;
   * verification by the same code does not.
   */
  private linkFor(code: string, expiresAt: Date | null) {
    /**
     * This has to be absolute. It is opened by a phone and pasted into
     * emails, and a relative path is useless in both. PUBLIC_API_URL is
     * set nowhere today, so the chain matters more than the first entry:
     * Railway injects RAILWAY_PUBLIC_DOMAIN on every deploy, and the
     * production host is the last resort so a link is never emitted
     * without an origin.
     */
    const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
    const base = (
      process.env.PUBLIC_API_URL
      ?? (domain ? `https://${domain}` : undefined)
      ?? 'https://seirs-logistics-mobile-production.up.railway.app'
    ).replace(/\/+$/, '');

    return {
      code,
      url: `${base}/api/v1/statements/download/${code}`,
      expiresAt,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('statements/business/link')
  async businessLink(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const rows = await this.ds.query(
      `SELECT "businessAccountId" FROM users WHERE id = $1 LIMIT 1`, [user.id],
    );
    const id = rows?.[0]?.businessAccountId;
    if (!id) throw new ForbiddenException('You do not have a business account.');
    const data = await this.svc.businessStatement(id, from, to);
    const { code, expiresAt } = await this.svc.issueLink(data as any);
    return this.linkFor(code, expiresAt);
  }

  @UseGuards(JwtAuthGuard)
  @Get('statements/partner/link')
  async partnerLink(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const rows = await this.ds.query(
      `SELECT "partnerStoreId" FROM users WHERE id = $1 LIMIT 1`, [user.id],
    );
    const id = rows?.[0]?.partnerStoreId;
    if (!id) throw new ForbiddenException('You do not run a partner store.');
    const data = await this.svc.partnerStatement(id, from, to);
    const { code, expiresAt } = await this.svc.issueLink(data);
    return this.linkFor(code, expiresAt);
  }

  @UseGuards(JwtAuthGuard)
  @Get('statements/customer/link')
  async customerLink(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.svc.customerStatement(user.id, from, to);
    const { code, expiresAt } = await this.svc.issueLink(data as any);
    return this.linkFor(code, expiresAt);
  }

  @UseGuards(JwtAuthGuard)
  @Get('statements/driver/link')
  async driverLink(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const rows = await this.ds.query(
      `SELECT id FROM drivers WHERE "userId" = $1 LIMIT 1`, [user.id],
    );
    const id = rows?.[0]?.id;
    if (!id) throw new ForbiddenException('You do not have a driver profile.');
    const data = await this.svc.driverStatement(id, from, to);
    const { code, expiresAt } = await this.svc.issueLink(data as any);
    return this.linkFor(code, expiresAt);
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
    if (!['partner', 'driver', 'business', 'customer'].includes(type)) {
      throw new NotFoundException('Statement type must be partner, driver, business or customer.');
    }
    const data =
      type === 'partner'  ? await this.svc.partnerStatement(id, from, to)
      : type === 'business' ? await this.svc.businessStatement(id, from, to)
      : type === 'customer' ? await this.svc.customerStatement(id, from, to)
      : await this.svc.driverStatement(id, from, to);
    const { pdf, filename } = await this.svc.issue(data as any, 'support');
    this.send(res, pdf, filename);
  }

  /**
   * GET /api/v1/admin/statements?page=&subjectType=&q=
   *
   * Two statements existed in production and nobody could name them.
   * The only admin route issued one for an entity you already knew, and
   * nothing enumerated the table, so "who is holding a SEIRS statement"
   * was unanswerable from admin, from the apps, and from the health
   * probe alike.
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/statements')
  adminStatements(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('subjectType') subjectType?: string,
    @Query('q') q?: string,
  ) {
    return this.svc.adminList({ page, subjectType, q });
  }

  /**
   * Kill a download link now. For a statement emailed to the wrong
   * address: the document is already out, so this limits the damage
   * rather than recalling it, and verification is untouched because the
   * paper somebody holds must keep checking out.
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/statements/:code/revoke')
  adminRevoke(@Param('code') code: string) {
    return this.svc.adminRevoke(code);
  }

  /**
   * Issue a fresh document over the same subject and window, with its
   * own code. Figures are recomputed from today's data, which is the
   * point: a refund landing since should show.
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/statements/:code/reissue')
  adminReissue(@Param('code') code: string) {
    return this.svc.adminReissue(code);
  }

  // ── Public verification ────────────────────────────────────────────────

  /**
   * The reason the PDF is worth anything. Open to the world on purpose:
   * a bank or tax officer holding the document must be able to check it
   * without a SEIRS account.
   */
  /**
   * GET /api/v1/statements/download/:code
   *
   * The emailable half. A statement already carries an unguessable
   * public code, and this serves the stored document against it, so
   * there is no signing infrastructure here and none is needed: the
   * code IS the credential, exactly as it is for tracking and
   * collection links.
   *
   * Public on purpose. An accountant who was forwarded the link has no
   * SEIRS account and is never going to make one.
   */
  @Public()
  @Get('statements/download/:code')
  async download(@Param('code') code: string, @Res() res: Response) {
    const { pdf, filename } = await this.svc.downloadByCode(code);
    this.send(res, pdf, filename);
  }

  @Public()
  @Get('verify/:code')
  verify(@Param('code') code: string) {
    return this.svc.verify(code);
  }
}
