import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

/**
 * A dated send of one template to one audience.
 *
 * The founder's spec for the email rebuild ended with "and a scheduler",
 * and the composer's Later option was disabled because choosing it fired
 * the message immediately, which is the worst possible way for a
 * scheduler to be missing.
 *
 * A campaign is deliberately its own row rather than fields on the
 * template. One template gets sent many times (a birthday note goes out
 * every day, a promotion twice in a season), and the record of who was
 * mailed and when has to survive the template being reworded afterwards.
 * Putting scheduledAt on the template would mean editing next year's
 * Christmas email destroys the record of last year's.
 */
export type CampaignStatus =
  | 'scheduled'   // waiting for its time
  | 'sending'     // claimed by the cron, in flight
  | 'sent'        // finished, see the counts
  | 'cancelled'   // called off before it ran
  | 'failed';     // the run threw

@Entity('email_campaigns')
@Index(['status', 'scheduledAt'])
export class EmailCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Which template. Not a foreign key: a campaign must outlive a deleted template. */
  @Column()
  templateKey: string;

  /** Copied at schedule time so the record shows what was actually sent. */
  @Column({ type: 'varchar', length: 200 })
  subjectAtSend: string;

  /**
   * Same audience vocabulary the push composer uses, so the two screens
   * cannot drift into meaning different things by the same word.
   */
  @Column({ type: 'varchar', length: 40 })
  audience: string;

  @Column({ type: 'timestamptz' })
  @Index()
  scheduledAt: Date;

  @Column({ type: 'varchar', length: 16, default: 'scheduled' })
  status: CampaignStatus;

  /** Set when the cron picks it up, so a crashed run is identifiable. */
  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  /** How many the audience resolved to when it actually ran. */
  @Column({ type: 'int', default: 0 })
  recipients: number;

  /** Accepted by the mail provider. */
  @Column({ type: 'int', default: 0 })
  delivered: number;

  @Column({ type: 'int', default: 0 })
  failed: number;

  /** Why it failed, or why somebody called it off. */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ nullable: true })
  createdByUserId: string;

  @Column({ nullable: true })
  cancelledByUserId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
