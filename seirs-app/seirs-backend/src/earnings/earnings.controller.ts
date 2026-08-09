import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
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
  dashboard(@Req() req: any) {
    const driverId = req.user?.sub ?? req.user?.userId;
    return this.earnings.getDashboard(driverId);
  }

  @Get('history')
  history(@Req() req: any) {
    const driverId = req.user?.sub ?? req.user?.userId;
    return this.earnings.getHistory(driverId);
  }

  // Optional amountNaira caps the withdrawal: earnings entries are
  // matched FIFO up to that amount, so the actual paid figure can be
  // slightly below the request (whole deliveries only, no row splits).
  // instant=true also unlocks 24h+ old earnings still inside the
  // business-day clearance window, for the catalogue fee.
  @Post('payout')
  payout(@Req() req: any, @Body() body?: { amountNaira?: number; instant?: boolean }) {
    const driverId = req.user?.sub ?? req.user?.userId;
    return this.earnings.payoutDriver(driverId, body?.amountNaira, body?.instant === true);
  }
}
