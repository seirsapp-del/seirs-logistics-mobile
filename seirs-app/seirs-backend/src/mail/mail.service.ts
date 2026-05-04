import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// Brand colors per Master Spec V7 §G1 (Navy + Sky Blue, no orange).
const BRAND_BLUE = '#3A7BD5';
const BRAND_NAVY = '#0F2B4C';

function baseTemplate(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
    <body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%">
            <!-- Header -->
            <tr>
              <td style="background:${BRAND_NAVY};padding:24px 32px">
                <span style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:-0.5px">
                  <span style="color:${BRAND_BLUE}">Seirs</span> Logistics
                </span>
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
                <p style="margin:0;font-size:12px;color:#9CA3AF">
                  © ${new Date().getFullYear()} Seirs Logistics. All rights reserved.<br/>
                  You're receiving this because you have an account on Seirs.
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
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly cfg: ConfigService) {
    // ── Resend (preferred) ───────────────────────────────────────────────────
    // If RESEND_API_KEY is set, route everything through Resend's SMTP.
    // No domain verification needed if you keep the default
    // `Seirs <onboarding@resend.dev>` from-address — that works out of the box
    // for development. To send from your own domain (e.g. noreply@seirs.co),
    // verify it at resend.com/domains and set MAIL_FROM in Railway.
    const resendKey = cfg.get<string>('RESEND_API_KEY');

    if (resendKey) {
      this.transporter = nodemailer.createTransport({
        host:   'smtp.resend.com',
        port:   465,
        secure: true,
        auth:   { user: 'resend', pass: resendKey },
      });
      this.logger.log('Mail transport: Resend SMTP');
      return;
    }

    // ── Generic SMTP fallback ────────────────────────────────────────────────
    const host = cfg.get<string>('MAIL_HOST');
    const user = cfg.get<string>('MAIL_USER');
    const pass = cfg.get<string>('MAIL_PASS');

    if (host && user && pass) {
      const port = parseInt(cfg.get<string>('MAIL_PORT', '465'), 10);
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`Mail transport: SMTP (${host}:${port})`);
      return;
    }

    this.logger.error(
      'No mail credentials configured — set RESEND_API_KEY (or MAIL_HOST/MAIL_USER/MAIL_PASS). ' +
      'OTP and password-reset emails will NOT be delivered.',
    );
  }

  private async send(to: string, subject: string, html: string) {
    // Default from-address uses Resend's onboarding domain so it works
    // out of the box without any DNS verification. Override with MAIL_FROM
    // once you've verified seirs.co at resend.com/domains.
    const from = this.cfg.get<string>('MAIL_FROM', 'Seirs Logistics <onboarding@resend.dev>');
    if (!this.transporter) {
      this.logger.warn(`[MAIL-NOOP] Would send "${subject}" to ${to} — no transport configured`);
      return;
    }
    try {
      const info = await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email sent: "${subject}" → ${to} (id=${info.messageId})`);
    } catch (err) {
      this.logger.error(`Email send failed: "${subject}" → ${to}: ${(err as Error).message}`);
      throw err;
    }
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

  async sendPasswordReset(to: string, name: string, token: string) {
    const base     = this.cfg.get<string>('DEEP_LINK_BASE', 'seirsmobile:/');
    const resetUrl = `${base}/reset-password?token=${token}`;

    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Reset your password</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your Seirs password. Tap the button below within <strong>1 hour</strong>.</p>
      ${primaryButton(resetUrl, 'Reset Password')}
      <p style="font-size:13px;color:#6B7280">Or copy this link:<br/>
        <code style="font-size:12px;word-break:break-all">${resetUrl}</code>
      </p>
      <p style="font-size:13px;color:#9CA3AF">If you didn't request this, you can safely ignore this email.</p>
    `);

    await this.send(to, 'Reset your Seirs password', html);
  }

  // ── Welcome ─────────────────────────────────────────────────────────────────

  async sendWelcome(to: string, name: string) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Welcome to Seirs! 🎉</h2>
      <p>Hi ${name},</p>
      <p>Your Seirs account is ready. You can now send and track packages across Africa and Europe — fast, affordable, and reliable.</p>
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
      <p>Great news — a driver has been assigned to your delivery.</p>
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

    await this.send(to, `Package picked up — ${trackingCode}`, html);
  }

  // ── Delivery completed ───────────────────────────────────────────────────────

  async sendDeliveryComplete(to: string, name: string, trackingCode: string) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Package delivered! ${statusBadge('Delivered', '#16A34A')}</h2>
      <p>Hi ${name},</p>
      <p>Your package <strong>${trackingCode}</strong> has been successfully delivered. 🎉</p>
      <p>How was your experience? Open the Seirs app to rate your driver — it helps us improve!</p>
      <p style="font-size:13px;color:#9CA3AF;margin-top:24px">Thank you for choosing Seirs Logistics.</p>
    `);

    await this.send(to, `Delivered — ${trackingCode}`, html);
  }

  // ── Delivery failed ──────────────────────────────────────────────────────────

  async sendDeliveryFailed(to: string, name: string, trackingCode: string) {
    const html = baseTemplate(`
      <h2 style="margin:0 0 8px;color:${BRAND_NAVY}">Delivery could not be completed ${statusBadge('Failed', '#DC2626')}</h2>
      <p>Hi ${name},</p>
      <p>Unfortunately, your delivery <strong>${trackingCode}</strong> could not be completed.</p>
      <p>Our team is looking into this. If you paid by card or wallet, a refund will be processed within 3-5 business days.</p>
      <p>Please contact <a href="mailto:support@seirs.co" style="color:${BRAND_BLUE}">support@seirs.co</a> if you need help.</p>
    `);

    await this.send(to, `Delivery failed — ${trackingCode}`, html);
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
      <p style="font-size:13px;color:#9CA3AF">Earn more with Seirs — fast payouts, real-time support.</p>
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
      <p>If you think this is a mistake, contact <a href="mailto:support@seirs.co" style="color:${BRAND_BLUE}">support@seirs.co</a>.</p>
    `);

    await this.send(to, 'Update on your Seirs driver application', html);
  }

  // ── Handoff OTP (Spec V8 §1.17 — recipient verification at pickup) ──────────

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
      <p style="font-size:13px;color:#9CA3AF">Never share this code over the phone with anyone claiming to be Seirs support — we will never ask for it.</p>
    `);

    await this.send(to, 'Your Seirs pickup verification code', html);
  }
}
