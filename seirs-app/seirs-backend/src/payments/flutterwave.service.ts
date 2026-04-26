import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Flutterwave is used for:
// - Ghana (GHS), Kenya (KES), Uganda (UGX), Tanzania (TZS)
// - Mobile money (MTN MoMo, Airtel, M-Pesa)
// - When Paystack isn't available in the user's country

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

  // Initialize payment — returns hosted payment page URL
  async initializePayment(params: {
    txRef:       string;
    amount:      number;   // in major currency unit (e.g. ₦1500, not kobo)
    currency:    string;   // 'NGN' | 'GHS' | 'KES' | 'UGX'
    email:       string;
    phone:       string;
    name:        string;
    redirectUrl: string;
    meta:        object;
  }): Promise<{ paymentLink: string; txRef: string }> {
    const data = await this.request<any>('POST', '/payments', {
      tx_ref:       params.txRef,
      amount:       params.amount,
      currency:     params.currency,
      redirect_url: params.redirectUrl,
      customer: {
        email:       params.email,
        phonenumber: params.phone,
        name:        params.name,
      },
      meta:          params.meta,
      payment_options: 'card,banktransfer,mobilemoney,ussd',
    });

    return {
      paymentLink: data.data.link,
      txRef:       params.txRef,
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

  async verifyByTxRef(txRef: string): Promise<{
    success:       boolean;
    amount:        number;
    transactionId: number;
  }> {
    const data = await this.request<any>('GET', `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);
    return {
      success:       data.data.status === 'successful',
      amount:        data.data.amount,
      transactionId: data.data.id,
    };
  }

  async refundTransaction(transactionId: number, amount: number): Promise<void> {
    await this.request<any>('POST', `/transactions/${transactionId}/refund`, { amount });
  }

  // Mobile money payment (MTN, Airtel, M-Pesa)
  async chargeMobileMoney(params: {
    txRef:    string;
    amount:   number;
    currency: string;   // 'GHS' for MTN Ghana, 'KES' for M-Pesa, etc.
    email:    string;
    phone:    string;
    network:  string;   // 'MTN' | 'AIRTEL' | 'MPESA'
  }): Promise<{ flwRef: string }> {
    const data = await this.request<any>('POST', '/charges?type=mobile_money_ghana', {
      tx_ref:   params.txRef,
      amount:   params.amount,
      currency: params.currency,
      email:    params.email,
      phone_number: params.phone,
      network:  params.network,
    });
    return { flwRef: data.data.flw_ref };
  }
}
