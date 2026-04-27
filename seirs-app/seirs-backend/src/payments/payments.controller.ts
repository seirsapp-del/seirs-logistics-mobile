import {
  Body, Controller, Get, Param, Post, Patch,
  UseGuards, RawBodyRequest, Req, Headers,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { PaymentMethod } from './payment.entity';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly deliveriesService: DeliveriesService,
  ) {}

  // ── Customer endpoints ───────────────────────────────────────────────────

  // POST /api/v1/payments/initiate
  // Body: { deliveryId, method: 'card' | 'wallet' | 'cash_on_delivery' }
  @UseGuards(JwtAuthGuard)
  @Post('initiate')
  async initiatePayment(
    @CurrentUser() user: User,
    @Body() body: { deliveryId: string; method: PaymentMethod },
  ) {
    const delivery = await this.deliveriesService.findById(body.deliveryId);

    switch (body.method) {
      case PaymentMethod.CARD:
        return this.paymentsService.initiateCardPayment(delivery, user);

      case PaymentMethod.WALLET:
        return this.paymentsService.payFromWallet(delivery, user);

      case PaymentMethod.COD:
        return this.paymentsService.initiateCOD(delivery, user);

      default:
        return { error: 'Unsupported payment method' };
    }
  }

  // POST /api/v1/payments/verify/:txRef
  @UseGuards(JwtAuthGuard)
  @Post('verify/:txRef')
  async verifyPayment(@Param('txRef') txRef: string) {
    return this.paymentsService.confirmFlutterwavePayment(txRef);
  }

  // GET /api/v1/payments/wallet
  @UseGuards(JwtAuthGuard)
  @Get('wallet')
  getWallet(@CurrentUser() user: User) {
    return this.paymentsService.getWalletBalance(user.id);
  }

  // GET /api/v1/payments/history
  @UseGuards(JwtAuthGuard)
  @Get('history')
  getHistory(@CurrentUser() user: User) {
    return this.paymentsService.getPaymentHistory(user.id);
  }

  // ── Driver endpoints ─────────────────────────────────────────────────────

  // GET /api/v1/payments/banks — Nigerian bank list for driver bank setup
  @UseGuards(JwtAuthGuard)
  @Get('banks')
  getNigerianBanks() {
    return this.paymentsService.getNigerianBanks();
  }

  // POST /api/v1/payments/withdraw  { amountNaira: 5000 }
  @UseGuards(JwtAuthGuard)
  @Post('withdraw')
  requestWithdrawal(
    @CurrentUser() user: User,
    @Body() body: { amountNaira: number },
  ) {
    return this.paymentsService.requestWithdrawal(user.id, body.amountNaira);
  }

  // PATCH /api/v1/payments/bank-details
  @UseGuards(JwtAuthGuard)
  @Patch('bank-details')
  updateBankDetails(
    @CurrentUser() user: User,
    @Body() body: { bankName: string; bankCode: string; bankAccountNumber: string; bankAccountName: string },
  ) {
    return this.paymentsService.updateBankDetails(user.id, body);
  }

  // ── Flutterwave Webhook (no JWT — Flutterwave server calls this) ───────────
  // POST /api/v1/payments/webhook/flutterwave
  // Set FLW_WEBHOOK_HASH in your env to the same Secret Hash configured in
  // Flutterwave dashboard → Settings → Webhooks
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhook/flutterwave')
  async flutterwaveWebhook(
    @Body() body: any,
    @Headers('verif-hash') receivedHash: string,
  ) {
    const expectedHash = process.env.FLW_WEBHOOK_HASH ?? '';

    // Reject immediately if webhook secret is not configured
    if (!expectedHash) {
      return { received: false, reason: 'webhook not configured' };
    }

    // Timing-safe comparison prevents hash oracle / timing attacks
    let hashesMatch = false;
    try {
      hashesMatch = timingSafeEqual(
        Buffer.from(receivedHash  ?? '', 'utf8'),
        Buffer.from(expectedHash,       'utf8'),
      );
    } catch {
      hashesMatch = false;
    }

    if (!hashesMatch) {
      return { received: false };
    }

    // Idempotency: confirmFlutterwavePayment already no-ops if already SUCCESS
    if (body.event === 'charge.completed' && body.data?.status === 'successful') {
      const txRef = body.data?.tx_ref;
      if (txRef) {
        await this.paymentsService.confirmFlutterwavePayment(txRef);
      }
    }

    return { received: true };
  }
}
