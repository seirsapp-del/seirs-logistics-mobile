import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplate } from './email-template.entity';
import { baseTemplate } from './mail.service';

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
  /**
   * What the gallery groups by. Seasonal and campaign templates are the
   * ones a person browses and picks; transactional and security ones are
   * sent by the code on an event and are read rather than chosen.
   * Defaults to transactional, since most of the catalogue is.
   */
  category?: 'transactional' | 'security' | 'seasonal' | 'campaign';
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
  when:         '28 August 2026 at 09:41 WAT',
  device:       'Android phone (Chrome)',
  unlockAt:     '10:02 WAT',
  bank:         'GTBank',
  last4:        '4417',
  documentName: 'Driver licence',
  deletionDate: '27 September 2026',
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
    category: 'seasonal',
    name:     'Christmas greeting',
    subject:  'Compliments of the season from SEIRS',
    bodyHtml: `<p>Hi {{name}},</p><p>Thank you for trusting us with your deliveries this year. Our riders will be moving through the holidays, so if something needs to reach family before the day, we are on the road.</p><p>From all of us at SEIRS, a peaceful Christmas.</p>`,
    vars:     ['name'],
  },
  {
    key:      'seasonal_birthday',
    name:     'Birthday',
    category: 'seasonal',
    subject:  'Happy birthday, {{firstName}}',
    bodyHtml: `<p>Hi {{firstName}},</p><p>Happy birthday from everyone at SEIRS. Thank you for letting us carry your parcels this year.</p><p>Have a good one, and if anything needs moving today, we are on the road.</p>`,
    vars:     ['firstName'],
  },
  {
    key:      'seasonal_new_year',
    category: 'seasonal',
    name:     'New Year greeting',
    subject:  'Happy New Year from SEIRS',
    bodyHtml: `<p>Hi {{name}},</p><p>Thank you for riding with us through {{lastYear}}. We are open through the new year and ready whenever you are.</p><p>Here is to a good {{thisYear}}.</p>`,
    vars:     ['name', 'lastYear', 'thisYear'],
  },
  {
    key:      'promotion_generic',
    category: 'campaign',
    name:     'Promotion or offer',
    subject:  '{{headline}}',
    bodyHtml: `<p>Hi {{name}},</p><p>{{message}}</p><p>Use code <b>{{promoCode}}</b> in the app before {{expiresOn}}.</p>`,
    vars:     ['name', 'headline', 'message', 'promoCode', 'expiresOn'],
  },
  {
    key:      'announcement',
    category: 'campaign',
    name:     'General announcement',
    subject:  '{{headline}}',
    bodyHtml: `<p>Hi {{name}},</p><p>{{message}}</p>`,
    vars:     ['name', 'headline', 'message'],
  },
];


/**
 * Account and security notices (2026-08-28).
 *
 * The catalogue above is entirely about packages, chats and money
 * moving. Nothing covered the account itself, so the events that mean
 * somebody is INSIDE an account went out with no email at all: only a
 * push, which is worthless when the phone is in the wrong hands or
 * flat.
 *
 * Every one of these is a security record. The copy rules they all
 * follow:
 *   - say what happened and WHEN, in Lagos time
 *   - always close with what to do if it was not them
 *   - never echo the secret that changed. No new email address, no
 *     password fragment, no full NUBAN. Bank accounts are named by
 *     their last four digits only: enough for the real owner to
 *     recognise, useless to somebody reading over a shoulder
 *   - never promise a time an action will be reviewed or reversed by
 *
 * They are seeded like everything else so the founder can rewrite the
 * wording from the Email Templates screen without a deploy.
 */
