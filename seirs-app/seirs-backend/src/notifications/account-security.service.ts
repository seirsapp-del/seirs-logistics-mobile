import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { NotificationsService } from './notifications.service';
import { adminsWithPermission } from './admin-audience';
import { NotificationType } from './notification.entity';
import { MailService } from '../mail/mail.service';
import { User } from '../users/user.entity';

/**
 * Account and security notifications (2026-08-28).
 *
 * Every notification type that existed before this file was about a
 * delivery or a chat. The events that cost somebody money, or mean
 * somebody else is inside their account, were the only ones on the
 * platform that happened in total silence: a password change, a
 * stranger signing in, an account suspended, a deletion scheduled.
 *
 * Three rules hold everywhere in here:
 *
 *  1. Nothing throws. A notification is a side effect of an action, and
 *     the action must survive the notification failing. Somebody's
 *     password change must not fail because Resend is down or because
 *     the email_templates table has not been seeded. Every method
 *     catches its own errors and logs.
 *
 *  2. Push AND email for the security six. A push can be missed on a
 *     phone that is already in the wrong hands, or flat, or logged out.
 *     Email is the channel the real owner still controls, and it is the
 *     one that leaves a record they can show support.
 *
 *  3. Never echo the secret that changed. No new email address, no
 *     password fragment, no full NUBAN. Bank accounts are named by
 *     their last four digits: enough for the real owner to recognise
 *     their own account, useless to somebody reading over a shoulder.
 *
 * No SMS. Standing founder decision, deferred indefinitely.
 */
