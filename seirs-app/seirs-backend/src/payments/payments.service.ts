import {
  Injectable, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Payment, PaymentMethod, PaymentStatus, EscrowStatus, PaymentPurpose } from './payment.entity';
import { Wallet } from './wallet.entity';
import { SavedCard } from './saved-card.entity';
import { FlutterwaveService } from './flutterwave.service';
import { Delivery } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';
import { SupportTicket, TicketStatus, TicketTopic } from '../support/support-ticket.entity';
import { PLATFORM_COMMISSION } from '../common/constants/pricing';
import { EarningsService } from '../earnings/earnings.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

const toKobo  = (naira: number) => Math.round(naira * 100);
const toNaira = (kobo:  number) => kobo / 100;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  // Set lazily to avoid circular dependency with FraudModule
  fraudService?: any;

  constructor(
    @InjectRepository(Payment)   private paymentsRepo:   Repository<Payment>,
    @InjectRepository(Wallet)    private walletsRepo:    Repository<Wallet>,
    @InjectRepository(SavedCard) private savedCardsRepo: Repository<SavedCard>,
    private flutterwaveService: FlutterwaveService,
    private earningsService:    EarningsService,
    private loyaltyService:     LoyaltyService,
    private dataSource: DataSource,
  ) {}

  // ── SavedCard CRUD (Flutterwave-tokenized cards for one-tap reuse) ───────

  async listSavedCards(userId: string): Promise<Array<Omit<SavedCard, 'flutterwaveToken'>>> {
    const cards = await this.savedCardsRepo.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
    // Strip the Flutterwave token from API responses - opaque + sensitive.
    return cards.map(({ flutterwaveToken: _t, ...rest }) => rest as any);
  }

  async setDefaultCard(userId: string, cardId: string): Promise<void> {
    const card = await this.savedCardsRepo.findOneBy({ id: cardId, userId });
    if (!card) throw new NotFoundException('Saved card not found');
    await this.dataSource.transaction(async (m) => {
      await m.update(SavedCard, { userId }, { isDefault: false });
      await m.update(SavedCard, { id: cardId }, { isDefault: true });
    });
  }

  async deleteSavedCard(userId: string, cardId: string): Promise<void> {
    const card = await this.savedCardsRepo.findOneBy({ id: cardId, userId });
    if (!card) throw new NotFoundException('Saved card not found');
    await this.savedCardsRepo.delete(cardId);
  }

  /**
   * Persist a Flutterwave card token after a successful first-time charge.
   * If this is the user's first card, it becomes the default.
   */
  async saveCardToken(userId: string, params: {
    token:     string;
    last4:     string;
    brand:     string;
    expMonth:  number;
    expYear:   number;
    holder?:   string | null;
  }): Promise<SavedCard> {
    // Skip if we already saved this exact token (idempotent on retries).
    const existing = await this.savedCardsRepo.findOneBy({ userId, flutterwaveToken: params.token });
    if (existing) return existing;

    const otherCount = await this.savedCardsRepo.count({ where: { userId } });
    const card = this.savedCardsRepo.create({
      userId,
      flutterwaveToken: params.token,
      last4:    params.last4,
      brand:    params.brand.toLowerCase(),
      expMonth: params.expMonth,
      expYear:  params.expYear,
      cardHolder: params.holder ?? null,
      isDefault: otherCount === 0,
    });
    return this.savedCardsRepo.save(card);
  }

  // ── Proactive card save (Bolt/Uber pattern) ──────────────────────────────
  // Nigerian PCI-DSS forbids us collecting raw cards. Cards can only be
  // tokenized through Flutterwave's hosted page during a real charge. So
  // "add a card without booking" needs a small verification charge that
  // we auto-refund immediately. Standard approach across Uber, Bolt, and
  // Nigerian fintech onboarding (Kuda, Piggyvest, etc.).
  //
  // Flow:
  //   1. initiateCardVerification -> Flutterwave hosted page for NGN CARD_VERIFY_NAIRA
  //   2. User completes checkout in browser (card saved by our verify step)
  //   3. verifyAndRefundCardCharge -> confirm the txn, pull card token,
  //      save to saved_cards, refund the amount to the card

  // TODO(cost-review 2026-08-08): the verify + auto-refund pattern costs
  // us Flutterwave fees on both legs (~1.4% charge fee + potential flat
  // refund fee). User accepted this at launch but wants to revisit.
  // Options if we need to cut this cost:
  //   - Drop the proactive flow: cards save on first real delivery only
  //   - Lower this to NGN50 (halves the % fee proportionally)
  //   - Investigate Flutterwave "authorize without capture" tokenization
  // See [[project_seirs_addcard_cost]] before changing.
  private readonly CARD_VERIFY_NAIRA = 100;

  async initiateCardVerification(customer: User): Promise<{
    authorizationUrl: string;
    reference:        string;
  }> {
    const txRef = `SRS-CARDV-${uuidv4().slice(0, 8).toUpperCase()}`;

    const { paymentLink } = await this.flutterwaveService.initializePayment({
      txRef,
      amount:      this.CARD_VERIFY_NAIRA,
      currency:    'NGN',
      email:       customer.email,
      phone:       customer.phone ?? '',
      name:        customer.name,
      redirectUrl: 'seirsmobile://payment-callback',
      meta: {
        purpose:    'card_verification',
        customerId: customer.id,
      },
      paymentOption: 'card',
    });

    // Record a placeholder Payment row so ops has a paper trail even
    // when the user abandons the flow. Marked pending; refund status
    // will flip to REFUNDED on successful verify.
    const payment = this.paymentsRepo.create({
      customer,
      amountKobo:        toKobo(this.CARD_VERIFY_NAIRA),
      method:            PaymentMethod.CARD,
      status:            PaymentStatus.PENDING,
      provider:          'flutterwave',
      providerReference: txRef,
      authorizationUrl:  paymentLink,
    });
    await this.paymentsRepo.save(payment);

    return { authorizationUrl: paymentLink, reference: txRef };
  }

  async verifyAndRefundCardCharge(userId: string, txRef: string): Promise<{
    saved: boolean;
    refunded: boolean;
    last4?: string;
    brand?: string;
  }> {
    // Confirm the transaction actually succeeded before saving anything.
    const verified = await this.flutterwaveService.verifyByTxRef(txRef);
    if (!verified.success) {
      throw new BadRequestException('Card verification did not complete. Try again.');
    }

    // Pull the card token from the completed transaction. If Flutterwave
    // didn't return a token (unusual - some card types don't tokenize),
    // fail loudly so we don't refund silently without a saved card.
    const cardMeta = await this.flutterwaveService.fetchCardTokenFromTransaction(verified.transactionId);
    if (!cardMeta?.token) {
      throw new BadRequestException('Card was charged but no reusable token was issued. Refund will still process.');
    }

    // Save the card first - losing the token would be worse than a
    // failed refund (which ops can retry manually).
    await this.saveCardToken(userId, {
      token:    cardMeta.token,
      last4:    cardMeta.last4,
      brand:    cardMeta.brand,
      expMonth: cardMeta.expMonth,
      expYear:  cardMeta.expYear,
      holder:   cardMeta.holder,
    });

    // Refund the verification charge. Best-effort - if the refund API
    // fails, admin can trigger manually from Flutterwave dashboard, but
    // the card is already saved for the user.
    let refunded = false;
    try {
      await this.flutterwaveService.refundTransaction(verified.transactionId, this.CARD_VERIFY_NAIRA);
      refunded = true;
    } catch (e: any) {
      this.logger.warn(`Card verify refund failed for tx ${verified.transactionId}: ${e?.message ?? e}. Ops must refund manually.`);
    }

    // Mark the placeholder Payment row as refunded (or attempted-refund).
    await this.paymentsRepo.update(
      { providerReference: txRef },
      { status: refunded ? PaymentStatus.REFUNDED : PaymentStatus.SUCCESS },
    ).catch(() => {});

    return {
      saved:    true,
      refunded,
      last4:    cardMeta.last4,
      brand:    cardMeta.brand,
    };
  }

  // ── Wallet ────────────────────────────────────────────────────────────────

  async getOrCreateWallet(user: User): Promise<Wallet> {
    let wallet = await this.walletsRepo.findOne({ where: { user: { id: user.id } } });
    if (!wallet) {
      wallet = this.walletsRepo.create({ user, balanceKobo: 0, currency: 'NGN' });
      await this.walletsRepo.save(wallet);
    }
    return wallet;
  }

  async getWalletBalance(userId: string): Promise<{ balanceKobo: number; balanceNaira: number; currency: string }> {
    const wallet = await this.walletsRepo.findOne({ where: { user: { id: userId } } });
    if (!wallet) return { balanceKobo: 0, balanceNaira: 0, currency: 'NGN' };
    return {
      balanceKobo:  wallet.balanceKobo,
      balanceNaira: toNaira(wallet.balanceKobo),
      currency:     wallet.currency,
    };
  }

  // ── Initiate card payment via Flutterwave hosted page ────────────────────

  async initiateCardPayment(delivery: Delivery, customer: User, opts?: {
    paymentOption?: 'card' | 'banktransfer' | 'ussd' | 'mobilemoney';
  }): Promise<{
    authorizationUrl: string;
    reference:        string;
    paymentId:        string;
  }> {
    const txRef = `SRS-PAY-${uuidv4().slice(0, 8).toUpperCase()}`;

    const { paymentLink } = await this.flutterwaveService.initializePayment({
      txRef,
      amount:      delivery.price,
      currency:    'NGN',
      email:       customer.email,
      phone:       customer.phone ?? '',
      name:        customer.name,
      redirectUrl: 'seirsmobile://payment-callback',
      meta: {
        deliveryId:   delivery.id,
        trackingCode: delivery.trackingCode,
        customerId:   customer.id,
      },
      paymentOption: opts?.paymentOption,
    });

    const payment = this.paymentsRepo.create({
      customer,
      delivery,
      amountKobo:        toKobo(delivery.price),
      method:            PaymentMethod.CARD,
      status:            PaymentStatus.PENDING,
      provider:          'flutterwave',
      providerReference: txRef,
      authorizationUrl:  paymentLink,
    });
    await this.paymentsRepo.save(payment);

    return { authorizationUrl: paymentLink, reference: txRef, paymentId: payment.id };
  }

  /**
   * Failed-delivery redirect fee (founder matrix 2026-08-11). When a
   * package is rerouted to a partner store because nobody could receive
   * it, the sender owes a transport fee before the store's identity and
   * the collection code are revealed. This is NOT escrow money: it is
   * purpose=REDIRECT_FEE so escrow release/refund never touch it and no
   * loyalty points are awarded a second time.
   */
  async initiateRedirectFeePayment(delivery: Delivery, customer: User): Promise<{
    authorizationUrl: string;
    reference:        string;
    amountNgn:        number;
  }> {
    const amount = Number(delivery.redirectFeeNgn ?? 0);
    if (!(amount > 0)) {
      throw new BadRequestException('No redirect fee is outstanding on this delivery.');
    }
    if (delivery.redirectFeePaidAt) {
      throw new BadRequestException('This redirect fee has already been paid.');
    }

    const txRef = `SRS-RDR-${uuidv4().slice(0, 8).toUpperCase()}`;
    const { paymentLink } = await this.flutterwaveService.initializePayment({
      txRef,
      amount,
      currency:    'NGN',
      email:       customer.email,
      phone:       customer.phone ?? '',
      name:        customer.name,
      redirectUrl: 'seirsmobile://payment-callback',
      meta: {
        purpose:      'redirect_fee',
        deliveryId:   delivery.id,
        trackingCode: delivery.trackingCode,
        customerId:   customer.id,
      },
    });

    await this.paymentsRepo.save(this.paymentsRepo.create({
      customer,
      delivery,
      amountKobo:        toKobo(amount),
      method:            PaymentMethod.CARD,
      status:            PaymentStatus.PENDING,
      purpose:           PaymentPurpose.REDIRECT_FEE,
      provider:          'flutterwave',
      providerReference: txRef,
      authorizationUrl:  paymentLink,
    }));

    return { authorizationUrl: paymentLink, reference: txRef, amountNgn: amount };
  }

  // COD - recorded as pending until driver confirms delivery
  async initiateCOD(delivery: Delivery, customer: User): Promise<Payment> {
    const payment = this.paymentsRepo.create({
      customer,
      delivery,
      amountKobo:   toKobo(delivery.price),
      method:       PaymentMethod.COD,
      status:       PaymentStatus.PENDING,
      provider:     'internal',
      escrowStatus: EscrowStatus.HELD,
    });
    return this.paymentsRepo.save(payment);
  }

  // Wallet payment - deduct from customer wallet immediately
  async payFromWallet(delivery: Delivery, customer: User): Promise<Payment> {
    const amountKobo = toKobo(delivery.price);

    await this.dataSource.transaction(async (manager) => {
      const wallet = await manager.findOne(Wallet, {
        where: { user: { id: customer.id } },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet || wallet.balanceKobo < amountKobo) {
        throw new BadRequestException('Insufficient wallet balance.');
      }

      await manager.update(Wallet, wallet.id, {
        balanceKobo: wallet.balanceKobo - amountKobo,
      });
    });

    const payment = this.paymentsRepo.create({
      customer,
      delivery,
      amountKobo,
      method:       PaymentMethod.WALLET,
      status:       PaymentStatus.SUCCESS,
      provider:     'internal',
      escrowStatus: EscrowStatus.HELD,
    });
    return this.paymentsRepo.save(payment);
  }

  // ── Verify Flutterwave payment (webhook + manual) ─────────────────────────

  async confirmFlutterwavePayment(txRef: string): Promise<Payment | null> {
    const payment = await this.paymentsRepo.findOne({
      where: { providerReference: txRef },
      relations: ['delivery', 'customer'],
    });
    if (!payment) return null;
    if (payment.status === PaymentStatus.SUCCESS) return payment;

    const result = await this.flutterwaveService.verifyByTxRef(txRef);

    if (result.success) {
      // Redirect fees settle outright: they are owed to SEIRS + the
      // holding store, never escrowed for a driver, and they must not
      // award loyalty points or tokenize a card a second time. Paying
      // one unlocks the store identity on the tracking payload.
      if (payment.purpose === PaymentPurpose.REDIRECT_FEE) {
        await this.paymentsRepo.update(payment.id, {
          status:                   PaymentStatus.SUCCESS,
          flutterwaveTransactionId: result.transactionId,
        });
        payment.status = PaymentStatus.SUCCESS;
        if (payment.delivery?.id) {
          await this.dataSource.query(
            `UPDATE deliveries SET "redirectFeePaidAt" = NOW() WHERE id = $1 AND "redirectFeePaidAt" IS NULL`,
            [payment.delivery.id],
          );
        }
        this.logger.log(`Redirect fee settled: ${txRef} (₦${result.amount})`);
        return payment;
      }

      await this.paymentsRepo.update(payment.id, {
        status:                    PaymentStatus.SUCCESS,
        escrowStatus:              EscrowStatus.HELD,
        flutterwaveTransactionId:  result.transactionId,
      });
      payment.status       = PaymentStatus.SUCCESS;
      payment.escrowStatus = EscrowStatus.HELD;
      this.logger.log(`Payment confirmed: ${txRef} (₦${result.amount})`);

      // Award loyalty points to the customer for this paid delivery.
      // Bank-transfer bonus uses the original payment.method.
      if (payment.customer && payment.delivery) {
        try {
          await this.loyaltyService.awardDeliveryPoints({
            userId:     payment.customer.id,
            deliveryId: payment.delivery.id,
            naira:      toNaira(payment.amountKobo),
            paidViaBankTransfer: payment.method === PaymentMethod.BANK,
          });
          await this.loyaltyService.awardMonthlyStreak(payment.customer.id);
        } catch (e: any) {
          this.logger.warn(`Loyalty award failed for ${txRef}: ${e.message}`);
        }
      }

      // If the customer paid by card AND opted to save it, persist the
      // Flutterwave token so future charges are one-tap. We rely on the
      // customer's `saveCard` flag stored in payment.meta (set at initiate).
      if (payment.method === PaymentMethod.CARD && result.transactionId) {
        try {
          const card = await this.flutterwaveService.fetchCardTokenFromTransaction(result.transactionId);
          if (card && payment.customer) {
            await this.saveCardToken(payment.customer.id, card);
            this.logger.log(`Card tokenized for user ${payment.customer.id}: ${card.brand} ****${card.last4}`);
          }
        } catch (e: any) {
          this.logger.warn(`Card tokenize failed for ${txRef}: ${e.message}`);
        }
      }
    } else {
      await this.paymentsRepo.update(payment.id, { status: PaymentStatus.FAILED });
    }

    return payment;
  }

  // ── Escrow release - called when delivery is completed ────────────────────

  /**
   * Platform commission as a fraction (0.30 = 30%). Admin-tunable via
   * the Fee Catalogue key 'platform_commission_pct'; falls back to the
   * compiled constant when the row is missing or the table isn't up.
   */
  private async getCommissionRate(): Promise<number> {
    try {
      const rows: Array<{ value: string }> = await this.dataSource.query(
        `SELECT value FROM fees WHERE key = 'platform_commission_pct' AND active = true LIMIT 1`,
      );
      const pct = Number(rows?.[0]?.value);
      if (Number.isFinite(pct) && pct >= 0 && pct <= 60) return pct / 100;
    } catch { /* fees table unavailable: fall through */ }
    return PLATFORM_COMMISSION;
  }

  async releaseEscrow(deliveryId: string, driverUserId: string): Promise<void> {
    const payment = await this.paymentsRepo.findOne({
      where: { delivery: { id: deliveryId }, status: PaymentStatus.SUCCESS, purpose: PaymentPurpose.DELIVERY },
    });

    if (!payment) {
      this.logger.warn(`No confirmed payment found for delivery ${deliveryId}`);
      return;
    }

    if (payment.escrowStatus === EscrowStatus.RELEASED) return;

    const commission      = await this.getCommissionRate();
    const driverShareKobo = Math.round(payment.amountKobo * (1 - commission));

    await this.dataSource.transaction(async (manager) => {
      let driverWallet = await manager.findOne(Wallet, {
        where: { user: { id: driverUserId } },
        lock: { mode: 'pessimistic_write' },
      });

      if (!driverWallet) {
        const driverUser = { id: driverUserId } as User;
        driverWallet = manager.create(Wallet, { user: driverUser, balanceKobo: 0 });
        await manager.save(Wallet, driverWallet);
      }

      await manager.update(Wallet, driverWallet.id, {
        balanceKobo: driverWallet.balanceKobo + driverShareKobo,
      });

      await manager.update(Payment, payment.id, {
        escrowStatus: EscrowStatus.RELEASED,
        releasedAt:   new Date(),
      });
    });

    // Per V8 payments spec: also record a DriverEarning ledger entry for
    // the new payouts pipeline. This runs alongside the existing wallet
    // credit until the wallet model is fully retired.
    try {
      await this.earningsService.recordForDelivery({
        driverId:        driverUserId,
        deliveryId,
        grossNaira:      toNaira(payment.amountKobo),
        seirsCutPercent: commission,
      });
    } catch (e: any) {
      this.logger.warn(`DriverEarning record failed for ${deliveryId}: ${e.message}`);
    }

    this.logger.log(
      `Escrow released for delivery ${deliveryId}. ` +
      `Driver receives ₦${toNaira(driverShareKobo)} (${(1 - commission) * 100}%)`,
    );
  }

  // ── Admin manual refund - Spec V8 §3.13 (closes A23) ─────────────────────
  // Wraps refundEscrow so the existing failure-driven path stays the
  // single source of truth. The reason is logged for audit.
  async manualRefund(args: {
    deliveryId: string;
    adminUserId: string;
    reason: string;
  }): Promise<{ ok: true; refundedAtIso: string }> {
    const payment = await this.paymentsRepo.findOne({
      where: { delivery: { id: args.deliveryId }, purpose: PaymentPurpose.DELIVERY },
      relations: ['delivery', 'delivery.customer'],
    });
    if (!payment) {
      throw new NotFoundException('Payment for that delivery not found.');
    }
    if (payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException('Payment already refunded.');
    }
    if (payment.status !== PaymentStatus.SUCCESS) {
      throw new BadRequestException(`Cannot refund a payment in status ${payment.status}.`);
    }
    if (payment.escrowStatus !== EscrowStatus.HELD) {
      throw new BadRequestException(
        `Funds are already ${payment.escrowStatus}; manual refund not possible.`,
      );
    }
    const customerId = payment.delivery?.customer?.id;
    if (!customerId) throw new NotFoundException('Customer not found on delivery.');

    this.logger.warn(
      `MANUAL_REFUND deliveryId=${args.deliveryId} admin=${args.adminUserId} reason="${args.reason}"`,
    );
    await this.refundEscrow(args.deliveryId, customerId);
    return { ok: true, refundedAtIso: new Date().toISOString() };
  }

  // ── Refund escrow - called when delivery fails or cancels ────────────────

  /**
   * @param withholdNgn Amount to keep back rather than return, used by
   *   customer cancellation so the agreed cancellation fee is actually
   *   collected instead of merely displayed. Clamped to the payment, so
   *   a fee larger than what was paid can never invert into a charge.
   */
  async refundEscrow(
    deliveryId: string,
    customerUserId: string,
    withholdNgn = 0,
  ): Promise<void> {
    const payment = await this.paymentsRepo.findOne({
      where: { delivery: { id: deliveryId }, status: PaymentStatus.SUCCESS, purpose: PaymentPurpose.DELIVERY },
    });

    if (!payment || payment.escrowStatus !== EscrowStatus.HELD) return;

    const withholdKobo = Math.min(
      Math.max(0, toKobo(Math.max(0, withholdNgn))),
      payment.amountKobo,
    );
    const refundKobo = payment.amountKobo - withholdKobo;
    if (withholdKobo > 0) {
      this.logger.log(
        `Withholding ₦${toNaira(withholdKobo)} of ₦${toNaira(payment.amountKobo)} ` +
        `on delivery ${deliveryId} (cancellation fee).`,
      );
    }

    if (refundKobo > 0 && payment.method === PaymentMethod.CARD && payment.flutterwaveTransactionId) {
      try {
        await this.flutterwaveService.refundTransaction(
          payment.flutterwaveTransactionId,
          toNaira(refundKobo),
        );
        this.logger.log(`Card refund issued via Flutterwave for delivery ${deliveryId}`);
      } catch (e) {
        this.logger.error(`Card refund failed for ${payment.providerReference}: ${e.message}`);
      }
    }

    if (refundKobo > 0 && payment.method === PaymentMethod.WALLET) {
      await this.dataSource.transaction(async (manager) => {
        const wallet = await manager.findOne(Wallet, {
          where: { user: { id: customerUserId } },
          lock: { mode: 'pessimistic_write' },
        });
        if (wallet) {
          await manager.update(Wallet, wallet.id, {
            balanceKobo: wallet.balanceKobo + refundKobo,
          });
        }
      });
    }

    await this.paymentsRepo.update(payment.id, {
      status:       PaymentStatus.REFUNDED,
      escrowStatus: EscrowStatus.REFUNDED,
    });

    // Loyalty points awarded on the original payment must be clawed back -
    // we don't want users farming points by paying then disputing.
    try {
      await this.loyaltyService.clawbackForDelivery(deliveryId);
    } catch (e: any) {
      this.logger.warn(`Loyalty clawback failed for ${deliveryId}: ${e.message}`);
    }

    this.logger.log(`Refund processed for delivery ${deliveryId}`);
  }

  // ── Driver withdrawal via Flutterwave transfer ───────────────────────────

  async requestWithdrawal(userId: string, amountNaira: number): Promise<{ message: string }> {
    const amountKobo = toKobo(amountNaira);
    const MIN_WITHDRAWAL_KOBO = toKobo(1000); // ₦1,000 minimum

    if (amountKobo < MIN_WITHDRAWAL_KOBO) {
      throw new BadRequestException('Minimum withdrawal is ₦1,000.');
    }

    const wallet = await this.walletsRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!wallet || wallet.balanceKobo < amountKobo) {
      throw new BadRequestException('Insufficient wallet balance.');
    }

    // Demo/marketing accounts carry a STAGED balance that was never
    // paid for by a customer. Paying it out would move real money out
    // of the SEIRS account (2026-08-12 security review).
    if ((wallet.user as any)?.isDemo) {
      throw new BadRequestException(
        'This is a demo account. Its balance is staged for screenshots and cannot be withdrawn.',
      );
    }

    if (!wallet.bankAccountNumber || !wallet.bankCode) {
      throw new BadRequestException('Please add a bank account before withdrawing.');
    }

    // Deduct from wallet first - refund if transfer fails
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Wallet, wallet.id, {
        balanceKobo: wallet.balanceKobo - amountKobo,
      });
    });

    const reference = `SRS-WD-${uuidv4().slice(0, 8).toUpperCase()}`;
    const { success } = await this.flutterwaveService.transferToBank({
      amountNaira,
      bankCode:      wallet.bankCode,
      accountNumber: wallet.bankAccountNumber,
      accountName:   wallet.bankAccountName,
      reference,
      narration:     'Seirs driver earnings withdrawal',
    });

    if (!success) {
      // Restore wallet balance - transfer failed
      await this.walletsRepo.update(wallet.id, {
        balanceKobo: wallet.balanceKobo,
      });
      throw new BadRequestException('Transfer failed. Please try again or contact support.');
    }

    this.logger.log(`Withdrawal of ₦${amountNaira} sent to ${wallet.bankAccountNumber} (ref: ${reference})`);

    // Flag large withdrawals for fraud review (async - non-blocking)
    if (this.fraudService) {
      this.fraudService.checkWithdrawal(userId, amountKobo).catch(() => {});
    }

    return { message: `₦${amountNaira.toLocaleString()} withdrawal initiated. Arrives in 1-2 business days.` };
  }

  /**
   * Save/replace the payout bank account. Policy (founder, 2026-08-09):
   *   - FIRST account: applied instantly (drivers must be able to get paid).
   *   - REPLACING an existing account is a critical change: it is stored
   *     as PENDING and a support ticket is opened for admin review
   *     (target: 3 business days). Guards against account-takeover
   *     payout theft. Payouts keep flowing to the OLD account until an
   *     admin approves the change.
   */
  async updateBankDetails(
    userId: string,
    data: { bankName: string; bankCode: string; bankAccountNumber: string; bankAccountName: string },
  ) {
    const wallet   = await this.getOrCreateWallet({ id: userId } as User);
    const usersRepo = this.dataSource.getRepository(User);
    const user     = await usersRepo.findOne({ where: { id: userId } });
    const hasExisting = !!(user?.bankAccountNumber || wallet.bankAccountNumber);

    if (!hasExisting) {
      // First-time setup: apply immediately to BOTH rows. Payouts
      // (EarningsService.payoutDriver) read from the USER row; writing
      // only to the wallet used to leave payouts permanently failing
      // with "bank account not configured".
      await this.walletsRepo.update(wallet.id, data);
      await usersRepo.update(userId, {
        bankCode:          data.bankCode,
        bankAccountNumber: data.bankAccountNumber,
        bankAccountName:   data.bankAccountName,
      });
      return { message: 'Bank details updated.', pending: false };
    }

    // Same account re-submitted: nothing to review.
    if (
      (user?.bankAccountNumber ?? wallet.bankAccountNumber) === data.bankAccountNumber &&
      (user?.bankCode ?? wallet.bankCode) === data.bankCode
    ) {
      return { message: 'This is already your payout account.', pending: false };
    }

    // Replacement: park as pending + open a review ticket.
    let ticketId: string | null = wallet.pendingBankTicketId ?? null;
    try {
      if (!ticketId && user) {
        const ticketsRepo = this.dataSource.getRepository(SupportTicket);
        const ticket = await ticketsRepo.save(ticketsRepo.create({
          user,
          userAccountType: 'driver',
          topic:           TicketTopic.ACCOUNT,
          status:          TicketStatus.OPEN,
          subject:         'Bank account change request',
          linkedDeliveryId: null,
          assignedAgentId:  null,
          lastMessageAt:    new Date(),
        }));
        ticketId = ticket.id;
        // System message gives the agent masked context; full details
        // stay in the wallet's pending columns, applied on approval.
        await this.dataSource.query(
          `INSERT INTO chat_messages (body, "imageUrl", "systemType", "ticketId")
           VALUES ($1, NULL, 'bank_change_request', $2)`,
          [
            `Driver requested a payout account change to ${data.bankName} ` +
            `(account ending ${data.bankAccountNumber.slice(-4)}, name: ${data.bankAccountName}). ` +
            `Review and approve or reject within 3 business days. ` +
            `Approving applies the new account; payouts continue to the old account until then.`,
            ticketId,
          ],
        );
      }
    } catch (e: any) {
      this.logger.warn(`bank-change ticket creation failed: ${e?.message ?? e}`);
    }

    await this.walletsRepo.update(wallet.id, {
      pendingBankName:          data.bankName,
      pendingBankCode:          data.bankCode,
      pendingBankAccountNumber: data.bankAccountNumber,
      pendingBankAccountName:   data.bankAccountName,
      pendingBankRequestedAt:   new Date(),
      pendingBankTicketId:      ticketId,
    });

    return {
      message: 'Bank change submitted for review. It takes up to 3 business days; payouts continue to your current account until it is approved.',
      pending: true,
    };
  }

  /** Current registered payout account (for display in the driver app). */
  async getBankDetails(userId: string) {
    const user = await this.dataSource.getRepository(User).findOne({
      where:  { id: userId },
      select: ['id', 'bankCode', 'bankAccountNumber', 'bankAccountName'],
    });
    const wallet = await this.walletsRepo.findOne({ where: { user: { id: userId } } });
    return {
      bankName:          wallet?.bankName ?? null,
      bankCode:          user?.bankCode ?? wallet?.bankCode ?? null,
      bankAccountNumber: user?.bankAccountNumber ?? wallet?.bankAccountNumber ?? null,
      bankAccountName:   user?.bankAccountName ?? wallet?.bankAccountName ?? null,
      pendingBankName:          wallet?.pendingBankName ?? null,
      pendingBankAccountNumber: wallet?.pendingBankAccountNumber ?? null,
      pendingBankAccountName:   wallet?.pendingBankAccountName ?? null,
      pendingBankRequestedAt:   wallet?.pendingBankRequestedAt ?? null,
    };
  }

  /**
   * Admin review of a pending bank change (called from AdminService).
   * Approve applies pending -> active on both wallet + user rows;
   * reject discards the pending details. Both clear the pending state.
   */
  async resolveBankChange(userId: string, approve: boolean) {
    const wallet = await this.walletsRepo.findOne({ where: { user: { id: userId } } });
    if (!wallet?.pendingBankAccountNumber) {
      throw new NotFoundException('No pending bank change for this user.');
    }

    if (approve) {
      await this.walletsRepo.update(wallet.id, {
        bankName:          wallet.pendingBankName,
        bankCode:          wallet.pendingBankCode,
        bankAccountNumber: wallet.pendingBankAccountNumber,
        bankAccountName:   wallet.pendingBankAccountName,
      });
      await this.dataSource.getRepository(User).update(userId, {
        bankCode:          wallet.pendingBankCode,
        bankAccountNumber: wallet.pendingBankAccountNumber,
        bankAccountName:   wallet.pendingBankAccountName,
      });
    }

    const ticketId = wallet.pendingBankTicketId;
    await this.walletsRepo.update(wallet.id, {
      pendingBankName:          null as any,
      pendingBankCode:          null as any,
      pendingBankAccountNumber: null as any,
      pendingBankAccountName:   null as any,
      pendingBankRequestedAt:   null,
      pendingBankTicketId:      null,
    });

    // Close the loop on the review ticket so the driver sees the outcome
    // in their Messages inbox.
    if (ticketId) {
      try {
        await this.dataSource.query(
          `INSERT INTO chat_messages (body, "imageUrl", "systemType", "ticketId")
           VALUES ($1, NULL, 'bank_change_resolved', $2)`,
          [
            approve
              ? 'Your bank account change was approved. Future payouts go to the new account.'
              : 'Your bank account change was rejected. Payouts continue to your existing account. Contact support if you did not expect this.',
            ticketId,
          ],
        );
        await this.dataSource.getRepository(SupportTicket).update(ticketId, {
          status:     TicketStatus.RESOLVED,
          resolvedAt: new Date(),
          lastMessageAt: new Date(),
        });
      } catch (e: any) {
        this.logger.warn(`bank-change ticket close failed: ${e?.message ?? e}`);
      }
    }

    return { approved: approve };
  }

  async getPaymentHistory(userId: string): Promise<Payment[]> {
    return this.paymentsRepo.find({
      where: { customer: { id: userId } },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  // ── Nigerian bank list (for driver bank account setup UI) ────────────────

  async getNigerianBanks() {
    return this.flutterwaveService.getNigerianBanks();
  }
}
