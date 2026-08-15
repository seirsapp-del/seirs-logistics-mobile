import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { EarningsService } from './earnings.service';

/**
 * Driver-facing earnings endpoints.
 *
 *   GET  /earnings/dashboard  → today/week/all-time + pending/available totals
 *   GET  /earnings/history    → recent earnings entries
 *   POST /earnings/payout     → request immediate payout (subject to caps + min)
 */
@UseGuards(JwtAuthGuard)
@Controller('earnings')
export class EarningsController {
  constructor(private readonly earnings: EarningsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: User) {
    return this.earnings.getDashboard(user.id);
  }

  @Get('history')
  history(@CurrentUser() user: User) {
    return this.earnings.getHistory(user.id);
  }

  // Optional amountNaira caps the withdrawal: earnings entries are
  // matched FIFO up to that amount, so the actual paid figure can be
  // slightly below the request (whole deliveries only, no row splits).
  // instant=true also unlocks 24h+ old earnings still inside the
  // business-day clearance window, for the catalogue fee.
  @Post('payout')
  payout(@CurrentUser() user: User, @Body() body?: { amountNaira?: number; instant?: boolean }) {
    return this.earnings.payoutDriver(user.id, body?.amountNaira, body?.instant === true);
  }
}
