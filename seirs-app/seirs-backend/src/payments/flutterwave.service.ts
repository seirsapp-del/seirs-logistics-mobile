import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Flutterwave is the sole payment processor for Seirs.
// Covers: card payments, bank transfers, mobile money (GHS/KES/UGX/TZS),
//         driver earnings payouts, refunds, payment verification.

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);
  private readonly baseUrl = 'https://api.flutterwave.com/v3';
  private readonly secretKey: string;

  constructor(cfg: ConfigService) {
    this.secretKey = cfg.get<string>('FLUTTERWAVE_SECRET_KEY', '');
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
