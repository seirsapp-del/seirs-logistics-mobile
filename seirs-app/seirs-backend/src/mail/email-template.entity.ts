import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Spec V8 §3.13 — admin-editable email template store. MailService
// consults this table on send; if no row exists for a key, it falls
// back to the hardcoded default in mail.service.ts. Variables are
// substituted as {{name}} {{otp}} etc. at render time.
@Entity('email_templates')
export class EmailTemplate {
  // Logical key, e.g. "email_verification" — matches the seedKey list
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

  // false means "use the in-code default" — the row exists for audit
  // but won't be picked up by the renderer. Admin can flip without
  // deleting the override draft.
  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  lastEditedByUserId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
