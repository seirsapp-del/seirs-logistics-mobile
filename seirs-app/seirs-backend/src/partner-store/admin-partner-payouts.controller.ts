import {
  Controller, Get, Post, Param, Body, UseGuards,
} from '@nestjs/common';
import { PartnerPayoutsService } from './partner-payouts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

/**
 * Settling what a counter has earned.
 *
 * Separate from the document review deliberately: one answers "is this
 * shop who it says it is", the other moves money. They are done by
 * different people on different days and should not share a screen or a
 * permission.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/partner-payouts')
export class AdminPartnerPayoutsController {
  constructor(private readonly payouts: PartnerPayoutsService) {}

  /**
   * POST /api/v1/admin/partner-payouts/:id/pay
   *
   * The only route in the partner code that moves money out. Idempotent
   * on a reference derived from the payout id, and a refused transfer
   * leaves the payout unpaid with the provider's reason recorded rather
   * than marking it settled.
   */
  @Post(':id/pay')
  pay(@CurrentUser() user: User, @Param('id') id: string) {
    return this.payouts.payOne(id, user.id);
  }

  // GET /api/v1/admin/partner-payouts/bank-changes
  // Shops waiting on a replacement account, oldest first.
  @Get('bank-changes')
  bankChanges() {
    return this.payouts.pendingBankChanges();
  }

  // POST /api/v1/admin/partner-payouts/bank-changes/:storeId  { approve, reason? }
  // Approving swaps the live account. Refusing clears the request and
  // leaves the shop being paid where it was already being paid.
  @Post('bank-changes/:storeId')
  decideBankChange(
    @CurrentUser() user: User,
    @Param('storeId') storeId: string,
    @Body() body: { approve: boolean; reason?: string },
  ) {
    return this.payouts.decideBankChange(storeId, user.id, !!body?.approve, body?.reason);
  }
}
