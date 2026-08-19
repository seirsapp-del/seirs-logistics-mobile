import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

// Brand colors per Master Spec V7 §G1 (Navy + Sky Blue, no orange).
const BRAND_BLUE = '#3A7BD5';
const BRAND_NAVY = '#0F2B4C';

// Hosted on the marketing site (apps/seirs-website/public/). Email
// clients need an https-hosted image; inline SVG and data URIs are
// stripped by Gmail.
const LOGO_WHITE_URL = 'https://seirs-website.vercel.app/seirs-logo-white.png';

/**
 * `footerNote` overrides the default "you have a SEIRS account" line.
 * That line is false in an invitation, which goes to someone who does
 * not have an account: telling them they do is both wrong and the sort
 * of thing that makes a real email look like a phish.
 */
function baseTemplate(content: string, footerNote?: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
    <body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%">
            <!-- Header: okada mark + wordmark lockup (founder 2026-08-10) -->
            <tr>
              <td style="background:${BRAND_NAVY};padding:20px 32px">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="vertical-align:middle;padding-right:12px">
                    <img src="${LOGO_WHITE_URL}" width="38" height="38" alt="SEIRS" style="display:block;border:0"/>
                  </td>
                  <td style="vertical-align:middle">
                    <span style="font-size:19px;font-weight:bold;color:#ffffff;letter-spacing:6px;font-family:Arial,Helvetica,sans-serif">SEIRS</span><br/>
                    <span style="font-size:9px;color:#8FA8C7;letter-spacing:4px">LOGISTICS</span>
                  </td>
                </tr></table>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:32px;color:#111827;font-size:15px;line-height:1.6">
                ${content}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#F9FAFB;padding:20px 32px;border-top:1px solid #E5E7EB">
                <p style="margin:0 0 6px;font-size:12px;color:#9CA3AF">
                  © ${new Date().getFullYear()} Seirs Logistics · Lagos, Nigeria<br/>
                  ${footerNote ?? "You're receiving this because you have a SEIRS account."}
                </p>
                <p style="margin:0;font-size:12px">
                  <a href="https://seirs-website.vercel.app/faq" style="color:${BRAND_BLUE};text-decoration:none">Help centre</a>
                  &nbsp;·&nbsp;
                  <a href="https://seirs-website.vercel.app/contact" style="color:${BRAND_BLUE};text-decoration:none">Contact support</a>
                  &nbsp;·&nbsp;
                  <a href="https://seirs-website.vercel.app/privacy-policy" style="color:${BRAND_BLUE};text-decoration:none">Privacy</a>
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

function primaryButton(href: string, label: string): string {
  return `
    <a href="${href}"
       style="display:inline-block;background:${BRAND_BLUE};color:#ffffff;
              padding:14px 28px;border-radius:8px;text-decoration:none;
              font-weight:bold;font-size:15px;margin:20px 0">
      ${label}
    </a>
  `;
}

function statusBadge(label: string, color: string): string {
  return `<span style="display:inline-block;background:${color};color:#fff;
                        padding:4px 12px;border-radius:999px;font-size:13px;
                        font-weight:bold">${label}</span>`;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;
  private smtpTransporter: nodemailer.Transporter | null = null;

  constructor(private readonly cfg: ConfigService) {
    // ── Resend HTTP API (preferred - works on Railway/Heroku/etc) ────────────
    // Cloud platforms commonly block outbound SMTP (port 465/587), so we use
    // Resend's HTTPS API directly. No domain verification needed if you keep
    // the default `Seirs <onboarding@resend.dev>` from-address. To send from
    // your own domain, verify it at resend.com/domains and set MAIL_FROM.
    const resendKey = cfg.get<string>('RESEND_API_KEY');

    if (resendKey) {
      this.resend = new Resend(resendKey);
      this.logger.log('Mail transport: Resend HTTP API');
      return;
    }

    // ── Generic SMTP fallback (only useful on hosts that don't block SMTP) ──
    const host = cfg.get<string>('MAIL_HOST');
    const user = cfg.get<string>('MAIL_USER');
    const pass = cfg.get<string>('MAIL_PASS');

    if (host && user && pass) {
      const port = parseInt(cfg.get<string>('MAIL_PORT', '465'), 10);
      this.smtpTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`Mail transport: SMTP (${host}:${port})`);
      return;
    }

    this.logger.error(
      'No mail credentials configured - set RESEND_API_KEY (or MAIL_HOST/MAIL_USER/MAIL_PASS). ' +
      'OTP and password-reset emails will NOT be delivered.',
    );
  }

  // Generic sender for one-off transactional emails that don't warrant a
  // dedicated template method (e.g. tier-drop warning, ad-hoc admin
  // notices). The body is inserted as escaped text inside a minimal
  // wrapper; pass plain text, not HTML.
  async sendGeneric(to: string, name: string, subject: string, bodyText: string) {
    const escaped = String(bodyText)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
      <h2 style="color:#0F2B4C;margin:0 0 12px">${subject}</h2>
      <pre style="white-space:pre-wrap;font-family:inherit;line-height:1.5">${escaped}</pre>
    </div>`;
    return this.send(to, subject, html);
  }

  private async send(to: string, subject: string, html: string) {
    // Default from-address uses Resend's onboarding domain so it works
    // out of the box without any DNS verification. Override with MAIL_FROM
    // once you've verified seirs.co at resend.com/domains.
    const from = this.cfg.get<string>('MAIL_FROM', 'Seirs Logistics <onboarding@resend.dev>');

    if (this.resend) {
      try {
        const { data, error } = await this.resend.emails.send({ from, to, subject, html });
        if (error) {
          this.logger.error(`Email send failed: "${subject}" → ${to}: ${error.message}`);
          throw new Error(error.message);
        }
        this.logger.log(`Email sent: "${subject}" → ${to} (id=${data?.id})`);
      } catch (err) {
        this.logger.error(`Email send failed: "${subject}" → ${to}: ${(err as Error).message}`);
        throw err;
      }
      return;
    }

    if (this.smtpTransporter) {
      try {
        const info = await this.smtpTransporter.sendMail({ from, to, subject, html });
        this.logger.log(`Email sent (SMTP): "${subject}" → ${to} (id=${info.messageId})`);
      } catch (err) {
        this.logger.error(`Email send failed (SMTP): "${subject}" → ${to}: ${(err as Error).message}`);
        throw err;
      }
      return;
    }

    this.logger.warn(`[MAIL-NOOP] Would send "${subject}" to ${to} - no transport configured`);
  }

  // ── Email verification OTP ──────────────────────────────────────────────────

  async sendEmailVerification(to: string, name: string, otp: string) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Verify your email</h2>
      <p>Hi ${name},</p>
      <p>Use the code below to verify your Seirs account. It expires in <strong>15 minutes</strong>.</p>
      <div style="margin:24px 0;text-align:center">
        <div style="display:inline-block;background:#F3F4F6;border-radius:12px;
                    padding:20px 36px;letter-spacing:12px;font-size:36px;
                    font-weight:bold;color:${BRAND_NAVY}">${otp}</div>
      </div>
      <p style="font-size:13px;color:#9CA3AF">If you didn't create a Seirs account, you can safely ignore this email.</p>
    `);

    await this.send(to, 'Your Seirs verification code', html);
  }

  // ── Password reset ──────────────────────────────────────────────────────────

  // Live test 2026-08-10: Gmail (and most mail clients) refuse custom
  // app schemes (seirsdriver:// etc), so deep-linked reset buttons did
  // nothing. Mobile audiences now get an https page on the marketing
  // site where they set the new password in the browser; the app param
  // only personalises that page. Admin keeps its dashboard URL.
  async sendPasswordReset(
    to: string, name: string, token: string,
    audience: 'mobile' | 'admin' | 'customer' | 'driver' | 'business' = 'customer',
  ) {
    const app = audience === 'mobile' ? 'customer' : audience;
    const resetUrl = audience === 'admin'
      ? `${this.cfg.get<string>('ADMIN_WEB_URL', 'https://seirs-admin.vercel.app')}/reset-password?token=${token}`
      : `${this.cfg.get<string>('WEBSITE_URL', 'https://seirs-website.vercel.app')}/reset-password?token=${token}&app=${app}`;

    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Reset your password</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset the password on your SEIRS account. Tap the button below to choose a new one.</p>
      ${primaryButton(resetUrl, 'Reset Password')}
      <p style="font-size:13px;color:#6B7280;margin:4px 0 20px">
        This link works once and expires in <strong>30 minutes</strong>.
        If the button doesn't open, copy this link into your browser:<br/>
        <a href="${resetUrl}" style="color:${BRAND_BLUE};font-size:12px;word-break:break-all">${resetUrl}</a>
      </p>
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.5">
            <strong style="color:#111827">Didn't request this?</strong>
            You can safely ignore this email - your password stays the same.
            For your security, never share this link. SEIRS staff will never ask you for it.
          </p>
        </td>
      </tr></table>
    `);

    await this.send(to, 'Reset your SEIRS password', html);
  }

  // ── Welcome ─────────────────────────────────────────────────────────────────

  async sendWelcome(to: string, name: string) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Welcome to Seirs!</h2>
      <p>Hi ${name},</p>
      <p>Your Seirs account is ready. You can now send and track packages across Africa and Europe - fast, affordable, and reliable.</p>
      <p><strong>What you can do:</strong></p>
      <ul style="padding-left:20px;color:#374151">
        <li>Send packages with real-time tracking</li>
        <li>Choose economy, standard, or instant delivery</li>
        <li>Pay by card, bank transfer, or Seirs wallet</li>
      </ul>
      <p style="font-size:13px;color:#6B7280">Download the Seirs app to get started.</p>
    `);

    await this.send(to, 'Welcome to Seirs Logistics!', html);
  }

  // ── Delivery assigned ────────────────────────────────────────────────────────

  async sendDeliveryAssigned(
    to: string,
    name: string,
    trackingCode: string,
    driverName: string,
    vehicleType: string,
  ) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Driver on the way!</h2>
      <p>Hi ${name},</p>
      <p>Great news - a driver has been assigned to your delivery.</p>
      <table style="background:#F9FAFB;border-radius:8px;padding:16px 20px;width:100%;margin:16px 0">
        <tr><td style="color:#6B7280;font-size:13px">Tracking Code</td>
            <td style="font-weight:bold;text-align:right">${trackingCode}</td></tr>
        <tr><td style="color:#6B7280;font-size:13px;padding-top:8px">Driver</td>
            <td style="font-weight:bold;text-align:right;padding-top:8px">${driverName}</td></tr>
        <tr><td style="color:#6B7280;font-size:13px;padding-top:8px">Vehicle</td>
            <td style="font-weight:bold;text-align:right;padding-top:8px;text-transform:capitalize">${vehicleType}</td></tr>
      </table>
      <p style="font-size:13px;color:#6B7280">Open the Seirs app to track your delivery in real time.</p>
    `);

    await this.send(to, `Driver assigned for ${trackingCode}`, html);
  }

  // ── Delivery picked up ───────────────────────────────────────────────────────

  async sendDeliveryPickedUp(to: string, name: string, trackingCode: string) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Package collected ${statusBadge('Picked Up', '#2563EB')}</h2>
      <p>Hi ${name},</p>
      <p>Your package <strong>${trackingCode}</strong> has been collected by the driver and is on its way.</p>
      <p style="font-size:13px;color:#6B7280">Track your delivery in the Seirs app for live updates.</p>
    `);

    await this.send(to, `Package picked up - ${trackingCode}`, html);
  }

  // ── Delivery completed ───────────────────────────────────────────────────────

  async sendDeliveryComplete(to: string, name: string, trackingCode: string) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Package delivered! ${statusBadge('Delivered', '#16A34A')}</h2>
      <p>Hi ${name},</p>
      <p>Your package <strong>${trackingCode}</strong> has been successfully delivered.</p>
      <p>How was your experience? Open the Seirs app to rate your driver - it helps us improve!</p>
      <p style="font-size:13px;color:#9CA3AF;margin-top:24px">Thank you for choosing Seirs Logistics.</p>
    `);

    await this.send(to, `Delivered - ${trackingCode}`, html);
  }

  // Receipt resend - triggered by the customer tapping "Email receipt" on
  // the in-app receipt screen. Plain-text fare breakdown for reliability.
  async sendDeliveryReceipt(
    to: string,
    name: string,
    trackingCode: string,
    totalNaira: number,
    paymentMethod: string,
    completedAt?: Date,
  ) {
    const formattedDate = completedAt
      ? new Date(completedAt).toLocaleString('en-NG', { dateStyle: 'long', timeStyle: 'short' })
      : '-';
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Your SEIRS receipt</h2>
      <p>Hi ${name},</p>
      <p>Here's the receipt for delivery <strong>${trackingCode}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#6B7280">Tracking code</td><td align="right"><strong>${trackingCode}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6B7280">Completed</td><td align="right">${formattedDate}</td></tr>
        <tr><td style="padding:6px 0;color:#6B7280">Payment method</td><td align="right">${paymentMethod}</td></tr>
        <tr><td style="padding:12px 0;border-top:1px solid #E5E7EB"><strong>Total paid</strong></td>
            <td align="right" style="padding:12px 0;border-top:1px solid #E5E7EB"><strong>₦${totalNaira.toLocaleString()}</strong></td></tr>
      </table>
      <p style="font-size:13px;color:#9CA3AF">Keep this email for your records. Contact us from the Help centre if anything looks wrong.</p>
    `);

    await this.send(to, `Receipt - ${trackingCode}`, html);
  }

  // ── Delivery failed ──────────────────────────────────────────────────────────

  async sendDeliveryFailed(to: string, name: string, trackingCode: string) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Delivery could not be completed ${statusBadge('Failed', '#DC2626')}</h2>
      <p>Hi ${name},</p>
      <p>Unfortunately, your delivery <strong>${trackingCode}</strong> could not be completed.</p>
      <p>Our team is looking into this. If you paid by card or wallet, a refund will be processed within 3-5 business days.</p>
      <p>Please <a href="https://seirs-website.vercel.app/contact" style="color:${BRAND_BLUE}">contact support</a> if you need help.</p>
    `);

    await this.send(to, `Delivery failed - ${trackingCode}`, html);
  }

  // ── Driver approved ──────────────────────────────────────────────────────────

  async sendDriverApproved(to: string, name: string) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">You're approved! ${statusBadge('Approved', '#16A34A')}</h2>
      <p>Hi ${name},</p>
      <p>Congratulations! Your Seirs driver account has been verified and approved.</p>
      <p>You can now go online and start accepting delivery jobs. Here's how to get started:</p>
      <ol style="padding-left:20px;color:#374151">
        <li>Open the Seirs Driver app</li>
        <li>Tap <strong>"Go Online"</strong> on your home screen</li>
        <li>Start receiving delivery jobs near you</li>
      </ol>
      <p style="font-size:13px;color:#9CA3AF">Earn more with Seirs - fast payouts, real-time support.</p>
    `);

    await this.send(to, 'Your Seirs driver account is approved!', html);
  }

  // ── Driver rejected ──────────────────────────────────────────────────────────

  async sendDriverRejected(to: string, name: string, reason?: string) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Account verification update</h2>
      <p>Hi ${name},</p>
      <p>We reviewed your driver application and unfortunately we couldn't approve it at this time.</p>
      ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
      <p>You can re-apply with updated documents by opening the Seirs app and going to <strong>Profile → KYC Verification</strong>.</p>
      <p>If you think this is a mistake, <a href="https://seirs-website.vercel.app/contact" style="color:${BRAND_BLUE}">contact support</a>.</p>
    `);

    await this.send(to, 'Update on your Seirs driver application', html);
  }

  // ── Handoff OTP (Spec V8 §1.17 - recipient verification at pickup) ──────────

  async sendHandoffOtp(to: string, name: string, otp: string, deliveryRef: string) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Pickup verification code</h2>
      <p>Hi ${name},</p>
      <p>Show this code to the partner staff (or driver) when collecting your delivery. It expires in <strong>10 minutes</strong>.</p>
      <div style="margin:24px 0;text-align:center">
        <div style="display:inline-block;background:#F3F4F6;border-radius:12px;
                    padding:20px 36px;letter-spacing:12px;font-size:36px;
                    font-weight:bold;color:${BRAND_NAVY}">${otp}</div>
      </div>
      <p style="font-size:13px;color:#9CA3AF">Delivery reference: ${deliveryRef}</p>
      <p style="font-size:13px;color:#9CA3AF">Never share this code over the phone with anyone claiming to be Seirs support - we will never ask for it.</p>
    `);

    await this.send(to, 'Your Seirs pickup verification code', html);
  }
}