const SECURITY_TEMPLATES: TemplateSeed[] = [
  {
    key:      'security_password_changed',
    name:     'Security - Password changed',
    subject:  'Your SEIRS password was changed',
    bodyHtml: `<p>Hi {{name}},</p><p>The password on your SEIRS account was changed on <b>{{when}}</b>.</p><p>If this was you, nothing further is needed.</p><p><b>If this was not you, contact support straight away</b> and use "Forgot password" to take the account back.</p>`,
    vars:     ['name', 'when'],
  },
  /**
   * Two templates, because the two readers need different things.
   *
   * Neither names an address. Sending the new address to the new
   * address is confirmation-by-echo: it tells whoever just captured the
   * account that the capture worked, and it puts the owner's
   * replacement address in writing in a mailbox that may not be theirs.
   */
  {
    key:      'security_email_changed_old',
    name:     'Security - Email changed (notice to old address)',
    subject:  'The email on your SEIRS account was changed',
    bodyHtml: `<p>Hi {{name}},</p><p>On <b>{{when}}</b> the sign-in email for your SEIRS account was changed to a different address. Account emails will stop arriving here.</p><p><b>If you did not do this, contact support now</b> from this address. Quote this message so we can confirm you held the account first.</p>`,
    vars:     ['name', 'when'],
  },
  {
    key:      'security_email_changed_new',
    name:     'Security - Email changed (notice to new address)',
    subject:  'This address now signs in to a SEIRS account',
    bodyHtml: `<p>Hi {{name}},</p><p>On <b>{{when}}</b> this address was set as the sign-in email for a SEIRS account.</p><p>If you were not expecting this, do not sign in, and contact support. Someone may have typed your address by mistake, or used it on purpose.</p>`,
    vars:     ['name', 'when'],
  },
  {
    key:      'security_new_device',
    name:     'Security - New device sign-in',
    subject:  'New sign-in to your SEIRS account',
    bodyHtml: `<p>Hi {{name}},</p><p>Your SEIRS account was signed in to from a device we have not seen before: <b>{{device}}</b>, on <b>{{when}}</b>.</p><p>If this was you, you can ignore this.</p><p><b>If it was not, change your password now</b> and contact support.</p>`,
    vars:     ['name', 'device', 'when'],
  },
  {
    key:      'security_account_locked',
    name:     'Security - Account locked after failed sign-ins',
    subject:  'Your SEIRS account was locked',
    bodyHtml: `<p>Hi {{name}},</p><p>There were too many failed sign-in attempts on your SEIRS account, so we locked it at <b>{{when}}</b>. It unlocks by itself at <b>{{unlockAt}}</b>.</p><p>If that was you mistyping, wait and try again.</p><p><b>If it was not you, somebody is guessing your password.</b> Change it as soon as the lock lifts, and contact support.</p>`,
    vars:     ['name', 'when', 'unlockAt'],
  },
  {
    key:      'security_bank_change_requested',
    name:     'Security - Payout account change requested',
    subject:  'A payout account change was requested on your SEIRS account',
    bodyHtml: `<p>Hi {{name}},</p><p>On <b>{{when}}</b> someone asked to send your SEIRS payouts to {{bank}}, account ending <b>{{last4}}</b>. It is with our team for review, and your money still goes to your current account until then.</p><p><b>If you did not ask for this, contact support now.</b> Say that a payout change should be refused.</p>`,
    vars:     ['name', 'when', 'bank', 'last4'],
  },
  {
    key:      'security_bank_change_approved',
    name:     'Security - Payout account change approved',
    subject:  'Your SEIRS payout account was changed',
    bodyHtml: `<p>Hi {{name}},</p><p>As of <b>{{when}}</b> your SEIRS payouts go to {{bank}}, account ending <b>{{last4}}</b>.</p><p><b>If you did not request this change, contact support immediately.</b> Your earnings are being sent somewhere you did not choose.</p>`,
    vars:     ['name', 'when', 'bank', 'last4'],
  },
  {
    key:      'security_bank_change_rejected',
    name:     'Security - Payout account change declined',
    subject:  'Your SEIRS payout account change was not approved',
    bodyHtml: `<p>Hi {{name}},</p><p>On <b>{{when}}</b> the request to send your payouts to {{bank}}, account ending <b>{{last4}}</b>, was not approved. Your existing payout account is unchanged and your earnings are untouched.</p><p>Contact support if you expected this to go through, or if you did not make the request at all.</p>`,
    vars:     ['name', 'when', 'bank', 'last4'],
  },
  {
    key:      'account_suspended',
    name:     'Account - Suspended',
    subject:  'Your SEIRS account has been suspended',
    bodyHtml: `<p>Hi {{name}},</p><p>Your SEIRS account was suspended on <b>{{when}}</b> and you will not be able to sign in.</p><p>Reason given: <b>{{reason}}</b></p><p>If you believe this is a mistake, reply to support with your SEIRS ID and we will look at it again.</p>`,
    vars:     ['name', 'when', 'reason'],
  },
  {
    key:      'account_reactivated',
    name:     'Account - Reactivated',
    subject:  'Your SEIRS account is active again',
    bodyHtml: `<p>Hi {{name}},</p><p>Your SEIRS account was reactivated on <b>{{when}}</b>. You can sign in and carry on as normal.</p><p>If you cannot get in, use "Forgot password" first, then contact support.</p>`,
    vars:     ['name', 'when'],
  },
  {
    key:      'identity_verification_approved',
    name:     'Identity - Verification approved',
    subject:  'Your SEIRS identity is verified',
    bodyHtml: `<p>Hi {{name}},</p><p>Your ID was approved on <b>{{when}}</b>. Your account now carries the verified badge and the higher limits that come with it.</p><p>If you did not submit an ID, contact support: someone else used your account to do it.</p>`,
    vars:     ['name', 'when'],
  },
  {
    key:      'identity_verification_rejected',
    name:     'Identity - Verification rejected',
    subject:  'We could not verify your SEIRS ID',
    bodyHtml: `<p>Hi {{name}},</p><p>The ID you submitted was reviewed on <b>{{when}}</b> and we could not approve it.</p><p>Reason: <b>{{reason}}</b></p><p>You can submit again from Profile inside the app. Your account keeps working in the meantime.</p>`,
    vars:     ['name', 'when', 'reason'],
  },
  {
    key:      'driver_document_approved',
    name:     'Driver - KYC document approved',
    subject:  'A document on your SEIRS driver account was approved',
    bodyHtml: `<p>Hi {{name}},</p><p>Your <b>{{documentName}}</b> was approved on <b>{{when}}</b>.</p><p>Open the driver app to see what is still outstanding, if anything.</p>`,
    vars:     ['name', 'documentName', 'when'],
  },
  {
    key:      'driver_document_rejected',
    name:     'Driver - KYC document rejected',
    subject:  'A document on your SEIRS driver account needs re-uploading',
    bodyHtml: `<p>Hi {{name}},</p><p>Your <b>{{documentName}}</b> was reviewed on <b>{{when}}</b> and could not be accepted.</p><p>Reason: <b>{{reason}}</b></p><p>Upload a replacement from the driver app and it goes back in the queue.</p>`,
    vars:     ['name', 'documentName', 'when', 'reason'],
  },
  {
    key:      'account_deletion_scheduled',
    name:     'Account - Deletion scheduled',
    subject:  'Your SEIRS account is scheduled for deletion',
    bodyHtml: `<p>Hi {{name}},</p><p>We received a request on <b>{{when}}</b> to delete your SEIRS account. It is scheduled for <b>{{deletionDate}}</b>, and after that it cannot be recovered.</p><p>You can stop it any time before then: sign in and tap Cancel Deletion.</p><p><b>If you did not ask for this, sign in now, cancel it, and change your password.</b></p>`,
    vars:     ['name', 'when', 'deletionDate'],
  },
  {
    key:      'account_deletion_cancelled',
    name:     'Account - Deletion cancelled',
    subject:  'Your SEIRS account will not be deleted',
    bodyHtml: `<p>Hi {{name}},</p><p>The scheduled deletion of your SEIRS account was cancelled on <b>{{when}}</b>. Nothing was removed and your account is fully active.</p><p>If you did not cancel it yourself, contact support and change your password.</p>`,
    vars:     ['name', 'when'],
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
  /**
   * A rider was paid, or was not.
   *
   * There was a template for earnings being ADDED and none for money
   * being SENT. The one moment most deserving of a written record, the
   * one a rider will reach for if their bank is slow, had no email at
   * all (founder, 2026-08-27, after the first real payout: "do they get
   * an auto email").
   *
   * Neither promises an arrival time: Nigerian settlement is not
   * something SEIRS can commit to for a rider. The failure template
   * leads with the money being safe, because that is the first fear, and
   * carries no provider detail, because why a transfer was declined
   * describes the SEIRS merchant account rather than their withdrawal.
   */
  {
    key:      'payout_sent',
    name:     'Payout - Sent',
    subject:  'Your SEIRS withdrawal is on its way',
    bodyHtml: `<p>Hi {{name}},</p><p><b>{{amount}}</b> is on its way to {{bank}}.</p><p>Arrival depends on your bank. Your reference is <b>{{reference}}</b>, quote it if you contact support.</p>`,
    vars:     ['name', 'amount', 'bank', 'reference'],
  },
  {
    key:      'payout_failed',
    name:     'Payout - Failed',
    subject:  'Your SEIRS withdrawal did not go through',
    bodyHtml: `<p>Hi {{name}},</p><p>We could not send <b>{{amount}}</b>.</p><p><b>Your earnings are safe and still in your balance.</b> Please try the withdrawal again from the Earnings tab, and contact support if it keeps failing.</p>`,
    vars:     ['name', 'amount'],
  },
  {
    key:      'handoff_otp',
    name:     'Handoff Pickup OTP',
    subject:  'Your SEIRS pickup verification code',
    bodyHtml: `<p>Hi {{name}},</p><p>Your pickup code for delivery <b>{{deliveryRef}}</b> is <b>{{otp}}</b>. Share it only with the partner staff or driver at handoff.</p>`,
    vars:     ['name', 'otp', 'deliveryRef'],
  },
];

/** Everything the editor lists: triggered, security, and seasonal. */
export const ALL_TEMPLATES: TemplateSeed[] = [
  ...SEED_TEMPLATES,
  ...SECURITY_TEMPLATES,
  ...SEASONAL_TEMPLATES,
];

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
      /* Added 2026-08-28 with the gallery: templates people create
         themselves, what they are called, how the gallery groups them,
         and the grey line under the subject in most inboxes. */
      `ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "isCustom" boolean NOT NULL DEFAULT false`,
      `ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "name" varchar(120) NULL`,
      `ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "category" varchar(24) NOT NULL DEFAULT 'campaign'`,
      `ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "previewText" varchar(200) NULL`,
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

  /**
   * The built-in copy for a key, filled with REAL values.
   *
   * seedBodyFor() above does the same with sample values, which is what
   * a test send wants and exactly what a live send must not do. A
   * security email that goes out before anyone has seeded or edited the
   * template still has to name the real bank and the real timestamp, so
   * the fallback path needs its own renderer.
   */
  renderSeed(
    key: string,
    vars: Record<string, string | number>,
  ): { subject: string; bodyHtml: string } | null {
    const seed = ALL_TEMPLATES.find(t => t.key === key);
    if (!seed) return null;
    return {
      subject:  this.interpolate(seed.subject,  vars),
      bodyHtml: this.interpolate(seed.bodyHtml, vars),
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
  /**
   * Fill the {{placeholders}} with the sample people so a preview reads
   * like a real email rather than a form. Anything with no sample is
   * left visibly as its placeholder, because silently blanking it would
   * hide that the template asks for something nobody supplies.
   */
  private fillSamples(text: string): string {
    return String(text ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, k) =>
      SAMPLE_VARS[k] ?? m);
  }

  /**
   * The email as it will actually arrive.
   *
   * The editor previewed by dropping bodyHtml into a div, which its own
   * comment called a "rough preview": no header, no banner, no accent
   * colour, no footer, none of the table layout a mail client uses. So a
   * non-technical person was approving something they had never seen.
   * This runs the same baseTemplate() every real send runs.
   */
  renderPreview(input: {
    bodyHtml?: string; bannerImageUrl?: string | null; accentColor?: string | null;
  }): string {
    return baseTemplate(
      this.fillSamples(input.bodyHtml ?? ''),
      undefined,
      { bannerImageUrl: input.bannerImageUrl ?? null, accentColor: input.accentColor ?? null },
    );
  }

  /**
   * The gallery payload.
   *
   * Every template arrives with the finished HTML attached, so the
   * gallery can draw a real thumbnail of each design with its own
   * colours and banner. That is the whole point of a gallery: you pick
   * by looking, not by reading a list of slugs.
   */
  async listForAdmin() {
    const rows = await this.repo.find();
    const byKey = new Map(rows.map(r => [r.key, r]));

    const seeded = ALL_TEMPLATES.map(t => {
      const row = byKey.get(t.key);
      const subject  = row?.subject  ?? t.subject;
      const bodyHtml = row?.bodyHtml ?? t.bodyHtml;
      return {
        key:      t.key,
        name:     t.name,
        vars:     t.vars,
        category: t.category ?? 'transactional',
        isCustom: false,
        defaults: { subject: t.subject, bodyHtml: t.bodyHtml },
        override: row ?? null,
        renderedSubject: this.fillSamples(subject),
        previewText: row?.previewText ?? null,
        renderedHtml: this.renderPreview({
          bodyHtml,
          bannerImageUrl: row?.bannerImageUrl ?? null,
          accentColor:    row?.accentColor ?? null,
        }),
      };
    });

    /* Templates somebody at SEIRS made. They have no seed behind them,
       so their name and category live on the row. */
    const custom = rows.filter(r => r.isCustom).map(r => ({
      key:      r.key,
      name:     r.name ?? r.key,
      vars:     r.vars ?? [],
      category: r.category ?? 'campaign',
      isCustom: true,
      defaults: { subject: r.subject, bodyHtml: r.bodyHtml },
      override: r,
      renderedSubject: this.fillSamples(r.subject),
      previewText: r.previewText ?? null,
      renderedHtml: this.renderPreview({
        bodyHtml: r.bodyHtml,
        bannerImageUrl: r.bannerImageUrl,
        accentColor:    r.accentColor,
      }),
    }));

    return [...custom, ...seeded];
  }

  /**
   * Make a new one.
   *
   * upsertOverride refuses any key without a seed, so until now the only
   * thing this screen could do was edit the fixed set the code sends.
   * "Build new ones" was the founder's second requirement and there was
   * no route for it at all.
   *
   * The key is derived from the name and made unique, because a person
   * naming a template should not have to invent a slug, and two
   * campaigns called "Christmas" in different years must not collide.
   */
  async createCustom(body: {
    name: string; subject?: string; bodyHtml?: string; category?: string;
    bannerImageUrl?: string | null; accentColor?: string | null;
    previewText?: string | null; editedByUserId?: string;
  }) {
    const name = String(body.name ?? '').trim();
    if (!name) throw new NotFoundException('A template needs a name.');

    const base = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    let key = base || 'custom_template';
    let n = 2;
    while (await this.repo.findOne({ where: { key } })) key = `${base}_${n++}`;

    const row = this.repo.create({
      key,
      name,
      isCustom: true,
      category: (body.category as any) ?? 'campaign',
      subject:  body.subject  ?? name,
      bodyHtml: body.bodyHtml ?? '<p>Hi {{name}},</p><p>Write your message here.</p>',
      vars:     ['name'],
      active:   true,
      previewText:    body.previewText ?? null,
      bannerImageUrl: body.bannerImageUrl ?? null,
      accentColor:    body.accentColor ?? null,
      lastEditedByUserId: body.editedByUserId,
    });
    return this.repo.save(row);
  }

  /**
   * Delete, and only ever a custom one. A system template is sent by a
   * code path, so removing its row would not delete the email, it would
   * silently drop it back to the in-code default while the screen
   * implied it was gone.
   */
  async removeCustom(key: string) {
    const row = await this.repo.findOne({ where: { key } });
    if (!row) throw new NotFoundException(`No template ${key}`);
    if (!row.isCustom) {
      throw new NotFoundException(
        'That is a template the app sends automatically, so it can be edited but not deleted.',
      );
    }
    await this.repo.remove(row);
    return { ok: true, key };
  }

  async upsertOverride(key: string, body: {
    subject?: string; bodyHtml?: string; active?: boolean; editedByUserId?: string;
    bannerImageUrl?: string | null; accentColor?: string | null;
    previewText?: string | null; name?: string; category?: string;
  }) {
    let row = await this.repo.findOne({ where: { key } });
    const seed = ALL_TEMPLATES.find(t => t.key === key);
    /* A custom template has no seed by definition, so the old guard
       rejected every edit to anything somebody created. */
    if (!seed && !row?.isCustom) throw new NotFoundException(`Unknown template key: ${key}`);
    if (!row) {
      row = this.repo.create({
        key,
        subject:  body.subject  ?? seed!.subject,
        bodyHtml: body.bodyHtml ?? seed!.bodyHtml,
        vars:     seed!.vars,
        category: seed!.category ?? 'transactional',
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
      if (body.previewText !== undefined) row.previewText = body.previewText || null;
      if (body.name !== undefined && row.isCustom) row.name = body.name || row.name;
      if (body.category !== undefined && row.isCustom) row.category = body.category;
      if (body.editedByUserId) row.lastEditedByUserId = body.editedByUserId;
    }
    return this.repo.save(row);
  }
}
