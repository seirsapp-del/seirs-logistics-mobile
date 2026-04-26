import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface PaystackInitResponse {
  status:        boolean;
  message:       string;
  data: {
    authorization_url: string;
    access_code:       string;
    reference:         string;
  };
}

interface PaystackVerifyResponse {
  status:  boolean;
  message: string;
  data: {
    status:    string; // 'success' | 'failed' | 'pending'
    reference: string;
    amount:    number; // in kobo
    currency:  string;
    paid_at:   string;
    metadata:  any;
  };
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;

  constructor(cfg: ConfigService) {
    this.secretKey = cfg.get<string>('PAYSTACK_SECRET_KEY', '');
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
    if (!res.ok) {
      this.logger.error(`Paystack ${method} ${path} failed: ${JSON.stringify(json)}`);
      throw new Error((json as any).message ?? 'Paystack request failed');
    }
    return json;
  }

  // Step 1: Initialize transaction → get authorization URL for customer
  async initializeTransaction(params: {
    email:      string;
    amountKobo: number;
    reference:  string;
    metadata:   object;
    callbackUrl?: string;
  }): Promise<{ authorizationUrl: string; reference: string }> {
    const data = await this.request<PaystackInitResponse>('POST', '/transaction/initialize', {
      email:        params.email,
      amount:       params.amountKobo,
      reference:    params.reference,
      metadata:     params.metadata,
      callback_url: params.callbackUrl,
      currency:     'NGN',
    });

    return {
      authorizationUrl: data.data.authorization_url,
      reference:        data.data.reference,
    };
  }

  // Step 2: Verify payment after customer completes it
  async verifyTransaction(reference: string): Promise<{
    success:    boolean;
    amountKobo: number;
    reference:  string;
  }> {
    const data = await this.request<PaystackVerifyResponse>(
      'GET',
      `/transaction/verify/${reference}`,
    );

    return {
      success:    data.data.status === 'success',
      amountKobo: data.data.amount,
      reference:  data.data.reference,
    };
  }

  // Refund a transaction
  async refund(reference: string, amountKobo?: number): Promise<boolean> {
    try {
      await this.request('POST', '/refund', {
        transaction: reference,
        amount:      amountKobo,
      });
      return true;
    } catch (e) {
      this.logger.error(`Refund failed for ${reference}: ${e.message}`);
      return false;
    }
  }

  // Transfer to driver's bank account (for withdrawals)
  async transferToBank(params: {
    amountKobo:    number;
    bankCode:      string;
    accountNumber: string;
    accountName:   string;
    reason:        string;
    reference:     string;
  }): Promise<boolean> {
    try {
      // Step 1: Create transfer recipient
      const recipientRes = await this.request<any>('POST', '/transferrecipient', {
        type:           'nuban',
        name:           params.accountName,
        account_number: params.accountNumber,
        bank_code:      params.bankCode,
        currency:       'NGN',
      });

      // Step 2: Initiate transfer
      await this.request('POST', '/transfer', {
        source:     'balance',
        amount:     params.amountKobo,
        recipient:  recipientRes.data.recipient_code,
        reason:     params.reason,
        reference:  params.reference,
      });

      return true;
    } catch (e) {
      this.logger.error(`Transfer failed: ${e.message}`);
      return false;
    }
  }
}
