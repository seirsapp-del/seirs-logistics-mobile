import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, UploadedFile, UseInterceptors, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessAccountGuard, PartnerStoreGuard } from '../common/guards/business-account.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { BusinessService } from './business.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class BusinessController {
  constructor(private readonly svc: BusinessService) {}

  // ─── Business Sender ─────────────────────────────────────────────────────────

  @UseGuards(BusinessAccountGuard)
  @Get('business/dashboard')
  businessDashboard(@CurrentUser() user: User) {
    return this.svc.businessDashboard(user.id);
  }

  // Yearly spend statement for company accounting / FIRS expense records
  // (founder direction 2026-08-10: business + partner need statements
  // like drivers do). Aggregates successful payments by year.
  @UseGuards(BusinessAccountGuard)
  @Get('business/statement')
  businessStatement(@CurrentUser() user: User) {
    return this.svc.getSpendStatement(user.id);
  }

  @UseGuards(BusinessAccountGuard)
  @Get('business/deliveries')
  getDeliveries(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.getDeliveries(user.id, page, status, search);
  }

  /**
   * NOT BusinessAccountGuard. A driver has no businessAccountId, so this
   * threw "Business account required." at the one person who has to walk
   * the route, and the whole multi-drop feature was dead on the driver
   * side (founder hit it on the phone 2026-08-24: Trips, then the active
   * delivery). JwtAuthGuard is class-level, and the service checks the
   * actor against the delivery's own customer or assigned driver, which
   * is the check that actually matters here.
   */
  @Get('business/deliveries/:id')
  getDeliveryById(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.getDeliveryById(id, user.id);
  }

  @UseGuards(BusinessAccountGuard)
  @Post('business/deliveries')
  createDelivery(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.createDelivery(user.id, body);
  }

  // Stop-level driver transitions. The driver app POSTs these as the
  // driver walks through the multi-stop route. The actor is checked in
  // the service against the parent delivery's assigned driver: the old
  // comment here claimed dispatch had already done that, and it had not.
  /**
   * NOT BusinessAccountGuard. A driver has no businessAccountId, so this
   * threw "Business account required." at the one person who has to walk
   * the route, and the whole multi-drop feature was dead on the driver
   * side (founder hit it on the phone 2026-08-24: Trips, then the active
   * delivery). JwtAuthGuard is class-level, and the service checks the
   * actor against the delivery's own customer or assigned driver, which
   * is the check that actually matters here.
   */
  @Post('business/deliveries/:deliveryId/stops/:stopId/arrived')
  markStopArrived(
    @Param('deliveryId') deliveryId: string,
    @Param('stopId')     stopId: string,
    @CurrentUser()       user: User,
  ) {
    return this.svc.markStopArrived(deliveryId, stopId, user.id);
  }

  /**
   * NOT BusinessAccountGuard. A driver has no businessAccountId, so this
   * threw "Business account required." at the one person who has to walk
   * the route, and the whole multi-drop feature was dead on the driver
   * side (founder hit it on the phone 2026-08-24: Trips, then the active
   * delivery). JwtAuthGuard is class-level, and the service checks the
   * actor against the delivery's own customer or assigned driver, which
   * is the check that actually matters here.
   */
  @Post('business/deliveries/:deliveryId/stops/:stopId/delivered')
  markStopDelivered(
    @Param('deliveryId') deliveryId: string,
    @Param('stopId')     stopId: string,
    @CurrentUser()       user: User,
    @Body() body: { proofPhotoUrls?: string[]; recipientSignatureUrl?: string },
  ) {
    return this.svc.markStopDelivered(
      deliveryId, stopId, body?.proofPhotoUrls, body?.recipientSignatureUrl, user.id,
    );
  }

  // Bulk CSV upload removed 2026-08-24 (founder decision). The
  // multi-package Send flow covers the same need and works.

  @UseGuards(BusinessAccountGuard)
  @Get('business/wallet')
  getWallet(@CurrentUser() user: User) {
    return this.svc.getWallet(user.id);
  }

  // POST business/wallet/fund is gone (2026-08-16): we are not a bank.

  @UseGuards(BusinessAccountGuard)
  @Get('business/wallet/transactions')
  getTransactions(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.svc.getTransactions(user.id, page);
  }

  /**
   * PATCH /api/v1/business/deliveries/:id
   * What may change narrows as the order progresses: everything while
   * unpaid, destination and receiver until a driver is assigned,
   * instructions until pickup, nothing after.
   */
  @UseGuards(BusinessAccountGuard)
  @Patch('business/deliveries/:id')
  editDelivery(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.svc.editMyDelivery(user.id, id, body ?? {});
  }

  @UseGuards(BusinessAccountGuard)
  @Get('business/loyalty')
  getLoyalty(@CurrentUser() user: User) {
    return this.svc.getLoyalty(user.id);
  }

  // Spec V8 - B13 Cancel a scheduled/pending delivery.
  // Body: { reason?: string }. Owner/manager/dispatcher allowed.
  @UseGuards(BusinessAccountGuard)
  @Post('business/deliveries/:id/cancel')
  cancelDelivery(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.svc.cancelMyDelivery(user.id, id, body?.reason);
  }

  // Spec V8 - B21 Business profile editor.
  // GET returns the full BusinessAccount snapshot.
  // PATCH owner-only; takes any subset of the editable fields.
  @UseGuards(BusinessAccountGuard)
  @Get('business/account')
  getBusinessAccount(@CurrentUser() user: User) {
    return this.svc.getBusinessProfile(user.id);
  }

  @UseGuards(BusinessAccountGuard)
  @Patch('business/account')
  updateBusinessAccount(@CurrentUser() user: User, @Body() body: {
    companyName?: string; rcNumber?: string;
    businessAddress?: string; state?: string; city?: string; streetAddress?: string;
  }) {
    return this.svc.updateBusinessProfile(user.id, body);
  }

  // ─── Recurring delivery templates (Spec V8 §4.2) ──────────────────────────
  @UseGuards(BusinessAccountGuard)
  @Get('business/recurring-templates')
  listRecurring(@CurrentUser() user: User) {
    return this.svc.listRecurringTemplates(user.id);
  }

  @UseGuards(BusinessAccountGuard)
  @Post('business/recurring-templates')
  createRecurring(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.createRecurringTemplate(user.id, body);
  }

  @UseGuards(BusinessAccountGuard)
  @Patch('business/recurring-templates/:id')
  toggleRecurring(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.svc.toggleRecurringTemplate(user.id, id, !!body.isActive);
  }

  @UseGuards(BusinessAccountGuard)
  @Delete('business/recurring-templates/:id')
  deleteRecurring(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.deleteRecurringTemplate(user.id, id);
  }

  // ─── Partner Store ────────────────────────────────────────────────────────────

  @UseGuards(PartnerStoreGuard)
  @Get('partner/dashboard')
  partnerDashboard(@CurrentUser() user: User) {
    return this.svc.partnerDashboard(user.id);
  }

  // Yearly paid-payout statement for the partner's records/taxes.
  // GET /api/v1/business/partner/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Bank-statement shape: every line in the window with a running total.
  // Defaults to the last 90 days.
  @UseGuards(PartnerStoreGuard)
  @Get('partner/statement')
  getPartnerStatement(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getPartnerPayoutStatement(user.id, from, to);
  }

  @UseGuards(PartnerStoreGuard)
  @Get('partner/inventory')
  getInventory(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
  ) {
    return this.svc.getInventory(user.id, status, page);
  }

  @UseGuards(PartnerStoreGuard)
  @Post('partner/scan')
  scanPackage(@CurrentUser() user: User, @Body('qrCode') qrCode: string) {
    return this.svc.scanPackage(user.id, qrCode);
  }

  @UseGuards(PartnerStoreGuard)
  @Patch('partner/packages/:id/collect')
  markCollected(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.markCollected(user.id, id);
  }

  @UseGuards(PartnerStoreGuard)
  @Get('partner/earnings')
  getEarnings(
    @CurrentUser() user: User,
    @Query('period') period: 'week' | 'month' = 'week',
  ) {
    return this.svc.getEarnings(user.id, period);
  }

  @UseGuards(PartnerStoreGuard)
  @Get('partner/settings')
  getSettings(@CurrentUser() user: User) {
    return this.svc.getSettings(user.id);
  }

  @UseGuards(PartnerStoreGuard)
  @Patch('partner/settings')
  updateSettings(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.updateSettings(user.id, body);
  }
}


function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}
