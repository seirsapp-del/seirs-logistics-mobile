import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplate } from './email-template.entity';

// Spec V8 §3.13 — admin-editable email template store.
//
// MailService consults this on every transactional send. If no active
// override exists for a key, the in-code default in mail.service.ts is
// used (so existing flows keep working before the table is seeded).
//
// SEED_TEMPLATES below is the canonical catalogue. The admin UI reads
// it as well so it can render the editor list even before any rows
// have been written.

export interface TemplateSeed {
  key:      string;
  name:     string;       // human label for the admin UI
  subject:  string;
  bodyHtml: string;
  vars:     string[];
}

export const SEED_TEMPLATES: TemplateSeed[] = [
  {
    key:      'email_verification',
    name:     'Email Verification OTP',
    subject:  'Your SEIRS verification code',
    bodyHtml: `<p>Hi {{name}},</p><p>Your SEIRS verification code is <b>{{otp}}</b>. It expires in 10 minutes.</p>`,
    vars:     ['name', 'otp'],
  },
  {
    key:      'password_reset',
    name:     'Password Reset Link',
    subject:  'Reset your SEIRS password',
    bodyHtml: `<p>Hi {{name}},</p><p>Tap below to reset your password (link expires in 15 minutes).</p><p><a href="{{resetUrl}}">Reset password</a></p>`,
    vars:     ['name', 'resetUrl'],
  },
  {
    key:      'welcome',
    name:     'Welcome',
    subject:  'Welcome to SEIRS!',
    bodyHtml: `<p>Hi {{name}},</p><p>Welcome aboard. Send your first package or book a ride right inside the app.</p>`,
    vars:     ['name'],
  },
  {
    key:      'delivery_assigned',
    name:     'Delivery — Driver Assigned',
    subject:  'Your driver is on the way',
    bodyHtml: `<p>Hi {{name}},</p><p>{{driverName}} has been assigned to pick up your package <b>{{trackingCode}}</b>.</p>`,
    vars:     ['name', 'trackingCode', 'driverName'],
  },
  {
    key:      'delivery_picked_up',
    name:     'Delivery — Picked Up',
    subject:  'Your package is in transit',
    bodyHtml: `<p>Hi {{name}},</p><p>Your package <b>{{trackingCode}}</b> is on its way to the recipient.</p>`,
    vars:     ['name', 'trackingCode'],
  },
  {
    key:      'delivery_complete',
    name:     'Delivery — Complete',
    subject:  'Your delivery is complete',
    bodyHtml: `<p>Hi {{name}},</p><p>Your package <b>{{trackingCode}}</b> has been delivered. Tap inside the app to rate your driver.</p>`,
    vars:     ['name', 'trackingCode'],
  },
  {
    key:      'delivery_failed',
    name:     'Delivery — Failed',
    subject:  'Delivery attempt failed',
    bodyHtml: `<p>Hi {{name}},</p><p>We could not complete delivery of <b>{{trackingCode}}</b>. Our support team will be in touch.</p>`,
    vars:     ['name', 'trackingCode'],
  },
  {
    key:      'driver_approved',
    name:     'Driver Approved',
    subject:  'Your SEIRS driver application is approved',
    bodyHtml: `<p>Hi {{name}},</p><p>Your application has been approved. Open the driver app and go online to start earning.</p>`,
    vars:     ['name'],
  },
  {
    key:      'driver_rejected',
    name:     'Driver Rejected',
    subject:  'Update on your SEIRS driver application',
    bodyHtml: `<p>Hi {{name}},</p><p>We were unable to approve your application. Reason: {{reason}}.</p>`,
    vars:     ['name', 'reason'],
  },
  {
    key:      'handoff_otp',
    name:     'Handoff Pickup OTP',
    subject:  'Your SEIRS pickup verification code',
    bodyHtml: `<p>Hi {{name}},</p><p>Your pickup code for delivery <b>{{deliveryRef}}</b> is <b>{{otp}}</b>. Share it only with the partner staff or driver at handoff.</p>`,
    vars:     ['name', 'otp', 'deliveryRef'],
  },
];

@Injectable()
export class EmailTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplatesService.name);

  constructor(
    @InjectRepository(EmailTemplate) private repo: Repository<EmailTemplate>,
  ) {}

  // Idempotent seed — inserts the canonical SEED_TEMPLATES on first
  // boot. Existing rows are left alone so admin edits survive.
  async onModuleInit() {
    const count = await this.repo.count();
    if (count > 0) return;
    const rows = SEED_TEMPLATES.map(t => this.repo.create({
      key:      t.key,
      subject:  t.subject,
      bodyHtml: t.bodyHtml,
      vars:     t.vars,
      active:   true,
    }));
    await this.repo.save(rows);
    this.logger.log(`Seeded ${rows.length} email templates`);
  }

  /**
   * Render a template's subject + body with var substitution. If no
   * active override is found, returns null so the caller can fall back
   * to its hardcoded default.
   */
  async render(key: string, vars: Record<string, string | number>): Promise<{ subject: string; html: string } | null> {
    const row = await this.repo.findOne({ where: { key, active: true } });
    if (!row) return null;
    return {
      subject: this.interpolate(row.subject,  vars),
      html:    this.interpolate(row.bodyHtml, vars),
    };
  }

  private interpolate(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
      const v = vars[k];
      return v != null ? String(v) : '';
    });
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  // The admin UI merges this with SEED_TEMPLATES to render the editor
  // catalogue — so unseeded templates still show in the list.
  async listForAdmin() {
    const rows = await this.repo.find();
    const byKey = new Map(rows.map(r => [r.key, r]));
    return SEED_TEMPLATES.map(t => {
      const row = byKey.get(t.key);
      return {
        key:      t.key,
        name:     t.name,
        vars:     t.vars,
        defaults: { subject: t.subject, bodyHtml: t.bodyHtml },
        override: row ?? null,
      };
    });
  }

  async upsertOverride(key: string, body: {
    subject?: string; bodyHtml?: string; active?: boolean; editedByUserId?: string;
  }) {
    const seed = SEED_TEMPLATES.find(t => t.key === key);
    if (!seed) throw new NotFoundException(`Unknown template key: ${key}`);

    let row = await this.repo.findOne({ where: { key } });
    if (!row) {
      row = this.repo.create({
        key,
        subject:  body.subject  ?? seed.subject,
        bodyHtml: body.bodyHtml ?? seed.bodyHtml,
        vars:     seed.vars,
        active:   body.active ?? true,
        lastEditedByUserId: body.editedByUserId,
      });
    } else {
      if (body.subject  !== undefined) row.subject  = body.subject;
      if (body.bodyHtml !== undefined) row.bodyHtml = body.bodyHtml;
      if (body.active   !== undefined) row.active   = body.active;
      if (body.editedByUserId) row.lastEditedByUserId = body.editedByUserId;
    }
    return this.repo.save(row);
  }
}
