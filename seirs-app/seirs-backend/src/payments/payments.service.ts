import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Payment, PaymentMethod, PaymentStatus, EscrowStatus } from './payment.entity';
import { Wallet } from './wallet.entity';
import { FlutterwaveService } from './flutterwave.service';
import { Delivery } from '../deliveries/delivery.entity';
import { User } from '../users/user.entity';

const PLATFORM_COMMISSION = 0.20; // 20%

// Convert naira to kobo
const toKobo = (naira: number) => Math.round(naira * 100);
const toNaira = (kobo: number) => kobo / 100;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
    @InjectRepository(Wallet)  private walletsRepo:  Repository<Wallet>,
    private flutterwaveService: FlutterwaveService,
    private dataSource: DataSource,
  ) {}

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

  // ── Initiate payment (card via Flutterwave) ───────────────────────────────

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

  // COD — payment is recorded as pending until driver confirms delivery
  async initiateCOD(delivery: Delivery, customer: User): Promise<Payment> {
    const payment = this.paymentsRepo.create({
      customer,
      delivery,
      amountKobo:  toKobo(delivery.price),
      method:      PaymentMethod.COD,
      status:      PaymentStatus.PENDING,
      provider:    'internal',
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

  // ── Webhook / verification ────────────────────────────────────────────────

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
        status:       PaymentStatus.SUCCESS,
        escrowStatus: EscrowStatus.HELD,
      });
      payment.status       = PaymentStatus.SUCCESS;
      payment.escrowStatus = EscrowStatus.HELD;
      this.logger.log(`Payment confirmed: ${txRef} (₦${result.amount})`);
    } else {
      await this.paymentsRepo.update(payment.id, { status: PaymentStatus.FAILED });
    }

    return payment;
  }

  // ── Escrow release (called when delivery is completed) ────────────────────

  async releaseEscrow(deliveryId: string, driverUserId: string): Promise<void> {
    const payment = await this.paymentsRepo.findOne({
      where: { delivery: { id: deliveryId }, status: PaymentStatus.SUCCESS },
    });

    if (!payment) {
      this.logger.warn(`No confirmed payment found for delivery ${deliveryId}`);
      return;
    }

    if (payment.escrowStatus === EscrowStatus.RELEASED) return;

    // Calculate driver earnings (price minus platform commission)
    const driverShareKobo = Math.round(payment.amountKobo * (1 - PLATFORM_COMMISSION));

    await this.dataSource.transaction(async (manager) => {
      // Credit driver wallet
      let driverWallet = await manager.findOne(Wallet, {
        where: { user: { id: driverUserId } },
        lock: { mode: 'pessimistic_write' },
      });

      if (!driverWallet) {
        // Create wallet on the fly if first earning
        const driverUser = { id: driverUserId } as User;
        driverWallet = manager.create(Wallet, { user: driverUser, balanceKobo: 0 });
        await manager.save(Wallet, driverWallet);
      }

      await manager.update(Wallet, driverWallet.id, {
        balanceKobo: driverWallet.balanceKobo + driverShareKobo,
      });

      // Mark escrow released
      await manager.update(Payment, payment.id, {
        escrowStatus: EscrowStatus.RELEASED,
        releasedAt:   new Date(),
      });
    });

    this.logger.log(
      `Escrow released for delivery ${deliveryId}. ` +
      `Driver receives ₦${toNaira(driverShareKobo)} (${(1 - PLATFORM_COMMISSION) * 100}%)`
    );
  }

  // ── Refund escrow (called when delivery fails/cancels) ────────────────────

  async refundEscrow(deliveryId: string, customerUserId: string): Promise<void> {
    const payment = await this.paymentsRepo.findOne({
      where: { delivery: { id: deliveryId }, status: PaymentStatus.SUCCESS },
    });

    if (!payment || payment.escrowStatus !== EscrowStatus.HELD) return;

    // For card payments, refund via Flutterwave
    // Requires numeric transaction ID — logged here for now, wired in production
    if (payment.method === PaymentMethod.CARD) {
      this.logger.warn(`Card refund needed for txRef ${payment.providerReference} — trigger manually in Flutterwave dashboard`);
    }

    // For wallet payments, return to customer wallet
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

    this.logger.log(`Refund processed for delivery ${deliveryId}`);
  }

  // ── Driver withdrawal ─────────────────────────────────────────────────────

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

    if (!wallet.bankAccountNumber) {
      throw new BadRequestException('Please add a bank account before withdrawing.');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Wallet, wallet.id, {
        balanceKobo: wallet.balanceKobo - amountKobo,
      });
    });

    // TODO: trigger actual Paystack transfer in production
    this.logger.log(`Withdrawal of ₦${amountNaira} requested by user ${userId}`);

    return { message: `₦${amountNaira.toLocaleString()} withdrawal initiated. Arrives in 1-2 business days.` };
  }

  async updateBankDetails(
    userId: string,
    data: { bankName: string; bankAccountNumber: string; bankAccountName: string },
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
}
