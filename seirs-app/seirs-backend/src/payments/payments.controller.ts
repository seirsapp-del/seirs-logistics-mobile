import {
  Body, Controller, Get, Param, Post, Patch, Delete,
  UseGuards, RawBodyRequest, Req, Headers,
  HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'crypto';
import { PaymentsService } from './payments.service';
import { FlutterwaveService } from './flutterwave.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MaintenanceGuard } from '../maintenance/maintenance.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { PaymentMethod } from './payment.entity';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService:   PaymentsService,
    private readonly deliveriesService: DeliveriesService,
    private readonly flutterwave:       FlutterwaveService,
  ) {}

  // ── Saved cards (one-tap reuse via Flutterwave tokens) ───────────────────

  @UseGuards(JwtAuthGuard)
  @Get('saved-cards')
  listSavedCards(@CurrentUser() user: User) {
    return this.paymentsService.listSavedCards(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('saved-cards/:id/default')
  async setDefaultCard(@CurrentUser() user: User, @Param('id') id: string) {
    await this.paymentsService.setDefaultCard(user.id, id);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('saved-cards/:id')
  async deleteSavedCard(@CurrentUser() user: User, @Param('id') id: string) {
    await this.paymentsService.deleteSavedCard(user.id, id);
    return { ok: true };
  }

  // ── Bank account verification (driver onboarding) ────────────────────────
  // Returns the registered name on the account so the driver app can show
  // "Is this you? Adekunle Adebayo" before they confirm.

  @UseGuards(JwtAuthGuard)
  @Post('verify-bank')
  async verifyBank(@Body() body: { bankCode: string; accountNumber: string }) {
    if (!body.bankCode || !body.accountNumber) {
      return { verified: false, message: 'bankCode and accountNumber required' };
    }
    const result = await this.flutterwave.verifyBankAccount({
      bankCode:      body.bankCode,
      accountNumber: body.accountNumber,
    });
    if (!result) return { verified: false, message: 'Could not resolve account' };
    return { verified: true, accountName: result.accountName };
  }

  // ── Customer endpoints ───────────────────────────────────────────────────

  // POST /api/v1/payments/initiate
  // Body: { deliveryId, method: 'card' | 'wallet', paymentOption? }
  // - method=card    → Flutterwave hosted page; paymentOption hints
  //                    which tab (card / banktransfer / ussd / mobilemoney)
  //                    opens by default. Omit to show all.
  // - method=wallet  → debits the customer's SEIRS wallet
  // COD is rejected - Spec V8 §"Confirmed Decisions" removes COD.
  @UseGuards(JwtAuthGuard, MaintenanceGuard)
  @Post('initiate')
  async initiatePayment(
    @CurrentUser() user: User,
    @Body() body: {
      deliveryId: string;
      method: PaymentMethod;
      paymentOption?: 'card' | 'banktransfer' | 'ussd' | 'mobilemoney';
    },
  ) {
    const delivery = await this.deliveriesService.findById(body.deliveryId);

    switch (body.method) {
      case PaymentMethod.CARD:
      case PaymentMethod.BANK:
      case PaymentMethod.MOBILE_MONEY:
        // All Flutterwave-routed methods share one initiation path -
        // payment_options on the Flutterwave widget decides the tab.
        return this.paymentsService.initiateCardPayment(delivery, user, {
          paymentOption: body.paymentOption,
        });

      case PaymentMethod.WALLET:
        return this.paymentsService.payFromWallet(delivery, user);

      case PaymentMethod.COD:
        return { error: 'Cash on delivery is not supported.' };

      default:
        return { error: 'Unsupported payment method' };
    }
  }

  // POST /api/v1/payments/pay-with-saved-card { deliveryId, cardId }
  // One tap: charges the saved Flutterwave token for the fare. The app
  // falls back to the hosted checkout when success is false.
  @UseGuards(JwtAuthGuard, MaintenanceGuard)
  @Post('pay-with-saved-card')
  async payWithSavedCard(
    @CurrentUser() user: User,
    @Body() body: { deliveryId: string; cardId: string },
  ) {
    const delivery = await this.deliveriesService.findById(body.deliveryId);
    return this.paymentsService.payWithSavedCard(delivery, body.cardId, user);
  }

  // POST /api/v1/payments/verify/:txRef
  // The reference is caller-chosen, so the service checks it belongs to
  // this account before confirming anything.
  @UseGuards(JwtAuthGuard)
  @Post('verify/:txRef')
  async verifyPayment(@Param('txRef') txRef: string, @CurrentUser() user: User) {
    return this.paymentsService.confirmFlutterwavePayment(txRef, user.id);
  }

  // GET /api/v1/payments/wallet
  @UseGuards(JwtAuthGuard)
  @Get('wallet')
  getWallet(@CurrentUser() user: User) {
    return this.paymentsService.getWalletBalance(user.id);
  }

  // GET /api/v1/payments/history
  @UseGuards(JwtAuthGuard)
  /**
   * GET /api/v1/payments/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
   *
   * A person's own spend, bank-statement shaped: every settled charge in
   * the window, in date order, with a running total. Sits beside
   * /payments/history rather than replacing it, because history is where
   * unsettled charges live and a statement deliberately excludes them.
   */
  @Get('statement')
  customerStatement(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.paymentsService.getCustomerStatement(user.id, from, to);
  }

  @Get('history')
  getHistory(@CurrentUser() user: User) {
    return this.paymentsService.getPaymentHistory(user.id);
  }

  // ── Driver endpoints ─────────────────────────────────────────────────────

  // GET /api/v1/payments/banks - Nigerian bank list for driver bank setup
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

  // ── Proactive card save (Bolt/Uber pattern) ──────────────────────────────
  // POST /api/v1/payments/add-card
  // Starts a ₦100 card-verification charge on Flutterwave. Returns the
  // hosted page URL. Client opens it, user completes checkout, returns.
  @UseGuards(JwtAuthGuard)
  @Post('add-card')
  addCardStart(@CurrentUser() user: User) {
    return this.paymentsService.initiateCardVerification(user);
  }

  // POST /api/v1/payments/add-card/verify/:txRef
  // Client calls this after returning from the Flutterwave page. Server
  // verifies the transaction succeeded, saves the card token, and
  // immediately refunds the ₦100 verification charge.
  @UseGuards(JwtAuthGuard)
  @Post('add-card/verify/:txRef')
  addCardVerify(
    @CurrentUser() user: User,
    @Param('txRef') txRef: string,
  ) {
    return this.paymentsService.verifyAndRefundCardCharge(user.id, txRef);
  }

  // GET /api/v1/payments/bank-details  (current registered payout account)
  @UseGuards(JwtAuthGuard)
  @Get('bank-details')
  getBankDetails(@CurrentUser() user: User) {
    return this.paymentsService.getBankDetails(user.id);
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

  // ── Flutterwave Webhook (no JWT - Flutterwave server calls this) ───────────
  // POST /api/v1/payments/webhook/flutterwave
  // Set FLW_WEBHOOK_HASH in your env to the same Secret Hash configured in
  // Flutterwave dashboard → Settings → Webhooks
  // Exempt from the global throttler: Flutterwave batches and retries,
  // and dropping a payment notification to save a rate-limit slot is the
  // wrong trade. The secret-hash check below is this route's protection.
  @SkipThrottle()
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