@Injectable()
export class AccountSecurityService {
  private readonly logger = new Logger(AccountSecurityService.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  /**
   * How many device fingerprints we keep per account.
   *
   * Unbounded would mean that after enough sign-ins every device looks
   * familiar and the new-device alert never fires again, which is the
   * one failure mode that silently disables the alarm. Ten covers a
   * phone, a spare, a tablet and a couple of browsers with room over.
   */
  private static readonly MAX_KNOWN_DEVICES = 10;

  /**
   * Salt for device fingerprints.
   *
   * The hash exists so the users table cannot be mined to profile which
   * handset and browser each person carries. Without a salt a short
   * list of common Nigerian device strings would reverse the whole
   * column in seconds. Falls back to a constant in local dev where no
   * secret is set: the fallback only weakens privacy on a dev box, and
   * a missing env var must not stop sign-in alerts from working.
   */
  private static readonly DEVICE_SALT =
    process.env.DEVICE_HASH_SALT ?? process.env.JWT_SECRET ?? 'seirs-device-fingerprint';

  // ── Shared plumbing ────────────────────────────────────────────────────────

  /**
   * Timestamps read in Lagos time, always.
   *
   * A security notice whose whole purpose is "was this you, at this
   * moment" is useless if the reader has to convert from UTC to work
   * out whether they were asleep. WAT has no daylight saving, so this
   * is unambiguous year round.
   */
  private static when(at: Date = new Date()): string {
    try {
      return at.toLocaleString('en-NG', {
        timeZone: 'Africa/Lagos',
        day:      'numeric',
        month:    'long',
        year:     'numeric',
        hour:     '2-digit',
        minute:   '2-digit',
        hour12:   false,
      }) + ' WAT';
    } catch {
      return at.toISOString();
    }
  }

  /** Clock time only, for "it unlocks again at". */
  private static clock(at: Date): string {
    try {
      return at.toLocaleString('en-NG', {
        timeZone: 'Africa/Lagos',
        hour:     '2-digit',
        minute:   '2-digit',
        hour12:   false,
      }) + ' WAT';
    } catch {
      return at.toISOString();
    }
  }

  /** Calendar date only, for "it will be deleted on". */
  private static day(at: Date): string {
    try {
      return at.toLocaleDateString('en-NG', {
        timeZone: 'Africa/Lagos',
        day:      'numeric',
        month:    'long',
        year:     'numeric',
      });
    } catch {
      return at.toISOString().slice(0, 10);
    }
  }

  /**
   * Last four digits of an account number, never more.
   *
   * Applied at the boundary rather than trusting each call site to
   * remember, so a future caller that passes a whole NUBAN still cannot
   * put one in an email.
   */
  private static last4(accountNumber?: string | null): string {
    const digits = String(accountNumber ?? '').replace(/\D/g, '');
    return digits.slice(-4) || '****';
  }

  private async recipient(userId: string): Promise<{ name: string; email: string } | null> {
    try {
      const u = await this.usersRepo.findOne({
        where:  { id: userId },
        select: ['id', 'name', 'email'],
      });
      if (!u) return null;
      return { name: u.name ?? 'there', email: u.email };
    } catch {
      return null;
    }
  }

  /**
   * Fire one notice: in-app row, push, and optionally email.
   *
   * Uses NotificationsService.create() rather than sendToUser(), on
   * purpose. sendToUser() refuses to write to a deactivated account,
   * which is correct for a support message and exactly wrong here: the
   * single most important notice in this file, "your account was
   * suspended", is addressed to an account that was just deactivated.
   */
  private async deliver(opts: {
    userId:      string;
    type:        NotificationType;
    title:       string;
    body:        string;
    templateKey?: string;
    vars?:       Record<string, string>;
    /** Override the address, for notices to an address that is no longer on the account. */
    toEmail?:    string;
    /** The name to greet, when the user row cannot be read. */
    toName?:     string;
  }): Promise<void> {
    // Two independent try/catch blocks, not one around both. A dead
    // mail transport must not also cost the person the in-app row, and
    // a database hiccup on the notifications table must not stop the
    // email that is the more important of the two.
    try {
      await this.notifications.create(opts.userId, opts.title, opts.body, opts.type);
    } catch (e: any) {
      this.logger.warn(`security push failed (${opts.templateKey ?? opts.type}) for ${opts.userId}: ${e?.message ?? e}`);
    }

    if (!opts.templateKey) return;

    try {
      const who  = (opts.toEmail && opts.toName) ? null : await this.recipient(opts.userId);
      const to   = opts.toEmail ?? who?.email;
      const name = opts.toName  ?? who?.name ?? 'there';
      if (!to) {
        this.logger.warn(`security email skipped (${opts.templateKey}): no address for ${opts.userId}`);
        return;
      }
      await this.mail.sendAccountSecurityEmail(opts.templateKey, to, {
        name,
        ...(opts.vars ?? {}),
      });
    } catch (e: any) {
      this.logger.warn(`security email failed (${opts.templateKey}) for ${opts.userId}: ${e?.message ?? e}`);
    }
  }

  // ── 1. Password changed ────────────────────────────────────────────────────

  /**
   * Covers both the logged-in change and the forgot-password reset.
   * A reset is the takeover path that needs no old password at all, so
   * it deserves the notice more than the deliberate change does.
   */
  async passwordChanged(userId: string, at: Date = new Date()): Promise<void> {
    const when = AccountSecurityService.when(at);
    await this.deliver({
      userId,
      type:  NotificationType.SECURITY_ALERT,
      title: 'Your password was changed',
      body:  `Your SEIRS password was changed on ${when}. If this was not you, contact support now and reset it from the sign-in screen.`,
      templateKey: 'security_password_changed',
      vars:  { when },
    });
  }

  // ── 2. Email changed (both addresses) ──────────────────────────────────────

  /**
   * Told to BOTH addresses, and neither is told what the other is.
   *
   * The old address is where the real owner is still reading, so it has
   * to hear that the account moved away from it. The new address has to
   * hear that it now signs in somewhere, in case it was typed by
   * mistake or on purpose by somebody else.
   *
   * Neither message repeats an address. Echoing the new address back to
   * the new address confirms to whoever just took the account that the
   * change landed, and writes the owner's replacement address into a
   * mailbox that may not be theirs.
   */
  async emailChanged(
    userId: string,
    oldEmail: string,
    newEmail: string,
    at: Date = new Date(),
  ): Promise<void> {
    const when = AccountSecurityService.when(at);
    const who  = (await this.recipient(userId))?.name ?? 'there';

    // One in-app row only. The person has one account, not two, and two
    // rows for one change reads like it happened twice.
    await this.deliver({
      userId,
      type:  NotificationType.SECURITY_ALERT,
      title: 'Your sign-in email was changed',
      body:  `The email address on your SEIRS account was changed on ${when}. If this was not you, contact support now.`,
      templateKey: 'security_email_changed_old',
      vars:  { when },
      toEmail: oldEmail,
      toName:  who,
    });

    try {
      await this.mail.sendAccountSecurityEmail('security_email_changed_new', newEmail, {
        name: who,
        when,
      });
    } catch (e: any) {
      this.logger.warn(`email-change notice to new address failed for ${userId}: ${e?.message ?? e}`);
    }
  }

  // ── 3. Sign-in from a new device ───────────────────────────────────────────

  private static fingerprint(userAgent: string): string {
    return createHash('sha256')
      .update(`${AccountSecurityService.DEVICE_SALT}|${userAgent.trim()}`)
      .digest('hex')
      .slice(0, 32);
  }

  /**
   * A short human label for a user-agent string.
   *
   * "Mozilla/5.0 (Linux; Android 11; SM-A305F) AppleWebKit..." tells a
   * rider nothing. "Android phone (Chrome)" tells them whether to
   * worry. Deliberately coarse: a precise model number would make the
   * email itself a device-profiling leak if it were ever forwarded.
   */
  private static describeDevice(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    const platform =
      ua.includes('android')                          ? 'Android device'
      : /iphone|ipad|ipod|ios/.test(ua)               ? 'iPhone or iPad'
      : ua.includes('windows')                        ? 'Windows computer'
      : ua.includes('mac os') || ua.includes('macos') ? 'Mac'
      : ua.includes('linux')                          ? 'Linux computer'
      : 'an unrecognised device';
    const app =
      ua.includes('expo') || ua.includes('okhttp') ? 'the SEIRS app'
      : ua.includes('edg/')                        ? 'Edge'
      : ua.includes('chrome')                      ? 'Chrome'
      : ua.includes('firefox')                     ? 'Firefox'
      : ua.includes('safari')                      ? 'Safari'
      : null;
    return app ? `${platform} (${app})` : platform;
  }

  /**
   * Record a successful sign-in and alert if the device is unfamiliar.
   *
   * Silent on the FIRST device an account is ever seen on. Telling
   * somebody their own phone is suspicious the moment they sign in
   * teaches them to ignore the alert, and on the deploy that adds this
   * column every existing user would have got one for the handset they
   * have been using all along.
   *
   * Never throws: a sign-in must never fail because the alert path did.
   */
  async recordSignIn(
    userId: string,
    ctx: { userAgent?: string | null },
    at: Date = new Date(),
  ): Promise<void> {
    const ua = ctx?.userAgent?.trim();
    // No user-agent means no way to tell one device from another, so
    // there is nothing honest to say. Better silent than crying wolf.
    if (!ua) return;

    try {
      const user = await this.usersRepo.findOne({
        where:  { id: userId },
        select: ['id', 'knownDeviceHashes'],
      });
      if (!user) return;

      const known = Array.isArray(user.knownDeviceHashes) ? user.knownDeviceHashes : [];
      const hash  = AccountSecurityService.fingerprint(ua);
      if (known.includes(hash)) return;

      // Newest first, so the oldest fingerprint is the one dropped once
      // the cap is reached.
      const next = [hash, ...known].slice(0, AccountSecurityService.MAX_KNOWN_DEVICES);
      await this.usersRepo.update(userId, { knownDeviceHashes: next });

      if (known.length === 0) return;   // first device on record, see above

      const when   = AccountSecurityService.when(at);
      const device = AccountSecurityService.describeDevice(ua);
      await this.deliver({
        userId,
        type:  NotificationType.SECURITY_ALERT,
        title: 'New sign-in to your account',
        body:  `Your SEIRS account was signed in to from ${device} on ${when}. If this was not you, change your password now and contact support.`,
        templateKey: 'security_new_device',
        vars:  { when, device },
      });
    } catch (e: any) {
      this.logger.warn(`new-device check failed for ${userId}: ${e?.message ?? e}`);
    }
  }

  // ── 4. Account locked after failed sign-ins ────────────────────────────────

  /**
   * The lock itself is the evidence: five wrong passwords in a row on
   * an account whose owner knows the password means somebody else is
   * guessing. Says when it lifts so the real owner does not think they
   * have lost the account.
   */
  /**
   * A staff member signed in outside the permitted window.
   *
   * Founder's decision, 2 September 2026, when asked block or flag: flag,
   * mail a super admin, and give them the ability to block immediately.
   * Blocking automatically would lock somebody out of the dashboard at 2am
   * during a launch incident, which is its own kind of outage. A colleague
   * working late gets a raised eyebrow; an intruder gets suspended by a
   * person in one tap.
   *
   * Goes to EVERY super admin, not to the person who signed in. Telling the
   * possible intruder that their sign-in was noticed is not a security
   * control, it is a warning shot.
   */
  async adminOutsideHoursSignIn(ev: {
    userId: string | null; name: string | null; email: string;
    adminRole: string | null; lagosHour: number; ip: string | null;
  }): Promise<void> {
    try {
      /**
       * Whoever can read the sign-in log, not "super admin" hardcoded.
       *
       * super_admin_only is the permission gating /sign-ins, so the people
       * who can act on this alert are exactly the people who can open the
       * page it points at. Today that is super admins; if the founder later
       * grants it to a security role, they start receiving with no change
       * here.
       */
      const supers = (await adminsWithPermission(
        this.usersRepo.manager.connection, 'super_admin_only', { exclude: ev.userId },
      )).map(id => ({ id }));
      const hour = `${String(ev.lagosHour).padStart(2, '0')}:00 Lagos time`;
      const who  = ev.name ?? ev.email;
      for (const sa of supers) {
        // The exclude above already drops the person who signed in: telling a
        // possible intruder they were noticed is a warning shot, not a control.
        await this.deliver({
          userId: sa.id,
          type:   NotificationType.SECURITY_ALERT,
          title:  'Staff sign-in outside working hours',
          body:   `${who} (${ev.adminRole ?? 'staff'}) signed in to the admin dashboard at ${hour}`
                  + `${ev.ip ? ` from ${ev.ip}` : ''}. Nothing has been blocked. `
                  + 'If this was not them, open Staff sign-ins and suspend the account.',
          templateKey: 'security_admin_outside_hours',
          vars: { who, hour, ip: ev.ip ?? 'an unknown address', role: ev.adminRole ?? 'staff' },
        });
      }
    } catch {
      // An alert that cannot be sent must never fail the sign-in that
      // triggered it. The row is already in the log either way.
    }
  }

  async accountLocked(userId: string, unlockAt: Date, at: Date = new Date()): Promise<void> {
    const when     = AccountSecurityService.when(at);
    const unlock   = AccountSecurityService.clock(unlockAt);
    await this.deliver({
      userId,
      type:  NotificationType.SECURITY_ALERT,
      title: 'Your account was locked',
      body:  `Too many failed sign-in attempts locked your SEIRS account at ${when}. It unlocks by itself at ${unlock}. If this was not you, change your password once it lifts.`,
      templateKey: 'security_account_locked',
      vars:  { when, unlockAt: unlock },
    });
  }

  // ── 5. Payout account change requested ─────────────────────────────────────

  /**
   * The in-app half of this has existed since 2026-08-27, fired
   * directly from PaymentsService. What it never had was an email, and
   * a payout redirect is the single event in this file most worth
   * having in writing: on a weekly payout cycle a silent redirect is
   * discovered up to a week late, by which time the money is gone.
   *
   * PaymentsService now calls here instead of pushing its own, so this
   * stays ONE notice per event with a second channel added, not two
   * notices that make a person trust both less.
   */
  async bankChangeRequested(
    userId: string,
    accountNumber: string,
    bankName: string,
    at: Date = new Date(),
  ): Promise<void> {
    const when  = AccountSecurityService.when(at);
    const last4 = AccountSecurityService.last4(accountNumber);
    const bank  = bankName || 'a new bank';
    await this.deliver({
      userId,
      type:  NotificationType.SECURITY_ALERT,
      title: 'Payout account change requested',
      body:  `A request to send your payouts to ${bank} ending ${last4} is being reviewed. Your money still goes to your current account until then. If this was not you, contact support now.`,
      templateKey: 'security_bank_change_requested',
      vars:  { when, bank, last4 },
    });
  }

  /**
   * A first payout account, applied straight away with no review.
   *
   * Not a request and not an approval, so it gets its own wording. It
   * reuses the approved template because the reader's question is the
   * same: money now goes here, was that you.
   */
  async bankAccountSet(
    userId: string,
    accountNumber: string,
    bankName: string,
    at: Date = new Date(),
  ): Promise<void> {
    const when  = AccountSecurityService.when(at);
    const last4 = AccountSecurityService.last4(accountNumber);
    const bank  = bankName || 'your bank';
    await this.deliver({
      userId,
      type:  NotificationType.SECURITY_ALERT,
      title: 'Payout account set',
      body:  `Your SEIRS payouts will go to ${bank} ending ${last4}. If this was not you, contact support now.`,
      templateKey: 'security_bank_change_approved',
      vars:  { when, bank, last4 },
    });
  }

  // ── 6. Payout account change approved or rejected ──────────────────────────

  async bankChangeResolved(
    userId: string,
    approved: boolean,
    accountNumber: string,
    bankName: string,
    at: Date = new Date(),
  ): Promise<void> {
    const when  = AccountSecurityService.when(at);
    const last4 = AccountSecurityService.last4(accountNumber);
    const bank  = bankName || 'your bank';
    await this.deliver({
      userId,
      type:  NotificationType.SECURITY_ALERT,
      title: approved ? 'Payout account updated' : 'Payout account change declined',
      body:  approved
        ? `Your payouts now go to ${bank} ending ${last4}. If you did not request this, contact support immediately.`
        : `Your request to change payouts to ${bank} ending ${last4} was not approved. Your current account is unchanged.`,
      templateKey: approved ? 'security_bank_change_approved' : 'security_bank_change_rejected',
      vars:  { when, bank, last4 },
    });
  }

  // ── 7. Account suspended ───────────────────────────────────────────────────

  /**
   * The reason is not optional in the copy. "Your account has been
   * suspended" with no cause is the message that turns a policy
   * decision into a support fight, and a suspended person cannot open
   * the app to go looking for an explanation.
   *
   * Email matters more than push here than anywhere else: a suspended
   * account cannot sign in to read its own inbox.
   */
  async accountSuspended(userId: string, reason: string, at: Date = new Date()): Promise<void> {
    const when = AccountSecurityService.when(at);
    const why  = reason?.trim() || 'No reason was recorded. Contact support and we will explain.';
    await this.deliver({
      userId,
      type:  NotificationType.ACCOUNT_UPDATE,
      title: 'Your account has been suspended',
      body:  `Your SEIRS account was suspended on ${when}. Reason: ${why} Contact support if you believe this is a mistake.`,
      templateKey: 'account_suspended',
      vars:  { when, reason: why },
    });
  }

  // ── 8. Account reactivated ─────────────────────────────────────────────────

  async accountReactivated(userId: string, at: Date = new Date()): Promise<void> {
    const when = AccountSecurityService.when(at);
    await this.deliver({
      userId,
      type:  NotificationType.ACCOUNT_UPDATE,
      title: 'Your account is active again',
      body:  `Your SEIRS account was reactivated on ${when}. You can sign in and carry on as normal.`,
      templateKey: 'account_reactivated',
      vars:  { when },
    });
  }

  // ── 9. Identity verification approved or rejected ──────────────────────────

  async identityVerificationResolved(
    userId: string,
    approved: boolean,
    reason?: string,
    at: Date = new Date(),
  ): Promise<void> {
    const when = AccountSecurityService.when(at);
    const why  = reason?.trim() || 'The document could not be read clearly enough to approve.';
    await this.deliver({
      userId,
      type:  NotificationType.ACCOUNT_UPDATE,
      title: approved ? 'Your identity is verified' : 'We could not verify your ID',
      body:  approved
        ? `Your ID was approved on ${when}. Your account now carries the verified badge and its higher limits.`
        : `The ID you submitted was reviewed on ${when} and could not be approved. Reason: ${why} You can submit again from Profile.`,
      templateKey: approved ? 'identity_verification_approved' : 'identity_verification_rejected',
      vars:  approved ? { when } : { when, reason: why },
    });
  }

  // ── 10. Driver KYC document approved or rejected ───────────────────────────

  /**
   * Names the document, because "a document was rejected" against a
   * seven-document KYC pack tells a rider to re-upload all seven.
   *
   * No call site yet: the backend stores driver KYC documents as bare
   * URL columns on the driver row with no per-document status, so
   * approval only exists at whole-driver granularity in AdminService.
   * Kept here so wiring it is a one-line change from whoever adds the
   * per-document review queue.
   */
  async driverDocumentReviewed(
    userId: string,
    documentName: string,
    approved: boolean,
    reason?: string,
    at: Date = new Date(),
  ): Promise<void> {
    const when = AccountSecurityService.when(at);
    const doc  = documentName?.trim() || 'A document';
    const why  = reason?.trim() || 'The document was not clear enough to accept.';
    await this.deliver({
      userId,
      type:  NotificationType.ACCOUNT_UPDATE,
      title: approved ? `${doc} approved` : `${doc} needs re-uploading`,
      body:  approved
        ? `Your ${doc} was approved on ${when}. Open the driver app to see anything still outstanding.`
        : `Your ${doc} was reviewed on ${when} and could not be accepted. Reason: ${why} Upload a replacement from the driver app.`,
      templateKey: approved ? 'driver_document_approved' : 'driver_document_rejected',
      vars:  approved
        ? { when, documentName: doc }
        : { when, documentName: doc, reason: why },
    });
  }

  // ── 11. Deletion requested ─────────────────────────────────────────────────

  /**
   * Carries the date the account actually goes, because the whole point
   * of the grace window is that it can be stopped, and nobody stops
   * something they were never told about. Somebody who did not request
   * this has until that date to notice.
   */
  async deletionRequested(
    userId: string,
    scheduledAt: Date,
    at: Date = new Date(),
  ): Promise<void> {
    const when         = AccountSecurityService.when(at);
    const deletionDate = AccountSecurityService.day(scheduledAt);
    await this.deliver({
      userId,
      type:  NotificationType.ACCOUNT_UPDATE,
      title: 'Your account is scheduled for deletion',
      body:  `Your SEIRS account is scheduled to be deleted on ${deletionDate}. Sign in and tap Cancel Deletion before then to keep it. If you did not ask for this, cancel it now and change your password.`,
      templateKey: 'account_deletion_scheduled',
      vars:  { when, deletionDate },
    });
  }

  // ── 12. Deletion cancelled ─────────────────────────────────────────────────

  async deletionCancelled(userId: string, at: Date = new Date()): Promise<void> {
    const when = AccountSecurityService.when(at);
    await this.deliver({
      userId,
      type:  NotificationType.ACCOUNT_UPDATE,
      title: 'Your account will not be deleted',
      body:  `The scheduled deletion of your SEIRS account was cancelled on ${when}. Nothing was removed. If you did not cancel it yourself, contact support and change your password.`,
      templateKey: 'account_deletion_cancelled',
      vars:  { when },
    });
  }
}
