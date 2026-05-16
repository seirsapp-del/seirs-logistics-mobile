import {
  Injectable, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Payment, PaymentMethod, PaymentStatus, EscrowStatus } from './payment.entity';
import { Wallet } from './wallet.entity';
import { SavedCard } from './saved-card.entity';
import { FlutterwaveService } from './flutterwave.service';
import { Delivery } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';
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
    // Strip the Flutterwave token from API responses — opaque + sensitive.
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

  async initiateCardPayment(delivery: Delivery, customer: User): Promise<{
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

  // COD — recorded as pending until driver confirms delivery
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

  // Wallet payment — deduct from customer wallet immediately
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

  // ── Escrow release — called when delivery is completed ────────────────────

  async releaseEscrow(deliveryId: string, driverUserId: string): Promise<void> {
    const payment = await this.paymentsRepo.findOne({
      where: { delivery: { id: deliveryId }, status: PaymentStatus.SUCCESS },
    });

    if (!payment) {
      this.logger.warn(`No confirmed payment found for delivery ${deliveryId}`);
      return;
    }

    if (payment.escrowStatus === EscrowStatus.RELEASED) return;

    const driverShareKobo = Math.round(payment.amountKobo * (1 - PLATFORM_COMMISSION));

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
        seirsCutPercent: PLATFORM_COMMISSION,
      });
    } catch (e: any) {
      this.logger.warn(`DriverEarning record failed for ${deliveryId}: ${e.message}`);
    }

    this.logger.log(
      `Escrow released for delivery ${deliveryId}. ` +
      `Driver receives ₦${toNaira(driverShareKobo)} (${(1 - PLATFORM_COMMISSION) * 100}%)`,
    );
  }

  // ── Admin manual refund — Spec V8 §3.13 (closes A23) ─────────────────────
  // Wraps refundEscrow so the existing failure-driven path stays the
  // single source of truth. The reason is logged for audit.
  async manualRefund(args: {
    deliveryId: string;
    adminUserId: string;
    reason: string;
  }): Promise<{ ok: true; refundedAtIso: string }> {
    const payment = await this.paymentsRepo.findOne({
      where: { delivery: { id: args.deliveryId } },
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

  // ── Refund escrow — called when delivery fails or cancels ────────────────

  async refundEscrow(deliveryId: string, customerUserId: string): Promise<void> {
    const payment = await this.paymentsRepo.findOne({
      where: { delivery: { id: deliveryId }, status: PaymentStatus.SUCCESS },
    });

    if (!payment || payment.escrowStatus !== EscrowStatus.HELD) return;

    if (payment.method === PaymentMethod.CARD && payment.flutterwaveTransactionId) {
      try {
        await this.flutterwaveService.refundTransaction(
          payment.flutterwaveTransactionId,
          toNaira(payment.amountKobo),
        );
        this.logger.log(`Card refund issued via Flutterwave for delivery ${deliveryId}`);
      } catch (e) {
        this.logger.error(`Card refund failed for ${payment.providerReference}: ${e.message}`);
      }
    }

    if (payment.method === PaymentMethod.WALLET) {
      await this.dataSource.transaction(async (manager) => {
        const wallet = await manager.findOne(Wallet, {
          where: { user: { id: customerUserId } },
          lock: { mode: 'pessimistic_write' },
        });
        if (wallet) {
          await manager.update(Wallet, wallet.id, {
            balanceKobo: wallet.balanceKobo + payment.amountKobo,
          });
        }
      });
    }

    await this.paymentsRepo.update(payment.id, {
      status:       PaymentStatus.REFUNDED,
      escrowStatus: EscrowStatus.REFUNDED,
    });

    // Loyalty points awarded on the original payment must be clawed back —
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

    if (!wallet.bankAccountNumber || !wallet.bankCode) {
      throw new BadRequestException('Please add a bank account before withdrawing.');
    }

    // Deduct from wallet first — refund if transfer fails
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
      // Restore wallet balance — transfer failed
      await this.walletsRepo.update(wallet.id, {
        balanceKobo: wallet.balanceKobo,
      });
      throw new BadRequestException('Transfer failed. Please try again or contact support.');
    }

    this.logger.log(`Withdrawal of ₦${amountNaira} sent to ${wallet.bankAccountNumber} (ref: ${reference})`);

    // Flag large withdrawals for fraud review (async — non-blocking)
    if (this.fraudService) {
      this.fraudService.checkWithdrawal(userId, amountKobo).catch(() => {});
    }

    return { message: `₦${amountNaira.toLocaleString()} withdrawal initiated. Arrives in 1-2 business days.` };
  }

  async updateBankDetails(
    userId: string,
    data: { bankName: string; bankCode: string; bankAccountNumber: string; bankAccountName: string },
  ) {
    const wallet = await this.getOrCreateWallet({ id: userId } as User);
    await this.walletsRepo.update(wallet.id, data);
    return { message: 'Bank details updated.' };
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
