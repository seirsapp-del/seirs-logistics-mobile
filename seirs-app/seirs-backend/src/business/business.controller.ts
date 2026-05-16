import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, UploadedFile, UseInterceptors, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { BusinessService } from './business.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class BusinessController {
  constructor(private readonly svc: BusinessService) {}

  // ─── Business Sender ─────────────────────────────────────────────────────────

  @Get('business/dashboard')
  businessDashboard(@CurrentUser() user: User) {
    return this.svc.businessDashboard(user.id);
  }

  @Get('business/deliveries')
  getDeliveries(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('status') status?: string,
  ) {
    return this.svc.getDeliveries(user.id, page, status);
  }

  @Get('business/deliveries/:id')
  getDeliveryById(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.getDeliveryById(id, user.id);
  }

  @Post('business/deliveries')
  createDelivery(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.createDelivery(user.id, body);
  }

  // Stop-level driver transitions. The driver app POSTs these as the
  // driver walks through the multi-stop route. Driver auth/identity is
  // checked at the matching/dispatch layer — here we accept the request
  // from any authenticated user and let the service validate ownership.
  @Post('business/deliveries/:deliveryId/stops/:stopId/arrived')
  markStopArrived(@Param('deliveryId') deliveryId: string, @Param('stopId') stopId: string) {
    return this.svc.markStopArrived(deliveryId, stopId);
  }

  @Post('business/deliveries/:deliveryId/stops/:stopId/delivered')
  markStopDelivered(
    @Param('deliveryId') deliveryId: string,
    @Param('stopId')     stopId: string,
    @Body() body: { proofPhotoUrls?: string[]; recipientSignatureUrl?: string },
  ) {
    return this.svc.markStopDelivered(deliveryId, stopId, body?.proofPhotoUrls, body?.recipientSignatureUrl);
  }

  @Post('business/deliveries/csv')
  @UseInterceptors(FileInterceptor('file'))
  uploadCsv(@CurrentUser() user: User, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error('No file uploaded.');
    const text = file.buffer.toString('utf8');
    const rows = parseCsv(text);
    return this.svc.uploadCsvDeliveries(user.id, rows);
  }

  @Get('business/wallet')
  getWallet(@CurrentUser() user: User) {
    return this.svc.getWallet(user.id);
  }

  @Post('business/wallet/fund')
  fundWallet(@CurrentUser() user: User, @Body('amount') amount: number) {
    return this.svc.fundWallet(user.id, amount);
  }

  @Get('business/wallet/transactions')
  getTransactions(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.svc.getTransactions(user.id, page);
  }

  @Get('business/team')
  getTeam(@CurrentUser() user: User) {
    return this.svc.getTeam(user.id);
  }

  @Post('business/team/invite')
  inviteTeamMember(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.inviteTeamMember(user.id, body);
  }

  @Delete('business/team/:id')
  removeTeamMember(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.removeTeamMember(user.id, id);
  }

  @Get('business/loyalty')
  getLoyalty(@CurrentUser() user: User) {
    return this.svc.getLoyalty(user.id);
  }

  // Spec V8 — B13 Cancel a scheduled/pending delivery.
  // Body: { reason?: string }. Owner/manager/dispatcher allowed.
  @Post('business/deliveries/:id/cancel')
  cancelDelivery(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.svc.cancelMyDelivery(user.id, id, body?.reason);
  }

  // Spec V8 — B21 Business profile editor.
  // GET returns the full BusinessAccount snapshot + caller's teamRole.
  // PATCH owner-only; takes any subset of the editable fields.
  @Get('business/account')
  getBusinessAccount(@CurrentUser() user: User) {
    return this.svc.getBusinessProfile(user.id);
  }

  @Patch('business/account')
  updateBusinessAccount(@CurrentUser() user: User, @Body() body: {
    companyName?: string; rcNumber?: string;
    businessAddress?: string; state?: string; city?: string; streetAddress?: string;
  }) {
    return this.svc.updateBusinessProfile(user.id, body);
  }

  // ─── Recurring delivery templates (Spec V8 §4.2) ──────────────────────────
  @Get('business/recurring-templates')
  listRecurring(@CurrentUser() user: User) {
    return this.svc.listRecurringTemplates(user.id);
  }

  @Post('business/recurring-templates')
  createRecurring(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.createRecurringTemplate(user.id, body);
  }

  @Patch('business/recurring-templates/:id')
  toggleRecurring(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.svc.toggleRecurringTemplate(user.id, id, !!body.isActive);
  }

  @Delete('business/recurring-templates/:id')
  deleteRecurring(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.deleteRecurringTemplate(user.id, id);
  }

  // ─── Partner Store ────────────────────────────────────────────────────────────

  @Get('partner/dashboard')
  partnerDashboard(@CurrentUser() user: User) {
    return this.svc.partnerDashboard(user.id);
  }

  @Get('partner/inventory')
  getInventory(
    @CurrentUser() user: User,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
  ) {
    return this.svc.getInventory(user.id, status, page);
  }

  @Post('partner/scan')
  scanPackage(@CurrentUser() user: User, @Body('qrCode') qrCode: string) {
    return this.svc.scanPackage(user.id, qrCode);
  }

  @Patch('partner/packages/:id/collect')
  markCollected(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.markCollected(user.id, id);
  }

  @Get('partner/earnings')
  getEarnings(
    @CurrentUser() user: User,
    @Query('period') period: 'week' | 'month' = 'week',
  ) {
    return this.svc.getEarnings(user.id, period);
  }

  @Get('partner/settings')
  getSettings(@CurrentUser() user: User) {
    return this.svc.getSettings(user.id);
  }

  @Patch('partner/settings')
  updateSettings(@CurrentUser() user: User, @Body() body: any) {
    return this.svc.updateSettings(user.id, body);
  }
}

// Simple CSV parser: supports quoted fields
function parseCsv(text: string): Array<{ recipientName: string; recipientPhone: string; address?: string }> {
  const lines = text.trim().split('\n').slice(1); // skip header
  return lines
    .map((line) => {
      const cols = splitCsvLine(line);
      return {
        recipientName:  (cols[0] ?? '').trim(),
        recipientPhone: (cols[1] ?? '').trim(),
        address:        (cols[2] ?? '').trim(),
      };
    })
    .filter((r) => r.recipientName);
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
