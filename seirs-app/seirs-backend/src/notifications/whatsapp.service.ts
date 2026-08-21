import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * WhatsApp Business messaging, for the one person in this system who has
 * no SEIRS account: the receiver.
 *
 * Almost every failure route depends on reaching them, and until now the
 * receiver was a name and a phone number with nothing attached to it.
 * There is no SMS at launch (founder decision), so this is the channel.
 *
 * Why WhatsApp rather than SMS, for the record:
 *   - It is free to the recipient, which matters when we are asking
 *     somebody to go and collect a package they did not order.
 *   - Template messages can be sent to someone who has never messaged us
 *     first, which is exactly the receiver's situation. SMS can do that
 *     too; the rest of this list is what SMS cannot do.
 *   - It carries images, so a photo of the parcel at the counter settles
 *     most "is that really mine" doubt before anyone travels.
 *   - Delivery and read receipts become evidence. When a package is
 *     disposed of after notice, we can show the notice arrived and was
 *     read, which a clause in the terms does not give us.
 *   - A reply opens a real thread, so a receiver can say "I am at work
 *     until six" without installing anything.
 *
 * Env-gated in the same shape as FcmService: with no credentials this
 * logs and returns false rather than throwing, so nothing in the delivery
 * flow depends on WhatsApp being configured.
 *
 * ACTIVATION (all founder-side, none of it can be done from code):
 *   1. Meta Business account, verified.
 *   2. A phone number registered to WhatsApp Business, not already on
 *      personal WhatsApp.
 *   3. Message templates submitted and APPROVED by Meta. Template names
 *      below must match exactly what is approved.
 *   4. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiVersion = 'v21.0';

  constructor(private readonly cfg: ConfigService) {}

  private get phoneNumberId(): string | undefined {
    return this.cfg.get<string>('WHATSAPP_PHONE_NUMBER_ID');
  }

  private get accessToken(): string | undefined {
    return this.cfg.get<string>('WHATSAPP_ACCESS_TOKEN');
  }

  get enabled(): boolean {
    return Boolean(this.phoneNumberId && this.accessToken);
  }

  /**
   * Nigerian numbers arrive in every shape a person can type one.
   * WhatsApp wants international digits with no plus and no spaces.
   */
  private normalise(phone: string): string | null {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('234')) return digits;
    if (digits.startsWith('0')) return '234' + digits.slice(1);
    // A bare 10-digit local number, e.g. 8031234567.
    if (digits.length === 10) return '234' + digits;
    return digits;
  }

  /**
   * Send an approved template message.
   *
   * Templates, not free text, because free-form messages are only
   * allowed inside a 24 hour window opened by the recipient, and a
   * receiver who has never contacted us has no such window.
   */
  async sendTemplate(
    phone: string,
    templateName: string,
    variables: string[] = [],
  ): Promise<boolean> {
    if (!this.enabled) {
      this.logger.debug(
        `WhatsApp not configured, skipping "${templateName}". ` +
        'Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to enable.',
      );
      return false;
    }

    const to = this.normalise(phone);
    if (!to) {
      this.logger.warn(`WhatsApp: unusable phone number, skipping "${templateName}"`);
      return false;
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: templateName,
              language: { code: 'en' },
              components: variables.length
                ? [{
                    type: 'body',
                    parameters: variables.map((v) => ({ type: 'text', text: String(v) })),
                  }]
                : undefined,
            },
          }),
        },
      );

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.error(`WhatsApp send failed (${res.status}): ${detail.slice(0, 300)}`);
        return false;
      }
      return true;
    } catch (e: any) {
      // Never let a messaging failure break a delivery transition.
      this.logger.error(`WhatsApp send threw: ${e?.message ?? e}`);
      return false;
    }
  }

  /**
   * "Your package is at a counter, here is what to pay and where to go."
   *
   * The link goes to /collect/[code], which takes payment from whoever
   * holds it. That is the whole reason this channel exists: the receiver
   * owes the fee and has no app to pay it in.
   */
  async notifyPackageAtCounter(
    phone: string,
    trackingCode: string,
    amountNgn: number,
    collectUrl: string,
  ): Promise<boolean> {
    return this.sendTemplate(phone, 'package_at_counter', [
      trackingCode,
      `NGN ${Number(amountNgn).toLocaleString()}`,
      collectUrl,
    ]);
  }

  /** Last notice before an uncollected package is returned or disposed of. */
  async notifyCollectionDeadline(
    phone: string,
    trackingCode: string,
    deadline: string,
    collectUrl: string,
  ): Promise<boolean> {
    return this.sendTemplate(phone, 'collection_deadline', [
      trackingCode,
      deadline,
      collectUrl,
    ]);
  }
}
