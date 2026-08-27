import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplate } from './email-template.entity';

// Spec V8 §3.13 - admin-editable email template store.
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


/**
 * Stand-in values for a test send. Real Nigerian names across the three
 * major groups, because a preview full of "John Doe" tells the founder
 * nothing about how a real name sits in the layout.
 */
const SAMPLE_VARS: Record<string, string> = {
  name:         'Chinelo Okafor',
  driverName:   'Ibrahim Musa',
  otp:          '284915',
  trackingCode: 'SRS-9CJ7LJP2',
  deliveryRef:  'SRS-9CJ7LJP2',
  resetUrl:     'https://seirs.co/reset-password?token=sample',
  vehicleType:  'motorcycle',
  totalNaira:   '2,609.06',
  paymentMethod:'Card',
  reason:       'Your vehicle documents had expired.',
  headline:     'Free delivery on your next two runs',
  message:      'We are saying thank you to our earliest senders in Lagos.',
  promoCode:    'SEIRS2X',
  expiresOn:    '31 December 2026',
  lastYear:     '2026',
  thisYear:     '2027',
};


/**
 * Seasonal and promotional sends (founder 2026-08-27: "create email
 * just incase of promotions, christmas, new year etc").
 *
 * These are not triggered by anything in code. They exist so the
 * catalogue has them to edit, banner, and test-send, which is what
 * makes a seasonal campaign a content job rather than a deploy. Each
 * ships with a default accent so it does not arrive looking like a
 * receipt, and the founder can change all of it from the editor.
 */
