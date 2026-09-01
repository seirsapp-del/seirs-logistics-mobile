import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * Every attempt to sign in to the admin dashboard.
 *
 * WHY. The founder asked for this three times across three days, in the same
 * words each time: "i cant tell if she signed in or not as a super admin,
 * thats not good." He was right that nothing existed. adminLogin recorded
 * absolutely nothing, so there was no way to answer who had been in the
 * dashboard, from where, or whether somebody had been trying passwords all
 * night against a super admin account.
 *
 * FAILURES ARE RECORDED, NOT JUST SUCCESSES. A log of successful logins
 * cannot show an attack; six bad passwords at 3am followed by one success is
 * the only shape that tells you what happened, and it needs both halves.
 *
 * NO CREDENTIALS EVER. Not the password, not the attempted password, not the
 * TOTP code. The email is stored as typed because an attempt against an
 * address that does not exist is itself the signal.
 */
@Entity('admin_sign_in_events')
@Index(['userId', 'createdAt'])
@Index(['createdAt'])
export class SignInEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null when the email matched no account: the attempt still matters. */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** As typed. A near-miss on a real address is worth seeing. */
  @Column({ type: 'varchar', length: 180 })
  email: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  /** super_admin, ops_manager and so on, at the moment of the attempt. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  adminRole: string | null;

  /**
   * success | bad_password | no_account | not_admin | totp_required |
   * totp_failed | locked
   */
  @Column({ type: 'varchar', length: 24 })
  outcome: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  userAgent: string | null;

  /**
   * Lagos hour of the attempt, 0 to 23, stored rather than derived.
   *
   * Derived-on-read means every report has to agree about a timezone, and
   * they will not: the server runs UTC, the founder is in Berlin, and the
   * staff are in Lagos. Stamped once, at the only moment the answer is
   * unambiguous.
   */
  @Column({ type: 'smallint' })
  lagosHour: number;

  /**
   * Outside the permitted window for their role.
   *
   * Founder's decision, 2 September 2026: this FLAGS and mails a super
   * admin, it does not block. Locking somebody out of the dashboard at 2am
   * during a launch incident is its own kind of outage. The super admin gets
   * a one-tap suspend from the notice instead, so a real intruder is one
   * action away from gone and a colleague working late is not.
   */
  @Column({ type: 'boolean', default: false })
  outsideHours: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
