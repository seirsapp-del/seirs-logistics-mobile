import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Spec V8 §3.13 - admin-editable email template store. MailService
// consults this table on send; if no row exists for a key, it falls
// back to the hardcoded default in mail.service.ts. Variables are
// substituted as {{name}} {{otp}} etc. at render time.
@Entity('email_templates')
export class EmailTemplate {
  // Logical key, e.g. "email_verification" - matches the seedKey list
  // in EmailTemplatesService so the admin UI knows what to show.
  @PrimaryColumn()
  key: string;

  @Column()
  subject: string;

  // HTML body. {{var}} placeholders are substituted at render time.
  @Column({ type: 'text' })
  bodyHtml: string;

  // Allowed variable names (e.g. ['name', 'otp']). Surfaced as chips
  // in the admin editor so staff know what they can interpolate.
  @Column({ type: 'jsonb', default: () => `'[]'` })
  vars: string[];

  // false means "use the in-code default" - the row exists for audit
  // but won't be picked up by the renderer. Admin can flip without
  // deleting the override draft.
  @Column({ default: true })
  active: boolean;

  /**
   * A hosted image shown above the message body. Founder 2026-08-27:
   * "i will like if we can edit the images or a banners".
   *
   * Must be an https URL to a real file, not a data URI: Gmail strips
   * inline SVG and data-URI images, which is the same reason the header
   * logo is a hosted PNG rather than embedded.
   */
  @Column({ type: 'text', nullable: true })
  bannerImageUrl: string | null;

  /**
   * Header colour for this one template, so a Christmas or promotional
   * send can look different from a receipt without a second codebase.
   * Null keeps the standard SEIRS navy.
   */
  @Column({ type: 'varchar', length: 9, nullable: true })
  accentColor: string | null;

  /**
   * A template somebody at SEIRS created, rather than one the code
   * sends. Custom rows have no seed behind them, so they carry their own
   * name and can be deleted; a system template can only be overridden,
   * because deleting it would break the code path that sends it.
   */
  @Column({ default: false })
  isCustom: boolean;

  /** Only set for custom rows; system rows take their name from the seed. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  /**
   * What the gallery groups by. Seasonal and campaign templates are the
   * ones somebody browses and picks; transactional and security ones are
   * sent by the code and are read, not chosen.
   */
  @Column({ type: 'varchar', length: 24, default: 'campaign' })
  category: string;

  /** The grey line under the subject in most inboxes. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  previewText: string | null;

  @Column({ nullable: true })
  lastEditedByUserId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