const SEASONAL_TEMPLATES: TemplateSeed[] = [
  {
    key:      'seasonal_christmas',
    name:     'Christmas greeting',
    subject:  'Compliments of the season from SEIRS',
    bodyHtml: `<p>Hi {{name}},</p><p>Thank you for trusting us with your deliveries this year. Our riders will be moving through the holidays, so if something needs to reach family before the day, we are on the road.</p><p>From all of us at SEIRS, a peaceful Christmas.</p>`,
    vars:     ['name'],
  },
  {
    key:      'seasonal_new_year',
    name:     'New Year greeting',
    subject:  'Happy New Year from SEIRS',
    bodyHtml: `<p>Hi {{name}},</p><p>Thank you for riding with us through {{lastYear}}. We are open through the new year and ready whenever you are.</p><p>Here is to a good {{thisYear}}.</p>`,
    vars:     ['name', 'lastYear', 'thisYear'],
  },
  {
    key:      'promotion_generic',
    name:     'Promotion or offer',
    subject:  '{{headline}}',
    bodyHtml: `<p>Hi {{name}},</p><p>{{message}}</p><p>Use code <b>{{promoCode}}</b> in the app before {{expiresOn}}.</p>`,
    vars:     ['name', 'headline', 'message', 'promoCode', 'expiresOn'],
  },
  {
    key:      'announcement',
    name:     'General announcement',
    subject:  '{{headline}}',
    bodyHtml: `<p>Hi {{name}},</p><p>{{message}}</p>`,
    vars:     ['name', 'headline', 'message'],
  },
];

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
    name:     'Delivery - Driver Assigned',
    subject:  'Your driver is on the way',
    bodyHtml: `<p>Hi {{name}},</p><p>{{driverName}} has been assigned to pick up your package <b>{{trackingCode}}</b>.</p>`,
    vars:     ['name', 'trackingCode', 'driverName'],
  },
  {
    key:      'delivery_picked_up',
    name:     'Delivery - Picked Up',
    subject:  'Your package is in transit',
    bodyHtml: `<p>Hi {{name}},</p><p>Your package <b>{{trackingCode}}</b> is on its way to the recipient.</p>`,
    vars:     ['name', 'trackingCode'],
  },
  {
    key:      'delivery_complete',
    name:     'Delivery - Complete',
    subject:  'Your delivery is complete',
    bodyHtml: `<p>Hi {{name}},</p><p>Your package <b>{{trackingCode}}</b> has been delivered. Tap inside the app to rate your driver.</p>`,
    vars:     ['name', 'trackingCode'],
  },
  {
    key:      'delivery_failed',
    name:     'Delivery - Failed',
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

/** Everything the editor lists: triggered templates plus seasonal ones. */
export const ALL_TEMPLATES: TemplateSeed[] = [...SEED_TEMPLATES, ...SEASONAL_TEMPLATES];

@Injectable()
export class EmailTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplatesService.name);

  constructor(
    @InjectRepository(EmailTemplate) private repo: Repository<EmailTemplate>,
  ) {}

  /**
   * Self-heal the columns, then seed whatever keys are missing.
   *
   * Production runs with synchronize off, so a new column on the entity
   * does not exist in Postgres until something adds it. Same pattern as
   * admin.module and deliveries.module.
   *
   * The seed used to bail out entirely if the table held ANY row, which
   * meant every template added after the first boot could never appear
   * on an existing install: the seasonal ones would have been invisible
   * in production forever (2026-08-27). It now inserts only the keys
   * that are absent, so admin edits to existing rows still survive
   * untouched.
   */
  async onModuleInit() {
    for (const sql of [
      `ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "bannerImageUrl" text NULL`,
      `ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "accentColor" varchar(9) NULL`,
    ]) {
      try {
        await this.repo.manager.query(sql);
      } catch (e: any) {
        this.logger.warn(`email_templates self-heal failed: ${e.message}`);
      }
    }

    const existing = await this.repo.find({ select: ['key'] });
    const have = new Set(existing.map(r => r.key));
    const missing = ALL_TEMPLATES.filter(t => !have.has(t.key));
    if (!missing.length) return;

    const rows = missing.map(t => this.repo.create({
      key:      t.key,
      subject:  t.subject,
      bodyHtml: t.bodyHtml,
      vars:     t.vars,
      active:   true,
    }));
    await this.repo.save(rows);
    this.logger.log(`Seeded ${rows.length} email template(s): ${missing.map(t => t.key).join(', ')}`);
  }

  /**
   * Render a template's subject + body with var substitution. If no
   * active override is found, returns null so the caller can fall back
   * to its hardcoded default.
   */
  async render(
    key: string,
    vars: Record<string, string | number>,
  ): Promise<{ subject: string; html: string; bannerImageUrl: string | null; accentColor: string | null } | null> {
    const row = await this.repo.findOne({ where: { key, active: true } });
    if (!row) return null;
    return {
      subject: this.interpolate(row.subject,  vars),
      html:    this.interpolate(row.bodyHtml, vars),
      bannerImageUrl: row.bannerImageUrl ?? null,
      accentColor:    row.accentColor    ?? null,
    };
  }

  /**
   * The built-in copy for a key, interpolated with sample values, so a
   * test send on a template nobody has edited still shows what really
   * goes out rather than an empty result.
   */
  async seedBodyFor(key: string): Promise<{ subject: string; bodyHtml: string } | null> {
    const seed = ALL_TEMPLATES.find(t => t.key === key);
    if (!seed) return null;
    const sample: Record<string, string> = {};
    for (const v of seed.vars ?? []) sample[v] = SAMPLE_VARS[v] ?? `{{${v}}}`;
    return {
      subject:  this.interpolate(seed.subject,  sample),
      bodyHtml: this.interpolate(seed.bodyHtml, sample),
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
  // catalogue - so unseeded templates still show in the list.
  async listForAdmin() {
    const rows = await this.repo.find();
    const byKey = new Map(rows.map(r => [r.key, r]));
    return ALL_TEMPLATES.map(t => {
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
    bannerImageUrl?: string | null; accentColor?: string | null;
  }) {
    const seed = ALL_TEMPLATES.find(t => t.key === key);
    if (!seed) throw new NotFoundException(`Unknown template key: ${key}`);

    let row = await this.repo.findOne({ where: { key } });
    if (!row) {
      row = this.repo.create({
        key,
        subject:  body.subject  ?? seed.subject,
        bodyHtml: body.bodyHtml ?? seed.bodyHtml,
        vars:     seed.vars,
        active:   body.active ?? true,
        bannerImageUrl: body.bannerImageUrl ?? null,
        accentColor:    body.accentColor    ?? null,
        lastEditedByUserId: body.editedByUserId,
      });
    } else {
      if (body.subject  !== undefined) row.subject  = body.subject;
      if (body.bodyHtml !== undefined) row.bodyHtml = body.bodyHtml;
      if (body.active   !== undefined) row.active   = body.active;
      if (body.bannerImageUrl !== undefined) row.bannerImageUrl = body.bannerImageUrl || null;
      if (body.accentColor    !== undefined) row.accentColor    = body.accentColor    || null;
      if (body.editedByUserId) row.lastEditedByUserId = body.editedByUserId;
    }
    return this.repo.save(row);
  }
}
