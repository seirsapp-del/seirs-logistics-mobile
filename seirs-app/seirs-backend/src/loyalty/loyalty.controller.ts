import { Controller, Get, Post, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LoyaltyService } from './loyalty.service';

/**
 * Customer-facing loyalty points endpoints.
 *
 *   GET  /loyalty/balance   → current balance + tier + history
 *   POST /loyalty/redeem    → redeem points (₦500 off, free delivery, etc.)
 *
 * Internal earn calls (delivery_complete, referral_bonus, rate_driver) are
 * triggered by other services — not exposed publicly to prevent grinding.
 */
@UseGuards(JwtAuthGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('balance')
  async balance(@Req() req: any) {
    const userId = req.user?.sub ?? req.user?.userId;
    const [balance, tier, history] = await Promise.all([
      this.loyalty.getBalance(userId),
      this.loyalty.getTier(userId),
      this.loyalty.getHistory(userId, 20),
    ]);
    return { balance, tier, history };
  }

  @Post('redeem')
  async redeem(@Req() req: any, @Body() body: { type: 'discount_500' | 'free_delivery' | 'priority' | 'insurance'; deliveryId?: string }) {
    const userId = req.user?.sub ?? req.user?.userId;
    const cost = REDEMPTION_COSTS[body.type];
    if (cost == null) throw new BadRequestException('Unknown redemption type.');

    const reason = REDEMPTION_REASONS[body.type];
    const entry = await this.loyalty.redeem({ userId, cost, reason, deliveryId: body.deliveryId });
    const newBalance = await this.loyalty.getBalance(userId);
    return { redeemedPoints: cost, newBalance, entryId: entry.id };
  }
}

const REDEMPTION_COSTS: Record<string, number> = {
  discount_500:  500,
  free_delivery: 1000,
  priority:      300,
  insurance:     200,
};

const REDEMPTION_REASONS = {
  discount_500:  'redeem_discount',
  free_delivery: 'redeem_free_delivery',
  priority:      'redeem_priority',
  insurance:     'redeem_insurance',
} as const;
