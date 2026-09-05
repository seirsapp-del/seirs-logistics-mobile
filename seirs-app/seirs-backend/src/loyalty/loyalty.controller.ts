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
 * triggered by other services - not exposed publicly to prevent grinding.
 */
@UseGuards(JwtAuthGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('balance')
  async balance(@Req() req: any) {
    const userId = req.user?.id ?? req.user?.sub ?? req.user?.userId;
    /*
     * `series` is 30 days of points per day, aggregated in SQL.
     *
     * The Rewards chart used to build its bars out of `history`, which is
     * capped at 20 rows: an active customer's chart quietly lost every day
     * older than their twentieth most recent entry and drew those days as
     * empty. Sending the aggregate means the chart is exact at any volume,
     * and it rides on a request both Rewards screens already make.
     */
    const [balance, tier, history, series] = await Promise.all([
      this.loyalty.getBalance(userId),
      this.loyalty.getTier(userId),
      this.loyalty.getHistory(userId, 20),
      this.loyalty.getDailySeries(userId, 30),
    ]);
    return { balance, tier, history, series };
  }

  // GET /loyalty/my-referrals
  // Returns the current user's referral history: everyone they referred plus
  // whether the referral bonus has been paid. Powers the customer app's
  // Refer & Earn screen. Points-based; there is no NGN cash bonus.
  @Get('my-referrals')
  async myReferrals(@Req() req: any) {
    const userId = req.user?.id ?? req.user?.sub ?? req.user?.userId;
    return this.loyalty.getMyReferrals(userId);
  }

  @Post('redeem')
  async redeem(@Req() req: any, @Body() body: { type: 'discount_500' | 'free_delivery' | 'priority' | 'insurance'; deliveryId?: string }) {
    const userId = req.user?.id ?? req.user?.sub ?? req.user?.userId;
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
