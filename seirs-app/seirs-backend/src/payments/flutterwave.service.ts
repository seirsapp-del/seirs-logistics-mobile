import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

// Flutterwave is the sole payment processor for Seirs.
// Covers: card payments, bank transfers, mobile money (GHS/KES/UGX/TZS),
//         driver earnings payouts, refunds, payment verification,
//         tokenized card charges (saved cards), bank account verification.

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);
  private readonly baseUrl = 'https://api.flutterwave.com/v3';
  private readonly secretKey: string;
  private readonly secretHash: string;

  constructor(cfg: ConfigService) {
    this.secretKey  = cfg.get<string>('FLUTTERWAVE_SECRET_KEY', '');
    // FLW_WEBHOOK_HASH must match the "Secret Hash" set in the Flutterwave
    // dashboard → Settings → Webhooks. Used to verify inbound webhooks.
    // (Same env var as the older webhook handler in payments.controller.ts —
    // keep them aligned so a single Railway variable serves both code paths.)
    this.secretHash = cfg.get<string>('FLW_WEBHOOK_HASH', '');
  }

  private async request<T>(method: string, path: string, body?: object): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await res.json() as T;
    if (!res.ok || (json as any).status === 'error') {
      throw new Error((json as any).message ?? 'Flutterwave request failed');
    }
    return json;
  }

  // ── Card / hosted payment page ────────────────────────────────────────────

  async initializePayment(params: {
    txRef:       string;
    amount:      number;   // major currency unit (₦1500, not kobo)
    currency:    string;   // 'NGN' | 'GHS' | 'KES' | 'UGX'
    email:       string;
    phone:       string;
    name:        string;
    redirectUrl: string;
    meta:        object;
  }): Promise<{ paymentLink: string; txRef: string }> {
    const data = await this.request<any>('POST', '/payments', {
      tx_ref:          params.txRef,
      amount:          params.amount,
      currency:        params.currency,
      redirect_url:    params.redirectUrl,
      customer: {
        email:       params.email,
        phonenumber: params.phone,
        name:        params.name,
      },
      meta:            params.meta,
      payment_options: 'card,banktransfer,mobilemoney,ussd',
    });

    return { paymentLink: data.data.link, txRef: params.txRef };
  }

  // ── Verify by transaction reference ──────────────────────────────────────

  async verifyByTxRef(txRef: string): Promise<{
    success:       boolean;
    amount:        number;
    transactionId: number;
  }> {
    const data = await this.request<any>(
      'GET',
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
    );
    return {
      success:       data.data.status === 'successful',
      amount:        data.data.amount,
      transactionId: data.data.id,
    };
  }

  async verifyTransaction(id: string): Promise<{
    success: boolean;
    amount:  number;
    txRef:   string;
  }> {
    const data = await this.request<any>('GET', `/transactions/${id}/verify`);
    return {
      success: data.data.status === 'successful',
      amount:  data.data.amount,
      txRef:   data.data.tx_ref,
    };
  }

  // ── Refund ───────────────────────────────────────────────────────────────

  async refundTransaction(transactionId: number, amount: number): Promise<void> {
    await this.request<any>('POST', `/transactions/${transactionId}/refund`, { amount });
  }

  // ── Transfer to driver bank account (earnings withdrawal) ────────────────
  // amount is in naira (major unit), NOT kobo — Flutterwave uses major units for transfers

  async transferToBank(params: {
    amountNaira:   number;
    bankCode:      string; // CBN bank code, e.g. "044" for Access Bank
    accountNumber: string;
    accountName:   string;
    reference:     string;
    narration:     string;
  }): Promise<{ success: boolean; transferId?: string }> {
    try {
      const data = await this.request<any>('POST', '/transfers', {
        account_bank:      params.bankCode,
        account_number:    params.accountNumber,
        amount:            params.amountNaira,
        narration:         params.narration,
        currency:          'NGN',
        reference:         params.reference,
        beneficiary_name:  params.accountName,
      });
      return { success: true, transferId: data.data?.id?.toString() };
    } catch (e) {
      this.logger.error(`Transfer failed: ${e.message}`);
      return { success: false };
    }
  }

  // ── Nigerian bank list (for driver bank account selection) ───────────────

  async getNigerianBanks(): Promise<Array<{ id: string; name: string; code: string }>> {
    const data = await this.request<any>('GET', '/banks/NG');
    return (data.data ?? []).map((b: any) => ({
      id:   String(b.id),
      name: b.name,
      code: b.code,
    }));
  }

  // ── Tokenized card charges (saved cards / Amazon-style one-tap) ──────────

  /**
   * Charge a previously-saved card token. The token is returned by Flutterwave
   * after the user's first successful card payment (in the verify response
   * under data.card.token). SEIRS stores only the token + display metadata,
   * never the card number.
   *
   * Flutterwave docs: https://developer.flutterwave.com/reference/tokenized-charge
   */
  async chargeWithToken(params: {
    token:      string;
    txRef:      string;
    amount:     number;   // major unit (NGN naira, not kobo)
    currency:   string;   // 'NGN' | 'GHS' | 'KES' | 'UGX'
    email:      string;
    narration?: string;
  }): Promise<{ success: boolean; transactionId?: number; chargeReference?: string; rawStatus?: string }> {
    try {
      const data = await this.request<any>('POST', '/tokenized-charges', {
        token:      params.token,
        currency:   params.currency,
        country:    'NG',
        amount:     params.amount,
        email:      params.email,
        tx_ref:     params.txRef,
        narration:  params.narration ?? `SEIRS delivery payment ${params.txRef}`,
      });
      const tx = data.data ?? {};
      return {
        success:         tx.status === 'successful',
        transactionId:   tx.id,
        chargeReference: tx.flw_ref,
        rawStatus:       tx.status,
      };
    } catch (e: any) {
      this.logger.error(`Tokenized charge failed (txRef=${params.txRef}): ${e.message}`);
      return { success: false };
    }
  }

  /**
   * After a successful first-time card charge, fetch the reusable card
   * details so we can persist a PaymentMethod row. Flutterwave returns the
   * token in the verify response under data.card.token.
   */
  async fetchCardTokenFromTransaction(transactionId: number): Promise<{
    token:     string;
    last4:     string;
    brand:     string;   // 'VISA' | 'MASTERCARD' | 'VERVE' | etc
    expMonth:  number;
    expYear:   number;
    holder:    string | null;
  } | null> {
    try {
      const data = await this.request<any>('GET', `/transactions/${transactionId}/verify`);
      const card = data.data?.card;
      if (!card?.token) return null;
      return {
        token:    card.token,
        last4:    String(card.last_4digits ?? '').slice(-4),
        brand:    String(card.type ?? 'unknown').toUpperCase(),
        expMonth: parseInt(card.expiry?.split('/')?.[0] ?? '0', 10),
        expYear:  2000 + parseInt(card.expiry?.split('/')?.[1] ?? '0', 10),
        holder:   data.data?.customer?.name ?? null,
      };
    } catch (e: any) {
      this.logger.error(`Fetch card token failed (tx=${transactionId}): ${e.message}`);
      return null;
    }
  }

  // ── Bank account verification (driver onboarding) ────────────────────────

  /**
   * Resolve a bank account number to its registered name. Used during driver
   * onboarding to confirm the driver owns the bank account they're entering
   * for payouts. Prevents typos from sending money to the wrong person.
   *
   * Returns null if Flutterwave cannot resolve the account.
   */
  async verifyBankAccount(params: {
    bankCode:      string; // CBN bank code
    accountNumber: string;
  }): Promise<{ accountName: string } | null> {
    try {
      const data = await this.request<any>('POST', '/accounts/resolve', {
        account_number: params.accountNumber,
        account_bank:   params.bankCode,
      });
      return { accountName: data.data?.account_name ?? '' };
    } catch (e: any) {
      this.logger.warn(`Bank verify failed (${params.bankCode}/${params.accountNumber}): ${e.message}`);
      return null;
    }
  }

  // ── Webhook signature verification ───────────────────────────────────────

  /**
   * Verify an inbound Flutterwave webhook. Flutterwave sends the secret hash
   * (set in dashboard → webhook config) directly in the `verif-hash` header
   * of every webhook. We just compare it to our env var. Use timingSafeEqual
   * to avoid timing attacks.
   */
  verifyWebhookSignature(headerHash: string | undefined): boolean {
    if (!this.secretHash || !headerHash) return false;
    if (headerHash.length !== this.secretHash.length) return false;
    try {
      return timingSafeEqual(
        Buffer.from(headerHash, 'utf8'),
        Buffer.from(this.secretHash, 'utf8'),
      );
    } catch {
      return false;
    }
  }

  // ── Mobile money (MTN, Airtel, M-Pesa) ───────────────────────────────────

  async chargeMobileMoney(params: {
    txRef:    string;
    amount:   number;
    currency: string;   // 'GHS' for MTN Ghana, 'KES' for M-Pesa, etc.
    email:    string;
    phone:    string;
    network:  string;   // 'MTN' | 'AIRTEL' | 'MPESA'
  }): Promise<{ flwRef: string }> {
    const data = await this.request<any>('POST', '/charges?type=mobile_money_ghana', {
      tx_ref:       params.txRef,
      amount:       params.amount,
      currency:     params.currency,
      email:        params.email,
      phone_number: params.phone,
      network:      params.network,
    });
    return { flwRef: data.data.flw_ref };
  }
}
