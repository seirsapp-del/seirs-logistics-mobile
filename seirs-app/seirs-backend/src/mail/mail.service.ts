import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly cfg: ConfigService) {
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
    }
  }

  async sendPasswordReset(to: string, name: string, token: string) {
    const base     = this.cfg.get<string>('DEEP_LINK_BASE', 'seirsmobile:/');
    const resetUrl = `${base}/reset-password?token=${token}`;
    const from      = this.cfg.get<string>('MAIL_FROM', 'Seirs App <noreply@seirs.app>');

    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0D1B2A">Reset your Seirs password</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your password. Tap the button below in the next <strong>1 hour</strong>.</p>
        <a href="${resetUrl}"
           style="display:inline-block;background:#F4600C;color:#fff;padding:14px 28px;
                  border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
          Reset Password
        </a>
        <p>Or copy this link:<br/><code style="font-size:12px">${resetUrl}</code></p>
        <p style="color:#9CA3AF;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #E5E7EB"/>
        <p style="color:#9CA3AF;font-size:12px">Seirs Logistics — Internal</p>
      </div>
    `;

    if (!this.transporter) {
      this.logger.warn(`[MAIL-DEV] Reset link for ${to} → ${resetUrl}`);
      return;
    }

    await this.transporter.sendMail({ from, to, subject: 'Reset your Seirs password', html });
    this.logger.log(`Password reset email sent to ${to}`);
  }

  async sendWelcome(to: string, name: string) {
    if (!this.transporter) {
      this.logger.log(`[MAIL-DEV] Welcome email would be sent to ${to}`);
      return;
    }
    const from = this.cfg.get<string>('MAIL_FROM', 'Seirs App <noreply@seirs.app>');
    await this.transporter.sendMail({
      from,
      to,
      subject: 'Welcome to Seirs!',
      html: `<p>Hi ${name}, welcome to Seirs Logistics. Your account is ready.</p>`,
    });
  }
}
