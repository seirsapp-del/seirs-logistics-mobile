import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  UseGuards, Query, Req, Ip, BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminService } from './admin.service';
import { DemoDataService } from './demo-data.service';
import { MoneyResetService } from './money-reset.service';
import { PartnerStoreService } from '../partner-store/partner-store.service';
import { DriversService } from '../drivers/drivers.service';
import { DriverTripStatus } from '../drivers/driver-trip.entity';
import { PaymentsService } from '../payments/payments.service';
import { DuplicateStatus } from './duplicate-account.entity';
import { ExternalPartnerType } from './external-partner.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { FraudFlagStatus } from '../fraud/fraud-flag.entity';
import { TicketStatus } from '../support/support-ticket.entity';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService:        AdminService,
    private readonly partnerStoreService: PartnerStoreService,
    private readonly driversService:      DriversService,
    private readonly paymentsService:     PaymentsService,
    private readonly demoDataService:     DemoDataService,
    private readonly moneyResetService:   MoneyResetService,
  ) {}

  // ── Overview ──────────────────────────────────────────────────────────────

  // GET /api/v1/admin/stats
  /**
   * Riders who agreed to carry a load and then did not (2026-08-31).
   *
   * A queue for a person. Nothing anywhere in this feature bans anybody
   * automatically, by founder instruction and because it is the only
   * defensible design: a seized bike and a shrug produce the same row.
   */
  @Get('agreement-breaches')
  agreementBreaches(
    @Query('reviewed') reviewed?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAgreementBreaches(
      reviewed === '1' || reviewed === 'true',
      limit ? Number(limit) : 50,
    );
  }

  @Post('agreement-breaches/:id/review')
  reviewAgreementBreach(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { action?: string; note?: string },
  ) {
    return this.adminService.reviewAgreementBreach(id, user?.id, body ?? {});
  }

  @Get('stats')
  getStats() { return this.adminService.getDashboardStats(); }

  /**
   * GET /api/v1/admin/queues
   *
   * Every queue with the age of its OLDEST item, because a count alone
   * cannot be triaged: two KYC reviews from this morning and two from
   * three weeks ago are the same number and opposite problems.
   */
  @Get('queues')
  queues() { return this.adminService.queueAges(); }

  /**
   * GET /api/v1/admin/forward-book
   *
   * What SEIRS has already promised, day by day. The dashboard could see
   * now and the past and nothing at all about committed future work,
   * which is the wrong half of time for a business where people book
   * days ahead.
   */
  @Get('forward-book')
  forwardBook(@Query('days') days?: string) {
    return this.adminService.forwardBook(Number(days ?? 7));
  }

  /**
   * GET /api/v1/admin/demand-by-hour
   *
   * Hour of day against day of week, in Lagos time. A revenue line shows
   * a trend but never says WHEN, and when is what decides staffing. Two
   * live policies depend on this and nothing validated either: riders
   * activate at 4am and scheduling runs 5am to 9pm.
   */
  @Get('demand-by-hour')
  demandByHour(@Query('days') days?: string, @Query('demo') demo?: string) {
    return this.adminService.demandByHour(Number(days ?? 60), demo === '1' || demo === 'true');
  }

  /**
   * GET /api/v1/admin/top-corridors
   *
   * Where the work is, as state pairs derived from coordinates rather
   * than from parsing address text.
   */
  @Get('top-corridors')
  topCorridors(
    @Query('limit') limit?: string,
    @Query('days') days?: string,
    @Query('demo') demo?: string,
  ) {
    return this.adminService.topCorridors(
      Number(limit ?? 8), Number(days ?? 90), demo === '1' || demo === 'true',
    );
  }

  /**
   * GET /api/v1/admin/egress-ip
   *
   * The address this server appears to come from, which is the one that
   * has to sit on Flutterwave's whitelist before any payout will run.
   * Nobody could read it: Railway does not surface egress in the
   * dashboard, and the first real withdrawal failed on 2026-08-27 with
   * "Please enable IP Whitelisting to access this service" and no way to
   * learn which address to allow.
   *
   * Worth re-checking after a redeploy. Railway egress is dynamic unless
   * a static egress add-on is enabled, so a whitelist entry that works
   * today can silently stop matching, and payouts fail with an error
   * that points at Flutterwave rather than at the move.
   */
  @Get('egress-ip')
  async egressIp() {
    const sources = ['https://api.ipify.org', 'https://ifconfig.me/ip'];
    for (const url of sources) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) continue;
        const ip = (await res.text()).trim();
        if (/^[0-9.]+$|^[0-9a-f:]+$/i.test(ip)) {
          return {
            ip,
            source: url,
            note: 'Add this to Flutterwave > Settings > Whitelisted IP addresses. Re-check after each redeploy unless static egress is enabled.',
          };
        }
      } catch { /* try the next source */ }
    }
    throw new BadRequestException('Could not determine the egress IP from any source.');
  }

  // POST /api/v1/admin/demo-data/seed
  // Stages 3 permanent, fully-populated fake accounts (customer/driver/
  // partner store, one per major ethnic group per the sample-data rule)
  // for marketing screenshots and demos. Never runs automatically -
  // triggered only from the admin dashboard's Settings page. Idempotent.
  // Super admin only: this creates an APPROVED driver and an approved
  // partner store, and returns a working password for all three demo
  // logins. That is a set of live credentials, not a fixture.
  @UseGuards(SuperAdminGuard)
  @Post('demo-data/seed')
  seedDemoData() { return this.demoDataService.seedDemoAccounts(); }

  // POST /api/v1/admin/demo-data/seed-cohort
  // A full cast for end-to-end scenario testing: 10 customers, 5 riders,
  // 5 businesses of which 3 hold packages as partner stores.
  //
  // Registering them through the app is impossible without a person at a
  // mailbox: the signup OTP is bcrypt-hashed the instant it is generated,
  // so no route and no query can read a code back out. These accounts are
  // never emailed, so there is no verification to skip.
  //
  // Every account carries isDemo, the flag every money and dispatch guard
  // checks. Returns one rotating password, once. Never runs automatically.
  @Post('demo-data/seed-cohort')
  seedScenarioCohort() { return this.demoDataService.seedScenarioCohort(); }

  /**
   * Set a user's payout bank account on their behalf.
   *
   * Drivers and partners add their own from their app, but support has
   * no way to fix a wrong account for someone who cannot get into that
   * screen, and the live money test needs payout accounts on a driver
   * and a partner who are not the person holding the phone.
   *
   * The account is resolved with Flutterwave first and the RESOLVED name
   * is what gets stored, so a typo lands as a failed lookup here rather
   * than as a transfer into a stranger's account later.
   */
  @UseGuards(SuperAdminGuard)
  @Patch('users/:id/bank-details')
  async setUserBank(
    @Param('id') id: string,
    @Body() body: { bankCode: string; bankName: string; accountNumber: string },
  ) {
    const resolved = await this.paymentsService.verifyBank(body.bankCode, body.accountNumber);
    if (!resolved) {
      throw new BadRequestException('That account could not be resolved. Check the bank and the number.');
    }
    await this.paymentsService.updateBankDetails(id, {
      bankName:          body.bankName,
      bankCode:          body.bankCode,
      bankAccountNumber: body.accountNumber,
      bankAccountName:   resolved.accountName,
    }, true);
    return { updated: true, accountName: resolved.accountName };
  }

  /**
   * Clear every seeded naira before the live money test.
   *
   * Defaults to a dry run that only counts, because this is production
   * and the wipe cannot be undone. Super admin only, same as seeding.
   */
  @UseGuards(SuperAdminGuard)
  @Post('money/reset')
  resetMoney(@Body() body: { confirm?: boolean }) {
    return this.moneyResetService.run(body?.confirm === true);
  }

  // GET /api/v1/admin/dashboard/live
  // Live ops pulse. Powers the anomalies panel, speed-of-service cards,
  // currently-active drivers strip, and hourly demand chart on the admin
  // home page. Client polls this every ~30s.
  @Get('dashboard/live')
  getLiveDashboard() { return this.adminService.getLiveDashboard(); }

  /**
   * GET the monthly targets the dashboard draws its target-vs-actual
   * bars against. Only the PATCH existed, so the home page asked for
   * targets, got a 404, and the bars had nothing to compare against
   * (audit 2026-08-18).
   */
  @Get('dashboard/targets')
  getDashboardTargets() { return this.adminService.getDashboardTargets(); }

  // PATCH /api/v1/admin/dashboard/targets  { revenueNgn?, deliveries? }
  // Updates the monthly targets stored in platform_config that power the
  // target-vs-actual bars on the dashboard.
  @Patch('dashboard/targets')
  setDashboardTargets(@Body() body: { revenueNgn?: number; deliveries?: number }) {
    return this.adminService.setDashboardTargets(body ?? {});
  }

  // GET /api/v1/admin/search?q=<term>&limit=15
  // Universal search across users, drivers, deliveries. Matches on name,
  // email, phone, SEIRS ID (accountId), plate number, tracking code.
  // Powers the admin top-bar quick-search.
  @Get('search')
  universalSearch(@Query() q: { q?: string; limit?: number }) {
    return this.adminService.universalSearch(q.q ?? '', q.limit ?? 15);
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  // GET /api/v1/admin/users?page=1&limit=20&role=customer
  @Get('users')
  getUsers(
    @CurrentUser() admin: any,
    @Query() q: { page?: number; limit?: number; role?: string; search?: string },
  ) {
    return this.adminService.getUsers(q.page ?? 1, q.limit ?? 20, q.role, q.search, admin);
  }

  /**
   * Users with a pending deletion, soonest purge first. Powers /recycle-bin.
   *
   * Declared ABOVE users/:id deliberately. Nest matches routes in
   * declaration order, so with :id first this literal path was captured
   * as an id of "pending-deletion", Postgres rejected it as a UUID, and
   * the recycle bin answered 500 (audit 2026-08-18). Any further literal
   * paths under users/ must go above the wildcard too.
   */
  @Get('users/pending-deletion')
  listPendingDeletions(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.listPendingDeletions(Number(page ?? 1), Number(limit ?? 50));
  }

  // GET /api/v1/admin/users/:id
  @Get('users/:id')
  getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  // GET  /api/v1/admin/admins
  @Get('admins')
  getAdmins() {
    return this.adminService.getAdmins();
  }

  // GET /api/v1/admin/admins/:id/footprint
  // Spec V8. what does this admin own that needs reassigning before
  // we offboard them? Powers the offboarding wizard.
  @Get('admins/:id/footprint')
  getAdminFootprint(@Param('id') id: string) {
    return this.adminService.getAdminFootprint(id);
  }

  // POST /api/v1/admin/admins/:id/offboard
  // Spec V8. graceful offboarding. Rejects with the blocker list
  // unless { force: true } is passed. Audit-logged.
  // Super admin only: removing a colleague's access is the mirror image
  // of granting it, and one disgruntled editor should not be able to
  // lock out the finance team.
  @UseGuards(SuperAdminGuard)
  /**
   * PATCH /api/v1/admin/admins/:id/reactivate
   *
   * The admins page has shipped a "Reactivate Account" button for some
   * time with no route behind it, so it 404d. Super admin only, and it
   * restores the LOGIN only: offboarding wipes the role on purpose, so
   * that reinstatement grants nothing until somebody deliberately
   * re-grants one. Reactivating a former colleague looks far more
   * innocent in a log than granting them super_admin.
   */
  @UseGuards(SuperAdminGuard)
  @Patch('admins/:id/reactivate')
  reactivateAdmin(@Param('id') id: string, @CurrentUser() admin: any, @Req() req: Request) {
    return this.adminService.reactivateAdmin(id, admin, req.ip);
  }

  /**
   * POST /api/v1/admin/admins/:id/reset-password
   *
   * Also had a button and no route. Invalidates the current password and
   * emails a reset link, in that order: invalidating alone locks somebody
   * out, and a link alone leaves the old password working while a laptop
   * is missing. No plaintext credential is ever created or returned.
   */
  /**
   * Send the staff invitation again.
   *
   * Separate from reset-password on purpose: that route sends a
   * password-reset notice, which a new hire never requested and which
   * leaves out their staff ID.
   */
  /**
   * Money the admin can see that the driver cannot, and the reverse.
   *
   * Super admin only: it enumerates unpaid-looking amounts per driver, which
   * is not a list for general admin eyes.
   */
  /**
   * What the seeded ratings and trip counts should really be. Reports only.
   */
  @UseGuards(SuperAdminGuard)
  @Get('drivers/stats-preview')
  driverStatsPreview() {
    return this.adminService.driverStatsPreview();
  }

  @UseGuards(SuperAdminGuard)
  @Get('wallet/earnings-reconciliation')
  earningsReconciliation(@Query('limit') limit?: string) {
    return this.adminService.earningsReconciliation(
      Math.min(Math.max(parseInt(limit ?? '100', 10) || 100, 1), 500),
    );
  }

  @UseGuards(SuperAdminGuard)
  @Post('admins/:id/resend-invite')
  resendAdminInvite(@Param('id') id: string, @CurrentUser() admin: any, @Req() req: Request) {
    return this.adminService.resendAdminInvite(id, admin, req.ip);
  }

  @UseGuards(SuperAdminGuard)
  @Post('admins/:id/reset-password')
  resetAdminPassword(@Param('id') id: string, @CurrentUser() admin: any, @Req() req: Request) {
    return this.adminService.resetAdminPassword(id, admin, req.ip);
  }

  @Post('admins/:id/offboard')
  offboard(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() body: { reason?: string; force?: boolean },
    @Req() req: Request,
  ) {
    return this.adminService.offboardAdmin(id, admin, body ?? {}, req.ip);
  }

  /**
   * POST /api/v1/admin/admins
   *
   * SUPER ADMIN ONLY (2026-08-13). This endpoint takes an adminRole in
   * the body and creates a staff account with it. Behind plain
   * AdminGuard, any staff member at all could call it with
   * adminRole: 'super_admin' and mint themselves an account that
   * outranks every other control in the dashboard.
   *
   * That is privilege escalation, and it silently defeats the approval
   * gates on content, fees and pricing: rather than asking for approval,
   * create a second account that never needs it. Found while adding
   * those gates and closed the same day.
   *
   * changeUserRole is already gated inside the service for admin-level
   * changes; creating one from scratch was the way around it.
   */
  @UseGuards(SuperAdminGuard)
  @Post('admins')
  createAdmin(@Body() body: {
    name?: string;
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
    password?: string;
    adminRole?: string;
    roleId?: string;
  }) {
    return this.adminService.createAdmin(body);
  }

  // PATCH /api/v1/admin/users/:id/role  { role: 'customer' | 'driver' | 'admin' }
  // Role-gated: peer flips (customer <-> driver) need support_agent or higher;
  // anything touching an admin (promote, demote) needs super_admin. Audit-logged.
  @Patch('users/:id/role')
  changeRole(
    @Param('id') id: string,
    @Body('role') role: string,
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.changeUserRole(id, role as any, admin, req.ip);
  }

  // PATCH /api/v1/admin/users/:id  { isActive: false }
  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() body: { isActive?: boolean }) {
    return this.adminService.updateUser(id, body);
  }

  // PATCH /api/v1/admin/users/:id/demo-flag  { "isDemo": false }
  //
  // Arms or disarms an account for real money. isDemo is what every
  // payout, wallet and dispatch guard checks, so clearing it on a seeded
  // account lets that account receive an actual bank transfer while
  // Flutterwave is in live mode. Super admin only, and every call writes
  // an audit row naming the actor. Restore the flag when the run is done.
  @UseGuards(SuperAdminGuard)
  @Patch('users/:id/demo-flag')
  setDemoFlag(
    @Param('id') id: string,
    @Body() body: { isDemo?: boolean },
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    if (typeof body?.isDemo !== 'boolean') {
      throw new BadRequestException('isDemo must be true or false');
    }
    const ip = (req.headers['x-forwarded-for'] as string) ?? req.ip ?? '';
    return this.adminService.setUserDemoFlag(
      id,
      body.isDemo,
      { id: actor.id, name: actor.name },
      ip,
    );
  }

  // Regenerate-account-id endpoint intentionally omitted. See
  // AdminService comment about SEIRS ID immutability + compliance.

  // ── Drivers ───────────────────────────────────────────────────────────────

  // GET /api/v1/admin/drivers?status=pending
  @Get('drivers')
  getDrivers(@Query() q: { page?: number; limit?: number; status?: string; search?: string }) {
    return this.adminService.getDrivers(q.page ?? 1, q.limit ?? 20, q.status, q.search);
  }

  // GET /api/v1/admin/driver-compliance
  // Query-derived acceptance stats (no schema changes): offers = job
  // pings sent to the driver today, accepted = deliveries taken today,
  // lastDeliveryAt = most recent job. Powers last-order-compliance.
  @Get('driver-compliance')
  driverCompliance() {
    return this.adminService.driverComplianceStats();
  }

  // GET /api/v1/admin/drivers/:id
  @Get('drivers/:id')
  getDriverDetail(@Param('id') id: string) {
    return this.adminService.getDriverDetail(id);
  }

  // ── Driver value levels (two-person rule, founder 2026-08-21) ────────

  // GET /api/v1/admin/driver-levels/config → the ten caps + knobs
  @Get('driver-levels/config')
  async driverLevelConfig() {
    const caps = await this.driversService.getLevelCaps();
    return { caps };
  }

  // POST /api/v1/admin/drivers/:id/level-change { toLevel, reason }
  // Any admin may request; nothing moves until a DIFFERENT super-admin
  // approves. Reason is required and audited.
  @Post('drivers/:id/level-change')
  requestDriverLevelChange(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() body: { toLevel: number; reason: string },
  ) {
    return this.driversService.requestLevelChange(id, Number(body?.toLevel), String(body?.reason ?? ''), admin.id);
  }

  // GET /api/v1/admin/driver-level-changes?status=pending&driverId=
  @Get('driver-level-changes')
  listDriverLevelChanges(
    @Query('status') status?: string,
    @Query('driverId') driverId?: string,
  ) {
    return this.driversService.listLevelChanges(status, driverId);
  }

  // POST /api/v1/admin/driver-level-changes/:id/approve | /reject
  // Managers only, and never the requester (enforced in the service).
  @UseGuards(SuperAdminGuard)
  @Post('driver-level-changes/:id/approve')
  approveDriverLevelChange(@Param('id') id: string, @CurrentUser() admin: any, @Body() body: { note?: string }) {
    return this.driversService.decideLevelChange(id, true, admin.id, body?.note);
  }

  @UseGuards(SuperAdminGuard)
  @Post('driver-level-changes/:id/reject')
  rejectDriverLevelChange(@Param('id') id: string, @CurrentUser() admin: any, @Body() body: { note?: string }) {
    return this.driversService.decideLevelChange(id, false, admin.id, body?.note);
  }

  // PATCH /api/v1/admin/drivers/:id/approve
  @Patch('drivers/:id/approve')
  approveDriver(@Param('id') id: string, @CurrentUser() actor: User, @Ip() ip?: string) {
    return this.adminService.updateDriverStatus(id, 'approved', undefined, actor, ip);
  }

  // PATCH /api/v1/admin/drivers/:id/suspend
  // Suspension takes a reason now: stopping somebody earning without
  // recording why is not a decision anybody can review later.
  @Patch('drivers/:id/suspend')
  suspendDriver(
    @Param('id') id: string,
    @CurrentUser() actor: User,
    @Body('reason') reason?: string,
    @Ip() ip?: string,
  ) {
    return this.adminService.updateDriverStatus(id, 'suspended', reason, actor, ip);
  }

  // ── Partner Store applications (hybrid-account redesign 2026-05-11) ───────

  // GET /api/v1/admin/partner-stores/applications. pending KYC reviews
  // GET /api/v1/admin/partner-stores?status=approved|pending_review|suspended|rejected
  // Lists all partner stores across every status. Powers the /partners page.
  @Get('partner-stores')
  listAllPartnerStores(@Query('status') status?: string) {
    return this.partnerStoreService.adminListAllStores(status);
  }

  @Get('partner-stores/applications')
  listPartnerApplications() {
    return this.partnerStoreService.adminListPendingApplications();
  }

  // GET /api/v1/admin/partner-stores/:id. One store, its owner account,
  // and its activity: powers the /partners/[id] detail page. Registered
  // after /applications so the literal route wins over the param.
  @Get('partner-stores/:id')
  getPartnerStore(@Param('id') id: string) {
    return this.partnerStoreService.adminGetStore(id);
  }

  // PATCH /api/v1/admin/partner-stores/:id/approve  { note?: string }
  // Flips PartnerStore.status → APPROVED and User.capabilities.canPartner → true.
  @Patch('partner-stores/:id/approve')
  approvePartnerStore(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() body: { note?: string },
  ) {
    return this.partnerStoreService.adminApproveStore(id, admin.id, body?.note);
  }

  /**
   * Complete a partner's application on their behalf.
   *
   * Approval hard-requires map coordinates and a storefront photo, and
   * both requirements are right: a counter with no location silently
   * never becomes a driver job, and the photo is our evidence that real
   * premises were reviewed. But there was no way for support to supply
   * either. The only remedy was "ask the partner to do it again", which
   * strands every shopkeeper who sent their photo over WhatsApp or
   * typed their address as free text (audit 2026-08-18).
   *
   * This fills the fields; it does NOT approve. A human still reviews
   * and approves, so the evidence requirement stands rather than being
   * quietly bypassed.
   *
   * Coordinates are checked against Nigeria's rough bounding box, so a
   * transposed pair is rejected here rather than sending a driver into
   * the Gulf of Guinea.
   */
  @Patch('partner-stores/:id/application')
  completeStoreApplication(
    @Param('id') id: string,
    @Body() body: { lat?: number; lng?: number; storefrontPhotoUrl?: string },
  ) {
    const patch: { lat?: number; lng?: number; storefrontPhotoUrl?: string } = {};

    if (body?.lat !== undefined || body?.lng !== undefined) {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new BadRequestException('lat and lng must both be numbers.');
      }
      if (lat < 4 || lat > 14 || lng < 2 || lng > 15) {
        throw new BadRequestException(
          `(${lat}, ${lng}) is outside Nigeria. Check the pair is not transposed.`,
        );
      }
      patch.lat = lat;
      patch.lng = lng;
    }

    if (body?.storefrontPhotoUrl !== undefined) {
      const url = String(body.storefrontPhotoUrl).trim();
      if (!/^https?:\/\//i.test(url)) {
        throw new BadRequestException('storefrontPhotoUrl must be an http(s) URL.');
      }
      patch.storefrontPhotoUrl = url;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Nothing to update. Send lat and lng, or storefrontPhotoUrl.');
    }
    return this.adminService.completeStoreApplication(id, patch);
  }

  // PATCH /api/v1/admin/partner-stores/:id/reject  { note: string }
  // Rejection reason is required so user knows what to fix on re-apply.
  @Patch('partner-stores/:id/reject')
  rejectPartnerStore(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() body: { note: string },
  ) {
    return this.partnerStoreService.adminRejectStore(id, admin.id, body?.note);
  }

  // PATCH /api/v1/admin/partner-stores/:id/suspend  { note: string }
  // Reverses the partner capability (founder 2026-08-10): store stops
  // taking packages and the owner's partner UI disappears. Re-approval
  // restores it.
  @Patch('partner-stores/:id/suspend')
  suspendPartnerStore(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Body() body: { note: string },
  ) {
    return this.partnerStoreService.adminSuspendStore(id, admin.id, body?.note);
  }

  // ── Deliveries ────────────────────────────────────────────────────────────

  // GET /api/v1/admin/deliveries?status=pending&page=1
  @Get('deliveries')
  getDeliveries(@Query() q: {
    page?: number; limit?: number; status?: string; search?: string; kind?: string;
    from?: string; to?: string;
  }) {
    return this.adminService.getDeliveries(
      q.page ?? 1, q.limit ?? 20, q.status, q.search, q.kind, q.from, q.to,
    );
  }

  // GET /api/v1/admin/deliveries/:id
  @Get('deliveries/:id')
  getDelivery(@Param('id') id: string) {
    return this.adminService.getDeliveryDetail(id);
  }

  /**
   * Route, stops and live driver position for the map on the order page.
   * Polled while the delivery is active; `live` tells the client when to
   * stop.
   */
  @Get('deliveries/:id/route')
  getDeliveryRoute(@Param('id') id: string) {
    return this.adminService.getDeliveryRoute(id);
  }

  // PATCH /api/v1/admin/deliveries/:id/reassign  { driverId }
  @Patch('deliveries/:id/reassign')
  reassignDelivery(@Param('id') id: string, @Body() body: { driverId: string }) {
    return this.adminService.manualReassign(id, body.driverId);
  }

  // PATCH /api/v1/admin/deliveries/:id/cancel
  @Patch('deliveries/:id/cancel')
  cancelDelivery(@Param('id') id: string) {
    return this.adminService.cancelDelivery(id);
  }

  // ── Pricing control ───────────────────────────────────────────────────────

  // GET /api/v1/admin/pricing
  @Get('pricing')
  getPricing() { return this.adminService.getPricingConfig(); }

  // PATCH /api/v1/admin/pricing
  // Super admin only (2026-08-13). Base fare, per-km rate, platform cut
  // and surge all reprice live deliveries the instant they change, and a
  // wrong platform cut misprices every trip until someone spots it in
  // the numbers. Reading pricing stays open so finance staff can work.
  @UseGuards(SuperAdminGuard)
  @Patch('pricing')
  updatePricing(@Body() body: any) {
    return this.adminService.updatePricingConfig(body);
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  // GET /api/v1/admin/analytics/revenue?days=30
  @Get('analytics/revenue')
  getRevenue(@Query('days') days?: number) {
    return this.adminService.getRevenueByDay(days ? Number(days) : 30);
  }

  // GET /api/v1/admin/analytics/revenue-split: rides vs packages, paid
  // bookings, last 7 days (founder 2026-08-23: two product lines,
  // finally measured apart).
  @Get('analytics/revenue-split')
  getRevenueSplit() {
    return this.adminService.getRevenueSplit();
  }

  // GET /api/v1/admin/analytics/deliveries-by-status
  @Get('analytics/deliveries-by-status')
  getDeliveriesByStatus(@Query('days') days?: string) {
    return this.adminService.getDeliveriesByStatus(days ? Number(days) : undefined);
  }

  // GET /api/v1/admin/analytics/top-drivers?limit=10
  @Get('analytics/top-drivers')
  getTopDrivers(@Query('limit') limit?: number, @Query('days') days?: string) {
    return this.adminService.getTopDrivers(limit ? Number(limit) : 10, days ? Number(days) : undefined);
  }

  // GET /api/v1/admin/analytics/heatmap
  @Get('analytics/heatmap')
  getHeatmap() {
    return this.adminService.getDeliveryHeatmap();
  }

  // GET /api/v1/admin/analytics/deliveries-by-vehicle
  @Get('analytics/deliveries-by-vehicle')
  getDeliveriesByVehicle(@Query('days') days?: string) {
    return this.adminService.getDeliveriesByVehicle(days ? Number(days) : undefined);
  }

  // GET /api/v1/admin/analytics/deliveries-by-category
  @Get('analytics/deliveries-by-category')
  getDeliveriesByCategory(@Query('days') days?: string) {
    return this.adminService.getDeliveriesByCategory(days ? Number(days) : undefined);
  }

  // GET /api/v1/admin/analytics/driver-hours?days=30&limit=10
  @Get('analytics/driver-hours')
  getDriverHours(@Query('days') days?: number, @Query('limit') limit?: number) {
    return this.adminService.getDriverHours(
      days  ? Number(days)  : 30,
      limit ? Number(limit) : 10,
    );
  }

  // GET /api/v1/admin/analytics/referral-funnel
  @Get('analytics/referral-funnel')
  getReferralFunnel() {
    return this.adminService.getReferralFunnel();
  }

  // ── Fraud ─────────────────────────────────────────────────────────────────

  // GET /api/v1/admin/fraud?status=open&page=1
  @Get('fraud')
  getFraudFlags(@Query() q: {
    page?: number; limit?: number; status?: string; from?: string; to?: string;
  }) {
    return this.adminService.getFraudFlags(q.page ?? 1, q.limit ?? 20, q.status, q.from, q.to);
  }

  // PATCH /api/v1/admin/fraud/:id  { status: 'reviewed' | 'dismissed' | 'actioned' }
  @Patch('fraud/:id')
  resolveFraudFlag(
    @Param('id') id: string,
    @Body('status') status: FraudFlagStatus,
    @CurrentUser() admin: any,
  ) {
    return this.adminService.resolveFraudFlag(id, admin.id, status);
  }

  // ── Admin role management ─────────────────────────────────────────────────

  // PATCH /api/v1/admin/admins/:id/role  { adminRole }
  @Patch('admins/:id/role')
  updateAdminRole(
    @Param('id') id: string,
    @Body('adminRole') adminRole: string,
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.updateAdminRole(id, adminRole, admin, req.ip);
  }

  // POST /api/v1/admin/admins/:id/totp/setup
  @Post('admins/:id/totp/setup')
  setupTOTP(@Param('id') id: string) {
    return this.adminService.setupTOTP(id);
  }

  // POST /api/v1/admin/admins/:id/totp/confirm
  @Post('admins/:id/totp/confirm')
  confirmTOTP(@Param('id') id: string, @Body('code') code: string) {
    return this.adminService.confirmTOTP(id, code);
  }

  // PATCH /api/v1/admin/users/:id/suspend
  @Patch('users/:id/suspend')
  // WHY, not just that it happened. suspendUser has always accepted a
  // reason and written it to the audit log, and this route never read
  // one from the body, so every suspension was recorded as anonymous.
  suspendUser(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Req() req: Request,
    @Body('reason') reason?: string,
  ) {
    return this.adminService.suspendUser(id, admin, req.ip, reason);
  }

  // PATCH /api/v1/admin/drivers/:id/reject  { reason? }
  @Patch('drivers/:id/reject')
  rejectDriver(
    @Param('id') id: string,
    @CurrentUser() actor: User,
    @Body('reason') reason?: string,
    @Ip() ip?: string,
  ) {
    return this.adminService.updateDriverStatus(id, 'rejected', reason, actor, ip);
  }

  // GET /api/v1/admin/sign-ins?page=&outcome=&userId=
  // Every admin sign-in attempt, successes and failures. Super admin only:
  // this names every staff member's movements.
  @Get('sign-ins')
  signInLog(
    @CurrentUser() admin: any,
    @Query('page') page?: string,
    @Query('outcome') outcome?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminService.signInLog(admin, Number(page) || 1, { outcome, userId });
  }

  // GET /api/v1/admin/sign-ins/hours?days=30
  // Per-staff summary derived from the log: sign-ins, failures, how many
  // fell outside the permitted window, earliest and latest hour.
  @Get('sign-ins/hours')
  signInHours(@CurrentUser() admin: any, @Query('days') days?: string) {
    return this.adminService.signInHours(admin, Number(days) || 30);
  }

  // ── Support Tickets ───────────────────────────────────────────────────────

  // GET /api/v1/admin/tickets?page=1&status=open
  // Unified on the support module 2026-08-16; priority no longer exists.
  @Get('tickets')
  getTickets(@Query() q: { page?: number; status?: TicketStatus }) {
    return this.adminService.getTickets(q.page ?? 1, q.status);
  }

  // GET /api/v1/admin/tickets/:id
  @Get('tickets/:id')
  getTicket(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.adminService.getTicket(id, admin);
  }

  // PATCH /api/v1/admin/tickets/:id/assign  { agentId }
  @Patch('tickets/:id/assign')
  assignTicket(@Param('id') id: string, @Body('agentId') agentId: string) {
    return this.adminService.assignTicket(id, agentId);
  }

  // PATCH /api/v1/admin/tickets/:id  { status?, resolution? }
  @Patch('tickets/:id')
  updateTicket(
    @Param('id') id: string,
    @Body() body: { status?: TicketStatus; resolution?: string },
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.updateTicket(id, body, admin, req.ip);
  }

  // POST /api/v1/admin/tickets/:id/reply  { message }
  @Post('tickets/:id/reply')
  replyToTicket(
    @Param('id') id: string,
    @Body('message') message: string,
    @CurrentUser() admin: any,
  ) {
    return this.adminService.replyToTicket(id, message, admin);
  }

  // ── Audit Log ─────────────────────────────────────────────────────────────

  // GET /api/v1/admin/audit-log?page=1&adminId=...&action=...
  @Get('audit-log')
  getAuditLog(@Query() q: {
    page?: number; adminId?: string; action?: string; from?: string; to?: string;
  }) {
    return this.adminService.getAuditLog(q.page ?? 1, q.adminId, q.action, q.from, q.to);
  }

  // ── Real-Time Ops Map ─────────────────────────────────────────────────────
  // Polled every 10s by the admin dashboard ops-map page.

  // GET /api/v1/admin/ops-map/drivers
  // Returns all drivers with last-known GPS, regardless of online state
  // (online drivers are styled green, offline gray).
  @Get('ops-map/drivers')
  getOpsMapDrivers() {
    return this.adminService.getOpsMapDrivers();
  }

  // GET /api/v1/admin/ops-map/deliveries
  // Returns all deliveries currently in `assigned`, `picked_up`, or `in_transit`.
  @Get('ops-map/deliveries')
  getOpsMapDeliveries() {
    return this.adminService.getOpsMapDeliveries();
  }

  // GET /api/v1/admin/ops-map/stores
  // Partner stores with coordinates for the map's store layer. Stores
  // without coords (legacy rows) are excluded; the count of excluded
  // rows is returned so ops knows how many need a coord backfill.
  @Get('ops-map/stores')
  getOpsMapStores() {
    return this.adminService.getOpsMapStores();
  }

  // GET /api/v1/admin/ops-map/demand
  // Demand layer: pending (unassigned) requests as points + the last
  // 24h of pickup coordinates for the heat layer. This is what tells
  // ops (and later drivers) WHERE the volume is.
  @Get('ops-map/demand')
  getOpsMapDemand() {
    return this.adminService.getOpsMapDemand();
  }

  // ── Interstate Trip Board (Spec V8 §3.12) ────────────────────────────────
  // GET /api/v1/admin/interstate-trips?status=active
  // Returns declared intercity trips for the ops board. Default: active only.
  @Get('interstate-trips')
  getInterstateTrips(
    @Query('status') status?: DriverTripStatus,
    @Query('from')   from?: string,
    @Query('to')     to?: string,
    @Query('limit')  limit?: string,
  ) {
    /**
     * from and to are departure dates, for audit. Without them the board
     * keeps to recent history on the finished tabs, and shows every live
     * trip on the active one however far ahead it departs.
     *
     * An unparseable date is IGNORED rather than rejected: a filter that
     * 500s on a typo is worse than one that shows too much.
     */
    const parse = (v?: string) => {
      if (!v) return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    return this.driversService.listAllInterstateTrips({
      status: status ?? DriverTripStatus.ACTIVE,
      from:   parse(from),
      to:     parse(to),
      limit:  limit ? Number(limit) : undefined,
    });
  }

  // ── Manual Refund (Spec V8 §3.13. closes A23) ───────────────────────────
  // Admin-initiated refund for a delivery whose escrow is still HELD.
  // Body: { reason: string }. Wraps PaymentsService.refundEscrow which
  // talks to Flutterwave (card) or credits the wallet (wallet method).
  @Post('payments/:deliveryId/refund')
  manualRefund(
    @Param('deliveryId') deliveryId: string,
    @Body() body: { reason: string },
    @CurrentUser() admin: any,
  ) {
    if (!body?.reason || body.reason.trim().length < 6) {
      throw new BadRequestException('Reason (min 6 chars) is required.');
    }
    return this.paymentsService.manualRefund({
      deliveryId,
      adminUserId: admin.id ?? admin.sub,
      reason: body.reason.trim(),
    });
  }

  // ── NDPR admin tools (Spec V8 §3.13. A32 + A33) ─────────────────────────

  // GET /api/v1/admin/users/:id/export
  // Role-gated to compliance roles (super_admin/support_agent/finance_officer)
  // and audit-logged. See AdminService.NDPR_EXPORT_ROLES.
  @Get('users/:id/export')
  exportUserBundle(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.adminExportUserData(id, admin, req.ip);
  }

  // POST /api/v1/admin/users/:id/hard-delete  { reason }
  // Role-gated to super_admin + support_agent only. Audit-logged.
  @Post('users/:id/hard-delete')
  hardDeleteUser(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.adminHardDeleteUser(id, admin, body?.reason ?? '', req.ip);
  }

  // GET /api/v1/admin/vehicle-changes  -> every change awaiting a decision
  @Get('vehicle-changes')
  listVehicleChanges() {
    return this.adminService.listPendingVehicleChanges();
  }

  // POST /api/v1/admin/users/:id/vehicle-change  { approve: boolean }
  // Approve/reject a driver's pending vehicle change. Same review-ticket
  // pattern as bank changes; PII-role gated + audit-logged.
  @Post('users/:id/vehicle-change')
  resolveVehicleChange(
    @Param('id') id: string,
    @Body() body: { approve: boolean; note?: string; rejectedItems?: string[] },
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.resolveVehicleChange(id, body?.approve === true, admin, req.ip, {
      note:          body?.note,
      rejectedItems: Array.isArray(body?.rejectedItems) ? body.rejectedItems : undefined,
    });
  }

  // POST /api/v1/admin/users/:id/bank-change  { approve: boolean }
  // Approve/reject a driver's pending payout-bank change. PII-role gated
  // in the service; audit-logged; resolves the linked support ticket.
  @Post('users/:id/bank-change')
  resolveBankChange(
    @Param('id') id: string,
    @Body() body: { approve: boolean },
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.resolveBankChange(id, body?.approve === true, admin, req.ip);
  }

  // POST /api/v1/admin/deliveries/:id/reopen-chat  { hours?, reason, ticketId? }
  // Support toolkit: re-opens a completed delivery's chat (which auto-
  // closes 1hr after delivery per the PII-freeze TTL) so the two parties
  // can talk during a support investigation. Role-gated to PII_VIEW_ROLES,
  // audit-logged with reason + linked ticket. Window clamped 1-72 hours.
  @Post('deliveries/:id/reopen-chat')
  reopenDeliveryChat(
    @Param('id') id: string,
    @Body() body: { hours?: number; reason: string; ticketId?: string },
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.reopenDeliveryChat(id, admin, body ?? { reason: '' }, req.ip);
  }

  // POST /api/v1/admin/deliveries/:id/close-chat - end a re-open early.
  @Post('deliveries/:id/close-chat')
  closeReopenedChat(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.closeReopenedChat(id, admin, req.ip);
  }

  // POST /api/v1/admin/users/:id/reveal-identity-docs
  // Explicit PII-view action. Returns the identity document URLs (front,
  // back, selfie). Role-gated to super_admin + support_agent +
  // driver_compliance. Every call writes a pii_view audit row so we can
  // prove who viewed whose ID and when.
  @Post('users/:id/reveal-identity-docs')
  revealIdentityDocs(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.revealIdentityDocs(id, admin, req.ip);
  }


  // POST /api/v1/admin/users/:id/soft-delete  { reason }
  // Admin schedules a deletion on behalf of a user with the same 30-day
  // grace as self-service. Reversible via cancel-deletion until the
  // cron runs. Audit-logged. Role-gated to super_admin + support_agent.
  @Post('users/:id/soft-delete')
  softDeleteUser(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.adminSoftDeleteUser(id, admin, body?.reason ?? '', req.ip);
  }

  // POST /api/v1/admin/users/:id/cancel-deletion
  // Admin cancels a pending deletion (self- or admin-scheduled). Restores
  // the user to a normal active state. Audit-logged.
  @Post('users/:id/cancel-deletion')
  adminCancelDeletion(
    @Param('id') id: string,
    @CurrentUser() admin: any,
    @Req() req: Request,
  ) {
    return this.adminService.adminCancelUserDeletion(id, admin, req.ip);
  }

  // ── Duplicate accounts (A21) ─────────────────────────────────────────────
  @Get('duplicates')
  listDuplicates(
    @Query('status') status?: DuplicateStatus,
    @Query('page')   page?: string,
    @Query('limit')  limit?: string,
  ) {
    return this.adminService.listDuplicates(status, Number(page ?? 1), Number(limit ?? 50));
  }

  @Post('duplicates/scan')
  scanDuplicates() {
    return this.adminService.scanForDuplicates();
  }

  @Post('duplicates/:id/merge')
  mergeDuplicate(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.adminService.mergeDuplicate(id, admin.id ?? admin.sub);
  }

  @Post('duplicates/:id/dismiss')
  dismissDuplicate(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.adminService.dismissDuplicate(id, admin.id ?? admin.sub);
  }

  // ── External partner directory (A40 + A41) ───────────────────────────────
  @Get('external-partners')
  listExternalPartners(@Query('type') type?: ExternalPartnerType) {
    return this.adminService.listExternalPartners(type);
  }

  @Post('external-partners')
  createExternalPartner(@Body() body: any) {
    return this.adminService.createExternalPartner(body);
  }

  @Patch('external-partners/:id')
  updateExternalPartner(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateExternalPartner(id, body);
  }

  @Delete('external-partners/:id')
  deleteExternalPartner(@Param('id') id: string) {
    return this.adminService.removeExternalPartner(id);
  }

  // ── Wallet / Payouts (admin ops view) ─────────────────────────────────────

  @Get('wallet/summary')
  walletSummary() {
    return this.adminService.walletSummary();
  }

  @Get('wallet/pending-payouts')
  listPendingPayouts(@Query('limit') limit?: string) {
    return this.adminService.listPendingPayouts(Number(limit ?? 50));
  }

  @Get('wallet/held-earnings')
  listHeldEarnings(@Query('limit') limit?: string) {
    return this.adminService.listHeldEarnings(Number(limit ?? 50));
  }

  @Get('wallet/recent-withdrawals')
  listRecentWithdrawals(@Query('limit') limit?: string) {
    return this.adminService.listRecentWithdrawals(Number(limit ?? 50));
  }

  /**
   * GET /api/v1/admin/wallet/stuck-refunds
   *
   * Money SEIRS is holding that belongs to a customer: a payment still
   * in escrow against a delivery that is cancelled or failed. Should be
   * empty. Anything here is a refund that was owed and never issued.
   */
  /**
   * POST /api/v1/admin/wallet/payouts/reconcile
   *
   * Record what actually reached the bank for a payout made before the
   * ledger table existed. The figure is read off Flutterwave by a human
   * and entered, never derived, because a guess that reconciles is worse
   * than a gap that does not.
   */
  @Post('wallet/payouts/reconcile')
  reconcilePayout(
    @Body() body: { earningId: string; sentNgn: number; holdbackNgn?: number; flutterwaveTransferId?: string },
    @CurrentUser() admin: any,
    @Ip() ip?: string,
  ) {
    return this.adminService.reconcilePayout(body, admin, ip);
  }

  @Get('wallet/stuck-refunds')
  stuckRefunds(@Query('limit') limit?: string) {
    return this.adminService.stuckRefunds(Number(limit ?? 100));
  }

  @Patch('wallet/earnings/:id/release')
  releaseHeldEarning(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.adminService.releaseHeldEarning(id, admin);
  }

  /**
   * POST /api/v1/admin/wallet/earnings/correction
   * { "driverUserId": "...", "amountNgn": 146.97, "reason": "..." }
   *
   * Put money back into a rider's balance after a settlement error.
   * Nothing could do this: earnings could be held and released, but an
   * amount the platform took and failed to send had no remedy in the
   * product. Super admin only, capped, and every call is audited with
   * the reason, because this mints a withdrawable balance.
   */
  @UseGuards(SuperAdminGuard)
  @Post('wallet/earnings/correction')
  creditEarningCorrection(
    @Body() body: { driverUserId?: string; amountNgn?: number; reason?: string },
    @CurrentUser() admin: User,
    @Req() req: Request,
  ) {
    if (!body?.driverUserId) throw new BadRequestException('driverUserId is required');
    const ip = (req.headers['x-forwarded-for'] as string) ?? req.ip ?? '';
    return this.adminService.creditEarningCorrection(
      body.driverUserId,
      Number(body.amountNgn),
      body.reason ?? '',
      admin,
      ip,
    );
  }

  // ── Referrals ─────────────────────────────────────────────────────────────

  @Get('referrals')
  listReferrals(@Query('limit') limit?: string) {
    return this.adminService.listReferrals(Number(limit ?? 100));
  }

  @Get('referrals/summary')
  referralsSummary() {
    return this.adminService.referralsSummary();
  }

  // ── Platform Config (settings) ────────────────────────────────────────────

  @Get('settings')
  listPlatformConfig() {
    return this.adminService.listPlatformConfig();
  }

  @Patch('settings/:key')
  updatePlatformConfig(
    @Param('key') key: string,
    @Body() body: { value: string },
    @CurrentUser() admin: any,
  ) {
    if (typeof body?.value !== 'string') {
      throw new BadRequestException('value is required.');
    }
    return this.adminService.updatePlatformConfig(key, body.value, admin);
  }
}
