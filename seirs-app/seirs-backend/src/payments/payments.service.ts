import {
  Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Payment, PaymentMethod, PaymentStatus, EscrowStatus, PaymentPurpose } from './payment.entity';
import { mapProviderMethod } from './flutterwave.service';
import { Wallet } from './wallet.entity';
import { SavedCard } from './saved-card.entity';
import { FlutterwaveService } from './flutterwave.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountSecurityService } from '../notifications/account-security.service';
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
  /** Wired by DeliveriesModule.onModuleInit: post-payment dispatch. */
  deliveriesServiceRef?: { kickDispatch: (deliveryId: string) => Promise<void> };

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
    private notificationsService: NotificationsService,
    private accountSecurity: AccountSecurityService,
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
      // CARD stands here, unlike the other creation paths, because this
      // checkout passes paymentOption 'card': no other rail is on offer,
      // so this is a fact about the request and not an assumption about
      // the customer. Settle still overwrites it with what came back.
      method:            PaymentMethod.CARD,
      status:            PaymentStatus.PENDING,
      // Tagged so the webhook does not mistake a ₦100 tokenization
      // charge for a fare and put it into escrow.
      purpose:           PaymentPurpose.CARD_VERIFICATION,
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
    /**
     * The reference is a path parameter, so it is entirely caller-chosen
     * (audit 2026-08-14).
     *
     * This method used to take it straight to Flutterwave, pull the card
     * token off whatever transaction came back, and save that token to
     * the *calling* account. It never asked whose reference it was. Pass
     * somebody else's SRS-CARDV- reference and their card landed on your
     * account, chargeable through the saved-card flow. The only thing
     * standing in the way was guessing 8 hex characters, on an endpoint
     * with no rate limit.
     *
     * Ownership is now established from our own records first, and
     * Flutterwave is only consulted about a reference we already know
     * belongs to this user.
     */
    const own = await this.paymentsRepo.findOne({
      where: { providerReference: txRef, customer: { id: userId } },
      relations: ['customer'],
    });
    if (!own) {
      throw new NotFoundException('No card verification found for that reference on this account.');
    }
    if (own.purpose !== PaymentPurpose.CARD_VERIFICATION) {
      throw new BadRequestException('That reference is not a card verification.');
    }
    // SUCCESS is allowed as well as PENDING: the webhook and the client's
    // return trip race each other, and the webhook often wins. REFUNDED
    // means this flow already ran to completion.
    if (own.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException('That card verification has already been processed.');
    }

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
    /** Deep-link back into the right app: business checkouts return to
     *  seirsbusiness:// rather than the customer scheme. */
    redirectUrl?: string;
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
      redirectUrl: opts?.redirectUrl ?? 'seirsmobile://payment-callback',
      meta: {
        deliveryId:   delivery.id,
        trackingCode: delivery.trackingCode,
        customerId:   customer.id,
      },
      paymentOption: opts?.paymentOption,
    });

    // No method: the hosted page offers card, transfer, mobile money and
    // USSD, and which one the customer picks is not knowable until they
    // have picked it. It is written from the provider's answer at settle.
    const payment = this.paymentsRepo.create({
      customer,
      delivery,
      amountKobo:        toKobo(delivery.price),
      status:            PaymentStatus.PENDING,
      provider:          'flutterwave',
      providerReference: txRef,
      authorizationUrl:  paymentLink,
    });
    await this.paymentsRepo.save(payment);

    return { authorizationUrl: paymentLink, reference: txRef, paymentId: payment.id };
  }

  /**
   * One-tap fare payment with a saved (tokenized) card. No hosted page,
   * no 16 digits: the charge fires server-side against the Flutterwave
   * token, then flows through confirmFlutterwavePayment so the amount
   * verification, escrow and loyalty behave exactly as a hosted-page
   * payment would (founder 2026-08-22: nobody should hunt for their
   * card to finish an order).
   *
   * Failure is a clean fallback, not an error state: the app offers the
   * hosted checkout when { success: false } comes back.
   */
  async payWithSavedCard(delivery: Delivery, cardId: string, user: User): Promise<{
    success: boolean;
    alreadyPaid?: boolean;
    paymentId?: string;
    last4?: string;
    error?: string;
  }> {
    // The actor must own the booking: a token charge moves money with
    // no checkout page in between, so this check is not optional.
    if (delivery.customer?.id !== user.id) {
      throw new ForbiddenException('This booking belongs to another account.');
    }
    if (delivery.paymentHeldAt) {
      return { success: true, alreadyPaid: true };
    }
    if (delivery.status !== 'pending') {
      return { success: false, error: 'This booking can no longer be paid.' };
    }

    const card = await this.savedCardsRepo.findOneBy({ id: cardId, userId: user.id });
    if (!card) throw new NotFoundException('That saved card was not found on this account.');

    const txRef = `SRS-PAY-${uuidv4().slice(0, 8).toUpperCase()}`;
    const payment = this.paymentsRepo.create({
      customer:          user,
      delivery,
      amountKobo:        toKobo(delivery.price),
      // CARD stands here too: this charges a stored card token directly,
      // with no checkout page in between that could offer another rail.
      method:            PaymentMethod.CARD,
      status:            PaymentStatus.PENDING,
      provider:          'flutterwave',
      providerReference: txRef,
    });
    await this.paymentsRepo.save(payment);

    const res = await this.flutterwaveService.chargeWithToken({
      token:     card.flutterwaveToken,
      txRef,
      amount:    Number(delivery.price),
      currency:  'NGN',
      email:     user.email,
      narration: `SEIRS delivery ${delivery.trackingCode ?? ''}`.trim(),
    });

    if (!res.success) {
      await this.paymentsRepo.update(payment.id, { status: PaymentStatus.FAILED });
      return {
        success: false,
        error: 'Your bank declined the saved card. Try the full checkout instead.',
      };
    }

    // Same verification + escrow + loyalty path as the hosted page.
    const confirmed = await this.confirmFlutterwavePayment(txRef, user.id);
    if (confirmed?.status !== PaymentStatus.SUCCESS) {
      return {
        success: false,
        error: 'The charge could not be verified. If you were debited it will be reconciled.',
      };
    }
    return { success: true, paymentId: payment.id, last4: card.last4 };
  }

  /**
   * Failed-delivery redirect fee (founder matrix 2026-08-11). When a
   * package is rerouted to a partner store because nobody could receive
   * it, the sender owes a transport fee before the store's identity and
   * the collection code are revealed. This is NOT escrow money: it is
   * purpose=REDIRECT_FEE so escrow release/refund never touch it and no
   * loyalty points are awarded a second time.
   */
  /**
   * Charge the re-quoted leg for a support-approved address change.
   *
   * purpose=ADDRESS_CHANGE so escrow release and refund never touch it:
   * this is a change fee owed to SEIRS and the rider for extra distance,
   * not part of the original fare being held for the delivery.
   */
  /**
   * Charge the trip that brings an undeliverable package home.
   *
   * purpose=RETURN_TO_SENDER so escrow release and refund never touch
   * it: the original fare is a separate matter from the cost of
   * carrying the package back.
   */
  async initiateReturnPayment(delivery: Delivery, customer: User): Promise<{
    authorizationUrl: string;
    reference:        string;
    amountNgn:        number;
  }> {
    const amount = Number(delivery.returnQuoteNgn ?? 0);
    if (!(amount > 0)) {
      throw new BadRequestException('No return is awaiting payment on this delivery.');
    }
    if (delivery.returnPaidAt) {
      throw new BadRequestException('This return has already been paid.');
    }

    const txRef = `SRS-RTN-${uuidv4().slice(0, 8).toUpperCase()}`;
    const { paymentLink } = await this.flutterwaveService.initializePayment({
      txRef,
      amount,
      currency:    'NGN',
      email:       customer.email,
      phone:       customer.phone ?? '',
      name:        customer.name,
      redirectUrl: 'seirsmobile://payment-callback',
      meta: {
        purpose:      'return_to_sender',
        deliveryId:   delivery.id,
        trackingCode: delivery.trackingCode,
        customerId:   customer.id,
      },
    });

    const payment = this.paymentsRepo.create({
      delivery,
      user:              customer,
      amount,
      purpose:           PaymentPurpose.RETURN_TO_SENDER,
      status:            PaymentStatus.PENDING,
      providerReference: txRef,
    } as any);
    await this.paymentsRepo.save(payment);

    return { authorizationUrl: paymentLink, reference: txRef, amountNgn: amount };
  }

  async initiateAddressChangePayment(delivery: Delivery, customer: User): Promise<{
    authorizationUrl: string;
    reference:        string;
    amountNgn:        number;
  }> {
    const amount = Number(delivery.addressChangeQuoteNgn ?? 0);
    if (!(amount > 0)) {
      throw new BadRequestException('No address change is awaiting payment on this delivery.');
    }
    if (delivery.addressChangePaidAt) {
      throw new BadRequestException('This address change has already been paid.');
    }

    const txRef = `SRS-ADR-${uuidv4().slice(0, 8).toUpperCase()}`;
    const { paymentLink } = await this.flutterwaveService.initializePayment({
      txRef,
      amount,
      currency:    'NGN',
      email:       customer.email,
      phone:       customer.phone ?? '',
      name:        customer.name,
      redirectUrl: 'seirsmobile://payment-callback',
      meta: {
        purpose:      'address_change',
        deliveryId:   delivery.id,
        trackingCode: delivery.trackingCode,
        customerId:   customer.id,
      },
    });

    const payment = this.paymentsRepo.create({
      delivery,
      user:              customer,
      amount,
      purpose:           PaymentPurpose.ADDRESS_CHANGE,
      status:            PaymentStatus.PENDING,
      providerReference: txRef,
    } as any);
    await this.paymentsRepo.save(payment);

    return { authorizationUrl: paymentLink, reference: txRef, amountNgn: amount };
  }

  async initiateRedirectFeePayment(
    delivery: Delivery,
    customer: User,
    opts?: { web?: boolean },
  ): Promise<{
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
      // A receiver paying from the tracking page is in a browser,
      // where a seirsmobile:// callback goes nowhere.
      redirectUrl: opts?.web
        ? `${process.env.PUBLIC_SITE_URL ?? 'https://seirs.app'}/collect/${delivery.trackingCode}?paid=1`
        : 'seirsmobile://payment-callback',
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
      // Rail unknown until the hosted page settles. See above.
      status:            PaymentStatus.PENDING,
      purpose:           PaymentPurpose.REDIRECT_FEE,
      provider:          'flutterwave',
      providerReference: txRef,
      authorizationUrl:  paymentLink,
    }));

    return { authorizationUrl: paymentLink, reference: txRef, amountNgn: amount };
  }

  /**
   * Cash on delivery is not a SEIRS product (founder, 2026-08-13 and
   * again 2026-08-18: "we shouldn't have cash on delivery").
   *
   * The method that created a COD payment is deleted rather than left
   * dormant. It marked the escrow HELD without a naira ever arriving and
   * then kicked dispatch, so anything that called it would have sent a
   * driver out against money SEIRS did not have. /payments/initiate
   * already rejects the method; the enum value stays only so historical
   * rows still read.
   */

  /**
   * Resolve a NUBAN to the name it actually belongs to.
   *
   * Exposed on the service so callers outside this module do not reach
   * into FlutterwaveService directly, and so every path that stores a
   * payout account stores the RESOLVED name rather than a typed one.
   */
  async verifyBank(bankCode: string, accountNumber: string): Promise<{ accountName: string } | null> {
    return this.flutterwaveService.verifyBankAccount({ bankCode, accountNumber });
  }

  /**
   * Send money out to a bank account.
   *
   * A thin pass-through so callers outside this module (partner counter
   * payouts) do not have to reach into FlutterwaveService themselves.
   * Never throws: the caller decides what a failed transfer means for
   * its own ledger, which for a payout means putting the rows straight
   * back to pending rather than stranding them.
   */
  async transferOut(params: {
    amountNaira:   number;
    bankCode:      string;
    accountNumber: string;
    accountName:   string;
    reference:     string;
    narration:     string;
  }): Promise<{ success: boolean; transferId?: string }> {
    return this.flutterwaveService.transferToBank(params);
  }

  /**
   * Pay for a partner store drop-off, or top up an under-declared one.
   *
   * A drop-off has no Delivery until the counter takes the package in,
   * so the Payment row carries dropoffId instead of a delivery relation.
   * The webhook settles it and stamps paidAt on the drop-off, which is
   * what the counter checks before accepting anything.
   */
  async initiateDropoffPayment(
    dropoffId: string,
    customer: User,
    amountNgn: number,
    kind: 'fare' | 'topup' = 'fare',
  ): Promise<{ authorizationUrl: string; reference: string; amountNgn: number }> {
    if (!(amountNgn > 0)) {
      throw new BadRequestException('Nothing to pay on this drop-off.');
    }

    const txRef = `SRS-${kind === 'topup' ? 'TOP' : 'DRP'}-${uuidv4().slice(0, 8).toUpperCase()}`;
    const { paymentLink } = await this.flutterwaveService.initializePayment({
      txRef,
      amount:      amountNgn,
      currency:    'NGN',
      email:       customer.email,
      phone:       customer.phone ?? '',
      name:        customer.name,
      redirectUrl: 'seirsmobile://payment-callback',
      meta: {
        purpose:    kind === 'topup' ? 'store_topup' : 'store_dropoff',
        dropoffId,
        customerId: customer.id,
      },
    });

    await this.paymentsRepo.save(this.paymentsRepo.create({
      customer,
      dropoffId,
      amountKobo:        toKobo(amountNgn),
      // Rail unknown until the hosted page settles. See above.
      status:            PaymentStatus.PENDING,
      purpose:           kind === 'topup' ? PaymentPurpose.STORE_TOPUP : PaymentPurpose.STORE_DROPOFF,
      provider:          'flutterwave',
      providerReference: txRef,
      authorizationUrl:  paymentLink,
    }));

    return { authorizationUrl: paymentLink, reference: txRef, amountNgn };
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
    const savedWallet = await this.paymentsRepo.save(payment);
    // Escrow is HELD here too, so the delivery must be stamped funded.
    await this.markDeliveryFunded(delivery.id, `wallet:${savedWallet.id}`);
    try { await this.deliveriesServiceRef?.kickDispatch(delivery.id); }
    catch (e: any) { this.logger.warn(`Wallet dispatch kick failed: ${e.message}`); }
    return savedWallet;
  }

  // ── Verify Flutterwave payment (webhook + manual) ─────────────────────────

  /**
   * Stamp a delivery as funded. Every path that puts money into escrow
   * MUST call this before kickDispatch, because kickDispatch and the
   * available-jobs feed both gate on paymentHeldAt.
   *
   * It is a helper rather than an inline UPDATE precisely because it was
   * missed: the field was written in exactly one disabled branch, so
   * every card payment the platform took was orphaned from its delivery.
   */
  private async markDeliveryFunded(deliveryId: string, ref: string): Promise<void> {
    try {
      await this.dataSource.query(
        `UPDATE deliveries SET "paymentHeldAt" = NOW() WHERE "id" = $1 AND "paymentHeldAt" IS NULL`,
        [deliveryId],
      );
    } catch (e: any) {
      this.logger.error(
        `CRITICAL: could not mark ${ref} funded: ${e?.message ?? e}. `
        + 'Money is held but this delivery will not dispatch.',
      );
    }
  }

  async confirmFlutterwavePayment(
    txRef: string,
    actorUserId?: string,
  ): Promise<Payment | null> {
    const payment = await this.paymentsRepo.findOne({
      where: { providerReference: txRef },
      relations: ['delivery', 'customer'],
    });
    if (!payment) return null;

    // The manual verify route takes the reference from the URL, so a
    // caller can name any payment in the system. The webhook passes no
    // actor and stays trusted: it has already proven itself with the
    // secret hash.
    if (actorUserId && payment.customer?.id !== actorUserId) {
      throw new ForbiddenException('That payment reference belongs to another account.');
    }

    /**
     * Already successful: nothing to charge again, but DO make sure the
     * delivery knows.
     *
     * This was a bare `return payment`, which meant a payment that
     * succeeded while its delivery was never stamped could never heal:
     * the money sat in escrow, the booking sat pending, and every retry
     * returned here and did nothing. Because paymentHeldAt was never
     * written on the card path at all, that describes every card payment
     * the platform has taken.
     *
     * markDeliveryFunded only writes when the field IS NULL, so this is
     * idempotent, and re-kicking dispatch on an already-assigned booking
     * is a no-op. Verifying an old reference now repairs it.
     */
    if (payment.status === PaymentStatus.SUCCESS) {
      if (payment.escrowStatus === EscrowStatus.HELD && payment.delivery?.id) {
        await this.markDeliveryFunded(payment.delivery.id, `${txRef} (repair)`);
        try { await this.deliveriesServiceRef?.kickDispatch(payment.delivery.id); }
        catch (e: any) { this.logger.warn(`Repair dispatch failed for ${txRef}: ${e.message}`); }
      }
      return payment;
    }

    const result = await this.flutterwaveService.verifyByTxRef(txRef);

    /**
     * Verify what was actually paid, not just that something was paid
     * (audit 2026-08-14).
     *
     * The amount and currency came back from Flutterwave and were used
     * for nothing but a log line. The row was then marked SUCCESS and
     * escrowed at the amount we *expected*, whatever had really been
     * collected. A short payment, or a payment settled in a different
     * currency on a multi-currency account, would still have released
     * the full fare to the driver with SEIRS covering the gap. This is
     * the check Flutterwave's own integration guide asks for before
     * giving value.
     *
     * Overpayment is allowed through: refusing to deliver a package
     * somebody has overpaid for helps nobody, and it is reconcilable.
     */
    if (result.success) {
      const expectedNaira = toNaira(payment.amountKobo);
      const paidNaira     = Number(result.amount ?? 0);
      const paidCurrency  = String(result.currency ?? '').toUpperCase();
      const wantCurrency  = String(payment.currency ?? 'NGN').toUpperCase();

      // Tolerate sub-kobo float noise from the provider, nothing more.
      if (!Number.isFinite(paidNaira) || paidNaira + 0.01 < expectedNaira) {
        this.logger.error(
          `UNDERPAYMENT rejected txRef=${txRef} expected=₦${expectedNaira} paid=₦${paidNaira}`,
        );
        await this.paymentsRepo.update(payment.id, { status: PaymentStatus.FAILED });
        return null;
      }
      if (paidCurrency && paidCurrency !== wantCurrency) {
        this.logger.error(
          `CURRENCY MISMATCH rejected txRef=${txRef} expected=${wantCurrency} paid=${paidCurrency}`,
        );
        await this.paymentsRepo.update(payment.id, { status: PaymentStatus.FAILED });
        return null;
      }

      /**
       * The rail the customer actually used, resolved ONCE here and
       * written by every settle branch below.
       *
       * Position matters. Two later decisions read payment.method and
       * both of them silently do nothing if it is still null:
       *
       *   - card tokenisation, further down this method, reads the
       *     in-memory object, which is why the mirror on the next line
       *     is not decoration
       *   - the escrow refund gate in refundEscrow, which reloads the
       *     row, which is why the DB write matters there
       *
       * So this sits above all seven branches, and each branch spreads
       * methodPatch into its own update.
       *
       * The patch is empty when the provider reported nothing
       * recognisable. That leaves an existing value alone rather than
       * erasing it, and leaves an unknown rail null rather than calling
       * it a card, which is the whole point of the exercise.
       */
      const settledMethod = mapProviderMethod(result.paymentType);
      const methodPatch: { method?: PaymentMethod } = settledMethod ? { method: settledMethod } : {};
      if (settledMethod) payment.method = settledMethod;
      if (!settledMethod && result.paymentType) {
        // An unmapped rail is a gap in mapProviderMethod, not a customer
        // problem. Name it so it can be added rather than discovered.
        this.logger.warn(
          `Unmapped provider payment_type "${result.paymentType}" on ${txRef}; method left null.`,
        );
      }

      // A card-tokenization charge is not a fare. It must never be
      // escrowed or earn loyalty points; verifyAndRefundCardCharge owns
      // the rest of its lifecycle and refunds it.
      if (payment.purpose === PaymentPurpose.CARD_VERIFICATION) {
        await this.paymentsRepo.update(payment.id, {
          ...methodPatch,
          status:                   PaymentStatus.SUCCESS,
          flutterwaveTransactionId: result.transactionId,
        });
        payment.status = PaymentStatus.SUCCESS;
        return payment;
      }

      // Redirect fees settle outright: they are owed to SEIRS + the
      // holding store, never escrowed for a driver, and they must not
      // award loyalty points or tokenize a card a second time. Paying
      // one unlocks the store identity on the tracking payload.
      // An address change settles outright and then moves the drop-off.
      // Applying it here, rather than when support approves, is what
      // stops an unpaid approval from redirecting a rider.
      // A return settles outright and then turns the package around.
      if (payment.purpose === PaymentPurpose.RETURN_TO_SENDER) {
        await this.paymentsRepo.update(payment.id, {
          ...methodPatch,
          status:                   PaymentStatus.SUCCESS,
          flutterwaveTransactionId: result.transactionId,
        });
        payment.status = PaymentStatus.SUCCESS;
        if (payment.delivery?.id && (this as any).deliveriesServiceRef) {
          await (this as any).deliveriesServiceRef
            .applyReturn(payment.delivery.id)
            .catch((e: any) =>
              this.logger.error(`return apply failed: ${e?.message ?? e}`),
            );
        }
        this.logger.log(`Return to sender settled: ${txRef} (₦${result.amount})`);
        return payment;
      }

      if (payment.purpose === PaymentPurpose.ADDRESS_CHANGE) {
        await this.paymentsRepo.update(payment.id, {
          ...methodPatch,
          status:                   PaymentStatus.SUCCESS,
          flutterwaveTransactionId: result.transactionId,
        });
        payment.status = PaymentStatus.SUCCESS;
        if (payment.delivery?.id && (this as any).deliveriesServiceRef) {
          await (this as any).deliveriesServiceRef
            .applyAddressChange(payment.delivery.id)
            .catch((e: any) =>
              this.logger.error(`address change apply failed: ${e?.message ?? e}`),
            );
        }
        this.logger.log(`Address change settled: ${txRef} (₦${result.amount})`);
        return payment;
      }

      if (payment.purpose === PaymentPurpose.REDIRECT_FEE) {
        await this.paymentsRepo.update(payment.id, {
          ...methodPatch,
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

      /**
       * A drop-off fare settles here rather than falling through to the
       * escrow branch below: there is no Delivery to escrow against yet.
       * Stamping paidAt is what lets the counter accept the package, so
       * an unpaid booking simply cannot cross it.
       */
      if (payment.purpose === PaymentPurpose.STORE_DROPOFF || payment.purpose === PaymentPurpose.STORE_TOPUP) {
        await this.paymentsRepo.update(payment.id, {
          ...methodPatch,
          status:                   PaymentStatus.SUCCESS,
          escrowStatus:             EscrowStatus.HELD,
          flutterwaveTransactionId: result.transactionId,
        });
        payment.status = PaymentStatus.SUCCESS;
        if (payment.dropoffId) {
          const col = payment.purpose === PaymentPurpose.STORE_TOPUP ? 'topUpPaidAt' : 'paidAt';
          await this.dataSource.query(
            `UPDATE store_dropoffs SET "${col}" = NOW() WHERE id = $1 AND "${col}" IS NULL`,
            [payment.dropoffId],
          );
        }
        this.logger.log(`Store drop-off ${payment.purpose} settled: ${txRef} (NGN ${result.amount})`);
        return payment;
      }

      /**
       * The booking can die between checkout opening and the card being
       * charged: the pending-booking expiry sweep runs on a 60-minute
       * window and a hosted payment page has no idea. Found live on
       * 2026-08-21, when a real checkout sat open past the window and
       * only luck kept the card from being charged into a cancelled
       * delivery. Money for a dead booking goes straight back, never
       * into escrow nobody is watching.
       */
      if (payment.delivery && String(payment.delivery.status) === 'cancelled') {
        await this.paymentsRepo.update(payment.id, {
          ...methodPatch,
          status:                   PaymentStatus.SUCCESS,
          escrowStatus:             EscrowStatus.REFUNDED,
          flutterwaveTransactionId: result.transactionId,
        });
        payment.status = PaymentStatus.SUCCESS;
        try {
          await this.flutterwaveService.refundTransaction(result.transactionId, result.amount);
          this.logger.warn(
            `Payment ${txRef} arrived for CANCELLED delivery ${payment.delivery.id}; refunded in full.`,
          );
        } catch (e: any) {
          // The refund failing is the one state that genuinely needs a
          // human, so say so loudly rather than pretending.
          this.logger.error(
            `Payment ${txRef} arrived for CANCELLED delivery ${payment.delivery.id} and the ` +
            `auto-refund FAILED: ${e?.message ?? e}. Refund manually in Flutterwave.`,
          );
        }
        if (this.notificationsService && payment.customer?.id) {
          this.notificationsService.create(
            payment.customer.id,
            'That booking had already expired',
            'Your payment went through after the booking timed out, so we have refunded it in full. ' +
            'It can take a few working days to appear, depending on your bank. Book again when you are ready.',
            'payment_received' as any,
            payment.delivery.id,
            (payment.delivery as any).trackingCode,
          ).catch(() => {});
        }
        return payment;
      }

      await this.paymentsRepo.update(payment.id, {
        ...methodPatch,
        status:                    PaymentStatus.SUCCESS,
        escrowStatus:              EscrowStatus.HELD,
        flutterwaveTransactionId:  result.transactionId,
      });
      payment.status       = PaymentStatus.SUCCESS;
      payment.escrowStatus = EscrowStatus.HELD;
      this.logger.log(`Payment confirmed: ${txRef} (₦${result.amount})`);

      /**
       * Stamp the delivery as funded. THIS IS THE STEP THAT WAS
       * MISSING, and it orphaned every card payment the platform has
       * ever taken.
       *
       * paymentHeldAt was written in exactly one place, a business
       * credit branch that is permanently disabled, yet four things
       * gate on it: kickDispatch returns early without it, the
       * available-jobs feed filters on IS NOT NULL, the tracking
       * payload derives awaitingPayment from it, and the stale-pending
       * sweep uses it to decide what to cancel.
       *
       * So the money was collected and held in escrow, the card was
       * tokenised, loyalty was awarded, and the delivery itself never
       * learned it had been paid. No driver could see it and the
       * 60-minute sweep would eventually cancel a booking the customer
       * had already paid for.
       *
       * Caught on the founder's first live payment, 2026-08-24:
       * SRS-9CJ7LJP2, paid at 06:58, still pending at 09:01.
       *
       * Set it BEFORE kickDispatch, because kickDispatch reads it.
       */
      if (payment.delivery?.id) {
        await this.markDeliveryFunded(payment.delivery.id, txRef);
        try { await this.deliveriesServiceRef?.kickDispatch(payment.delivery.id); }
        catch (e: any) { this.logger.warn(`Post-payment dispatch failed for ${txRef}: ${e.message}`); }
      }

      const isBusinessRun = (payment.delivery as any)?.source === 'business_app';
      if (isBusinessRun && payment.customer) {
        // Business bookings earn on the BUSINESS ledger at the platform
        // rate (1 pt per N100 spent), never on the personal one: the two
        // ledgers surface in different apps and double-awarding the same
        // naira would double the liability.
        try {
          await this.dataSource.query(
            `UPDATE business_accounts SET "loyaltyPoints" = "loyaltyPoints" + $2 WHERE "ownerId" = $1`,
            // Through the loyalty service, so the earn rate follows the
            // Fee Catalogue row rather than a hardcoded 1-per-100 that
            // only matches it at today's value (audit, 2026-08-28).
            [payment.customer.id, await this.loyaltyService.pointsForSpend(toNaira(payment.amountKobo))],
          );
        } catch (e: any) {
          this.logger.warn(`Business loyalty award failed for ${txRef}: ${e.message}`);
        }
      } else if (payment.customer && payment.delivery) {
        // Award loyalty points to the customer for this paid delivery.
        // Bank-transfer bonus uses the original payment.method.
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

      /**
       * Tokenise the card, if a card is what was used.
       *
       * This READS the method resolved above, from the in-memory object.
       * It used to match every single payment, because every payment
       * claimed to be a card, and then asked the provider for a token
       * that a transfer or USSD transaction never had. The null return
       * hid it. Now it only asks when a card was really used, which is
       * both correct and one fewer provider call per transfer.
       */
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

    const commission = await this.getCommissionRate();

    /**
     * Pay the number the driver was promised, not a recomputation
     * (2026-08-15). The delivery row's driverEarnings is set at booking as
     * 70% of the subtotal PLUS the night fee in full: that is the figure
     * the job card showed when the driver accepted. This release path used
     * to ignore it and take a flat (1 - commission) of gross, which
     * silently kept 30% of the night fee, so night trips paid less than
     * their own offer screen. Booked figure wins; the gross split stays as
     * the fallback for legacy rows that predate driverEarnings.
     */
    const delivery = await this.dataSource.getRepository(Delivery).findOne({
      where: { id: deliveryId },
      select: ['id', 'driverEarnings'],
    });
    const bookedNaira = Number(delivery?.driverEarnings);
    const driverShareKobo =
      Number.isFinite(bookedNaira) && bookedNaira > 0
        ? Math.min(Math.round(bookedNaira * 100), payment.amountKobo)
        : Math.round(payment.amountKobo * (1 - commission));

    /**
     * One delivery's pay lives in ONE place.
     *
     * This credited the driver's Wallet AND wrote a DriverEarning row
     * for the same money, described as running "alongside the existing
     * wallet credit until the wallet model is fully retired". Both of
     * those balances have a live payout route wired to Flutterwave:
     *
     *   POST /payments/withdraw  drains Wallet.balanceKobo
     *   POST /earnings/payout    drains driver_earnings
     *
     * and neither one looks at the other. So a rider who earned
     * 1,469.68 on a delivery could withdraw 1,469.68 twice and SEIRS
     * would pay both, out of a single customer payment (2026-08-27).
     * Nothing about it required bad faith: two routes, two balances,
     * one job.
     *
     * The ledger is the pipeline that pays riders now, so it takes the
     * money and the wallet credit becomes what it should always have
     * been: a fallback for when the ledger write fails, so a rider is
     * never left unpaid by an outage. Recording first, and crediting
     * only on failure, means the money can never be in both.
     *
     * Wallet balances that already exist are untouched and still
     * withdrawable: they are real money from past releases. Deliveries
     * released BEFORE this change carry both records and need
     * reconciling by hand. Query in the night report.
     */
    let ledgerTookIt = false;
    try {
      await this.earningsService.recordForDelivery({
        driverId:        driverUserId,
        deliveryId,
        grossNaira:      toNaira(payment.amountKobo),
        // Effective cut, derived from the booked figure, so the ledger
        // pays exactly what the job card offered on night trips where
        // driverEarnings carries the night fee in full.
        seirsCutPercent: 1 - driverShareKobo / Math.max(payment.amountKobo, 1),
      });
      ledgerTookIt = true;
    } catch (e: any) {
      this.logger.error(
        `DriverEarning record failed for ${deliveryId}: ${e.message}. ` +
        `Falling back to a wallet credit so the rider is still paid.`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      if (!ledgerTookIt) {
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
      }

      await manager.update(Payment, payment.id, {
        escrowStatus: EscrowStatus.RELEASED,
        releasedAt:   new Date(),
      });
    });

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

    /**
     * A refund that did not happen must never be recorded as one.
     *
     * This caught the Flutterwave error, logged it, and carried straight
     * on to stamp status=REFUNDED and escrowStatus=REFUNDED. So a
     * declined refund left the customer out of pocket while the platform
     * recorded their money as returned: no balance for them to notice it
     * in, no retry, and a payments row that actively says the opposite of
     * the truth. It is the same shape as the rider holdback found on
     * 2026-08-27, aimed at a customer instead.
     *
     * That is not hypothetical. Flutterwave refused four transfers that
     * same night over IP whitelisting, and refunds go through the same
     * provider from the same rotating egress address, so the very next
     * IP change would have produced silently-lost customer refunds.
     *
     * The escrow now stays HELD when the provider refuses, which is the
     * truthful state and leaves the refund retryable.
     */
    /**
     * Refund anything the provider collected, not just things labelled
     * "card".
     *
     * This gated on method === CARD, which worked only by accident:
     * every checkout path stamped CARD onto the row at creation whatever
     * the customer actually used, so transfers and USSD payments fell
     * through the gate and got refunded anyway. The moment method starts
     * telling the truth, that accident stops, and a bank-transfer
     * customer's refund would be skipped in silence.
     *
     * A transaction id IS the refundability test: it exists only when
     * the provider took the money and can give it back. Wallet payments
     * never get one, and the explicit WALLET exclusion says so out loud
     * rather than relying on that.
     */
    let providerRefundOk = true;
    if (refundKobo > 0 && payment.flutterwaveTransactionId && payment.method !== PaymentMethod.WALLET) {
      try {
        await this.flutterwaveService.refundTransaction(
          payment.flutterwaveTransactionId,
          toNaira(refundKobo),
        );
        this.logger.log(`Provider refund issued for delivery ${deliveryId} (method=${payment.method ?? 'unknown'})`);
      } catch (e) {
        providerRefundOk = false;
        this.logger.error(
          `REFUND NOT ISSUED for delivery ${deliveryId} (${payment.providerReference}): ` +
          `₦${toNaira(refundKobo)} still owed to the customer. Escrow left HELD for retry. ${e.message}`,
        );
      }
    }

    if (!providerRefundOk) {
      // Leave every other side effect alone: no status change, no loyalty
      // clawback. The customer keeps their points until they keep their
      // money.
      // Not "to your card": this path now covers transfer and USSD too,
      // and telling a transfer customer their card failed is a support
      // ticket waiting to happen.
      throw new BadRequestException(
        'We could not return this payment to you. Nothing has been taken from you and ' +
        'our team has been alerted. Please contact support if it is not resolved shortly.',
      );
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

  /**
   * Pay a rider for a trip that died.
   *
   * computeFailedTripPay has always calculated this and deliveries.service
   * has always stored it on driverFailedTripNgn, and nothing anywhere read
   * the stored field, so the rider was never actually paid it (found
   * 2026-08-27). The rider made the journey whoever was at fault, and
   * reporting a bad parcel is the behaviour we want to encourage rather
   * than tax.
   *
   * FOUNDER RULE, 27 Aug: the compensation is a FLOOR for a run that
   * dies, not a bonus that stacks. If the delivery is later redirected
   * and completes, the rider is paid the full delivery pay and this is
   * absorbed. That is enforced structurally rather than by a flag:
   * recordForDelivery is idempotent on deliveryId, and this is only
   * called once a delivery is terminally failed or cancelled, so
   * releaseEscrow can never also run for the same job.
   *
   * SEIRS carries the whole amount. It is not a share of customer
   * revenue: on a failed trip the customer is refunded, so there is no
   * revenue to share. Hence a zero cut.
   */
  async payFailedTripCompensation(
    deliveryId: string,
    driverUserId: string,
    amountNgn: number,
  ): Promise<void> {
    const amount = Number(amountNgn);
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
      await this.earningsService.recordForDelivery({
        driverId:        driverUserId,
        deliveryId,
        grossNaira:      amount,
        seirsCutPercent: 0,
      });
      this.logger.log(
        `Failed-trip compensation of ${amount.toFixed(2)} recorded for delivery ${deliveryId}.`,
      );
    } catch (e: any) {
      this.logger.error(
        `Failed-trip compensation could not be recorded for ${deliveryId}: ${e.message}`,
      );
    }
  }

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
  /**
   * Tell the account holder their payout account was touched.
   *
   * updateBankDetails changed where a rider's money goes and told them
   * nothing: not on first setup, not on replacement. The replacement
   * path opens a support ticket, but that is addressed to SUPPORT, so
   * the person whose money it is heard nothing either way.
   *
   * That is the payout-redirect vector in its plainest form. Someone
   * gets into an account, points the payouts at their own bank, and the
   * owner finds out when money stops arriving, which on a weekly payout
   * cycle is up to a week later.
   *
   * Found 2026-08-27 when the founder changed his own payout account
   * and observed: "i changed the payout bank account, but look at this
   * no notifications."
   *
   * The message deliberately shows only the last four digits. It has to
   * be specific enough that a real owner recognises their own change,
   * and useless to anyone reading over a shoulder.
   */
  private async notifyBankChange(
    userId: string,
    accountNumber: string,
    bankName: string,
    pending: boolean,
  ): Promise<void> {
    /**
     * Routed through AccountSecurityService rather than sending its own
     * push (2026-08-28).
     *
     * The in-app notice below has existed since this method was
     * written. What it never had was an EMAIL, and a payout redirect is
     * the event on this platform most deserving of one: a push lands on
     * a phone that, in exactly the scenario this exists for, is in
     * somebody else's hand. Email is the channel the real owner still
     * controls.
     *
     * Deliberately NOT a second notification. One event, one notice,
     * two channels. Two rows in the inbox for one change would make a
     * person trust both of them less.
     *
     * It also stops using sendToUser(), which refuses to write to a
     * deactivated account: a payout change on an account an admin just
     * froze for suspected takeover is precisely when the owner must
     * still be told.
     */
    try {
      if (pending) {
        await this.accountSecurity.bankChangeRequested(userId, accountNumber, bankName);
      } else {
        await this.accountSecurity.bankAccountSet(userId, accountNumber, bankName);
      }
    } catch (e: any) {
      // Never let a failed notification block the change itself: the
      // holder asked for it and a silent notification outage must not
      // look like a broken form.
      this.logger.warn(`Bank-change notification failed for ${userId}: ${e?.message}`);
    }
  }

  async updateBankDetails(
    userId: string,
    data: { bankName: string; bankCode: string; bankAccountNumber: string; bankAccountName: string },
    /**
     * Applied straight away, skipping the change-review ticket.
     *
     * Replacing an existing payout account normally parks as pending and
     * opens a ticket for a human to look at, which is right when the
     * account holder asks for it. An admin doing it IS that human, so
     * routing their change into a queue addressed to themselves just
     * fails to apply the change.
     */
    force = false,
  ) {
    const wallet   = await this.getOrCreateWallet({ id: userId } as User);
    const usersRepo = this.dataSource.getRepository(User);
    const user     = await usersRepo.findOne({ where: { id: userId } });
    const hasExisting = !!(user?.bankAccountNumber || wallet.bankAccountNumber);

    /**
     * Resolve the name server-side. Never trust the one in the body.
     *
     * The apps call POST /payments/verify-bank first and send the
     * resolved name along, which is why the founder saw the correct name
     * appear as they typed. But this endpoint stored whatever arrived,
     * so anything calling the API directly could file an arbitrary name
     * against an arbitrary account number, and bankVerifiedAt, declared
     * on the User entity with a comment promising payouts check it, was
     * never written by any code path at all.
     *
     * That mattered most in the review queue. Replacing a payout account
     * parks as pending so a human can look at it, and the name that
     * human reads is the strongest signal they have. An attacker with a
     * hijacked session could supply their own account number under the
     * account holder's real name, and the reviewer would see exactly
     * what they expected to see.
     *
     * Flutterwave is the authority here, so ask it, and store its answer
     * rather than the caller's.
     */
    const resolved = await this.flutterwaveService.verifyBankAccount({
      bankCode:      data.bankCode,
      accountNumber: data.bankAccountNumber,
    });
    if (!resolved?.accountName) {
      throw new BadRequestException(
        'We could not confirm that account with your bank. Check the bank and account number and try again.',
      );
    }
    const verifiedData = { ...data, bankAccountName: resolved.accountName };
    const verifiedAt   = new Date();

    if (!hasExisting || force) {
      // First-time setup: apply immediately to BOTH rows. Payouts
      // (EarningsService.payoutDriver) read from the USER row; writing
      // only to the wallet used to leave payouts permanently failing
      // with "bank account not configured".
      await this.walletsRepo.update(wallet.id, verifiedData);
      await usersRepo.update(userId, {
        bankCode:          verifiedData.bankCode,
        bankAccountNumber: verifiedData.bankAccountNumber,
        bankAccountName:   verifiedData.bankAccountName,
        bankVerifiedAt:    verifiedAt,
      });
      await this.notifyBankChange(userId, verifiedData.bankAccountNumber, verifiedData.bankName, false);
      return { message: 'Bank details updated.', pending: false, accountName: verifiedData.bankAccountName };
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
            `Driver requested a payout account change to ${verifiedData.bankName} ` +
            `(account ending ${verifiedData.bankAccountNumber.slice(-4)}, name: ${verifiedData.bankAccountName}). ` +
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
      pendingBankName:          verifiedData.bankName,
      pendingBankCode:          verifiedData.bankCode,
      pendingBankAccountNumber: verifiedData.bankAccountNumber,
      pendingBankAccountName:   verifiedData.bankAccountName,
      pendingBankRequestedAt:   new Date(),
      pendingBankTicketId:      ticketId,
    });

    // A pending change is exactly when the holder most needs telling:
    // the ticket goes to support, not to them.
    await this.notifyBankChange(userId, data.bankAccountNumber, data.bankName, true);

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

    /**
     * Tell them the decision. This is the moment that matters.
     *
     * A notification was added to updateBankDetails this morning, which
     * covers the REQUEST. Nothing covered the outcome, so an admin could
     * approve a payout-account change and the account holder heard
     * nothing at all (founder, having approved one: "the bank account
     * changed but he didn't get a notification").
     *
     * Approval is the moment money starts going somewhere new. A rider
     * who did not ask for this needs to find out now, not on payday.
     * The message names the last four digits only: enough for a real
     * owner to recognise their own account, useless over a shoulder.
     */
    // Same single notice as before, now carried by email as well as
    // push (2026-08-28). Approval is the moment money starts going
    // somewhere new, and a push is the channel most easily missed by
    // the one person who has to see it. Masking to the last four
    // digits happens inside AccountSecurityService, so no call site can
    // put a whole NUBAN in an email by forgetting to slice it.
    try {
      await this.accountSecurity.bankChangeResolved(
        userId,
        approve,
        wallet.pendingBankAccountNumber ?? '',
        wallet.pendingBankName ?? '',
      );
    } catch (e: any) {
      this.logger.warn(`Bank-resolution notification failed for ${userId}: ${e?.message}`);
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
