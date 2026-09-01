import { canonicalRcNumber, isValidRcNumber, RC_NUMBER_ERROR } from '../common/rc-number';
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import * as appleSignin from 'apple-signin-auth';
import { User, UserRole } from '../users/user.entity';
import { Driver } from '../drivers/driver.entity';
import { BusinessAccount } from '../business/business-account.entity';
import { PartnerStore, PartnerStoreStatus } from '../business/partner-store.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { MailService } from '../mail/mail.service';
import { SignInEvent } from '../admin/sign-in-event.entity';
import { AccountSecurityService } from '../notifications/account-security.service';
import { ConfigService } from '@nestjs/config';
import {
  AccountIdPrefix,
  type AccountIdPrefixType,
  generateAccountId,
  generateOtp,
  generateUuidAccountId,
} from '../common/utils/auth-codes';

/**
 * Caller detail the sign-in paths use to spot an unfamiliar device.
 *
 * Optional throughout, because an older client that does not send a
 * user-agent must still be able to sign in. A missing agent costs only
 * the new-device alert, and silence is the right answer when there is
 * nothing to tell one device from another.
 */
/**
 * The window an admin is expected to be working in, Lagos time.
 *
 * A code fallback only. The real values belong in the Fee Catalogue as
 * admin_hours_start / admin_hours_end so ops can move them without a
 * deploy, per the standing rule that every policy dial is editable.
 *
 * Nothing here blocks anybody: outside this window a successful sign-in is
 * flagged and a super admin is emailed, with a one-tap suspend. Founder,
 * 2 September 2026. Locking a super admin out of his own dashboard at 2am
 * during a launch incident is its own kind of outage.
 */
const ADMIN_HOURS_START = 6;
const ADMIN_HOURS_END   = 22;

export interface SignInContext {
  userAgent?: string | null;
  /** Recorded on admin sign-ins so an attempt can be placed. */
  ip?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    @InjectRepository(User)             private usersRepo:   Repository<User>,
    @InjectRepository(Driver)           private driversRepo: Repository<Driver>,
    @InjectRepository(BusinessAccount)  private bizRepo:     Repository<BusinessAccount>,
    @InjectRepository(PartnerStore)     private storeRepo:   Repository<PartnerStore>,
    private jwtService:  JwtService,
    private mailService: MailService,
    private cfg:         ConfigService,
    private security:    AccountSecurityService,
    @InjectRepository(SignInEvent) private signIns: Repository<SignInEvent>,
  ) {
    this.googleClient = new OAuth2Client(cfg.get<string>('GOOGLE_CLIENT_ID'));
  }

  // Must stay in sync with shared/utils/password.ts (frontend source of truth)
  // and the @Matches() rule on register.dto.ts. Requires: 8+ chars, uppercase,
  // lowercase, digit, AND symbol (not OR - Flutterwave-style policy).
  private static readonly PASSWORD_REGEX =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]).{8,}$/;
  private static readonly PASSWORD_HELP =
    'Password must be at least 8 characters with uppercase, lowercase, a number, and a symbol.';

  private static toTitleCase(str: string): string {
    return str.trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Collision-safe SEIRS ID (2026-08-09). The users.accountId unique
   * constraint is the authoritative guard, but without a retry a random
   * clash would fail the whole registration. At full-Nigeria scale
   * (220M users in a 32^8 space) the birthday bound predicts ~22k raw
   * clashes across the rollout; this loop turns each into an invisible
   * regenerate. 5 attempts bounds worst-case latency; the probability
   * all 5 clash is ~1e-17 even at full occupancy of 220M IDs.
   */
  private async uniqueAccountId(prefix: AccountIdPrefixType): Promise<string> {
    let id = generateAccountId(prefix);
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await this.usersRepo.exist({ where: { accountId: id } });
      if (!exists) return id;
      id = generateAccountId(prefix);
    }
    return id; // DB unique constraint remains the final guard
  }

  /**
   * Canonicalise email so one inbox = one account, regardless of `+` aliases.
   * 2026-05-11 - closes the abuse loophole where a single user could create
   * unlimited accounts via `me+a@gmail.com`, `me+b@gmail.com`, etc. (each
   * delivering to the same inbox so each passes OTP).
   *
   * Strips `+suffix` for providers that ignore it: Gmail, iCloud, FastMail.
   * Yahoo uses `-` as their alias separator; we strip that for yahoo.com too.
   * Other providers (Outlook, custom domains) get pass-through - `+` may be
   * a literal valid character in their addressing.
   */
  static canonicalEmail(raw: string): string {
    const trimmed = raw.trim().toLowerCase();
    const [local, domain] = trimmed.split('@');
    if (!domain) return trimmed;

    const stripPlus     = ['gmail.com', 'googlemail.com', 'icloud.com', 'me.com', 'mac.com', 'fastmail.com'];
    const stripDash     = ['yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com'];

    let canonicalLocal = local;
    if (stripPlus.includes(domain)) canonicalLocal = local.split('+')[0];
    if (stripDash.includes(domain)) canonicalLocal = local.split('-')[0];

    // Gmail also ignores dots in the local part (j.doe@gmail = jdoe@gmail).
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      canonicalLocal = canonicalLocal.replace(/\./g, '');
    }

    return `${canonicalLocal}@${domain}`;
  }

  async register(dto: RegisterDto) {
    const email = AuthService.canonicalEmail(dto.email);

    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) {
      if (!existing.emailVerified) {
        // Re-send for unverified accounts rather than blocking. This is
        // also the recovery path for an account whose first email failed.
        const { sent } = await this.issueOtp(existing);
        return {
          message: sent
            ? 'Verification email re-sent. Please check your inbox.'
            : 'Your code is ready but we could not send the email just now. Tap resend in a moment, or contact support.',
          requiresOtp: true,
          emailSent:   sent,
        };
      }
      throw new ConflictException('Email already registered.');
    }

    if (dto.role === UserRole.DRIVER && !dto.vehicleType) {
      throw new BadRequestException('Vehicle type is required for driver registration.');
    }

    // Drivers must have an address on file. Customers may skip it (signup is
    // where people drop out and a sender can add it at first booking), but a
    // courier holding other people's goods cannot: founder's call 2026-09-01,
    // "in case of theft". Enforced here as well as in the app so it does not
    // rest on a client gate anyone can bypass by posting directly.
    if (dto.role === UserRole.DRIVER) {
      const a = dto.homeAddress;
      if (!a?.state?.trim() || !a?.city?.trim() || !a?.street?.trim()) {
        throw new BadRequestException('A home address (state, city and street) is required for driver registration.');
      }
    }

    if (!AuthService.PASSWORD_REGEX.test(dto.password)) {
      throw new BadRequestException(
        'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number or symbol.',
      );
    }

    const hashed    = await bcrypt.hash(dto.password, 12);
    const accountId = await this.uniqueAccountId(
      dto.role === UserRole.DRIVER ? AccountIdPrefix.DRIVER : AccountIdPrefix.CUSTOMER,
    );

    const user = this.usersRepo.create({
      name:           AuthService.toTitleCase(dto.name),
      email,
      phone:          dto.phone.trim(),
      password:       hashed,
      role:           dto.role,
      accountId,
      emailVerified:  false,
      referredByCode: dto.referralCode?.trim().toUpperCase() || null,
      // Optional at signup, so null when the sender skipped it. Same jsonb
      // shape the profile screen edits later. Drivers must send it: a courier
      // holding other people's goods has to have an address on file.
      homeAddress:    dto.homeAddress ?? null,
      // Consent. The DTO has accepted these since it was written and nothing
      // ever stored them (2026-09-01).
      ageConfirmed:    dto.ageConfirmed === true,
      termsAcceptedAt: dto.termsAcceptedAt ? new Date(dto.termsAcceptedAt) : null,
    });
    await this.usersRepo.save(user);

    if (dto.role === UserRole.DRIVER) {
      const driver = this.driversRepo.create({
        user,
        vehicleType:    dto.vehicleType,
        // Spec V8 §2.9 - driver referral attribution. Same code shape
        // as customers (8-char uppercase). Stored on both the user
        // and driver row for downstream reward fulfilment.
        referredByCode: dto.referralCode?.trim().toUpperCase() || null,
      });
      await this.driversRepo.save(driver);
    }

    const { sent } = await this.issueOtp(user);

    return {
      message: sent
        ? 'Account created. Please verify your email.'
        : 'Account created, but we could not send the verification email just now. Tap resend in a moment, or contact support.',
      requiresOtp: true,
      emailSent:   sent,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const email = AuthService.canonicalEmail(dto.email);

    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.emailVerificationOtp')
      .addSelect('u.emailVerificationExpiry')
      .where('u.email = :email', { email })
      .getOne();

    if (!user) throw new NotFoundException('No account found with this email.');
    if (user.emailVerified) throw new BadRequestException('Email already verified.');

    if (!user.emailVerificationOtp) {
      throw new BadRequestException('Invalid verification code.');
    }
    const otpMatch = await bcrypt.compare(dto.otp, user.emailVerificationOtp);
    if (!otpMatch) {
      throw new BadRequestException('Invalid verification code.');
    }

    if (!user.emailVerificationExpiry || user.emailVerificationExpiry < new Date()) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    await this.usersRepo.update(user.id, {
      emailVerified:           true,
      emailVerificationOtp:    null,
      emailVerificationExpiry: null,
    });

    user.emailVerified = true;
    await this.mailService.sendWelcome(user.email, user.name);

    return this.buildAuthResponse(user);
  }

  async resendOtp(email: string) {
    const normalised = AuthService.canonicalEmail(email);

    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.emailVerificationExpiry')
      .where('u.email = :email', { email: normalised })
      .getOne();

    if (!user) {
      // Anti-enumeration: return success regardless
      return { message: 'If that email exists and is unverified, a new code has been sent.' };
    }

    if (user.emailVerified) {
      return { message: 'If that email exists and is unverified, a new code has been sent.' };
    }

    // Rate-limit: only allow resend if previous OTP is more than 60s old
    if (user.emailVerificationExpiry) {
      const expiresAt = user.emailVerificationExpiry.getTime();
      const issuedAt  = expiresAt - 15 * 60 * 1000;
      const secondsSinceIssue = (Date.now() - issuedAt) / 1000;
      if (secondsSinceIssue < 60) {
        throw new HttpException('Please wait before requesting another code.', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    await this.issueOtp(user);

    return { message: 'If that email exists and is unverified, a new code has been sent.' };
  }

  private static readonly MAX_ATTEMPTS  = 5;
  private static readonly LOCKOUT_MS    = 15 * 60 * 1000; // 15 minutes

  /**
   * Fire the two notices every sign-in path owes the account holder.
   *
   * Both are deliberately unawaited. A sign-in must not get slower, and
   * must not fail, because a push or an email is slow or dead:
   * AccountSecurityService swallows its own errors, and the extra catch
   * here means even an unexpected rejection cannot take the process
   * down. The lock notice in particular has to go out on a request that
   * is about to throw 401, so it cannot be part of the response path.
   */
  private noteSignInSuccess(userId: string, ctx?: SignInContext): void {
    this.security.recordSignIn(userId, { userAgent: ctx?.userAgent ?? null })
      .catch(e => this.logger.warn(`sign-in device check failed for ${userId}: ${e?.message ?? e}`));
  }

  /**
   * Write one admin sign-in attempt to the log.
   *
   * Every outcome, not only success. Six bad passwords at 3am followed by
   * one success is the only shape that shows an attack, and it needs both
   * halves. Never stores a password, an attempted password, or a TOTP code.
   *
   * Fire-and-forget with its own catch: an audit write must not be able to
   * fail a sign-in, and it must not be able to fail a 401 either.
   */
  private recordAdminSignIn(input: {
    userId?: string | null; email: string; name?: string | null;
    adminRole?: string | null; outcome: string; ctx?: SignInContext;
  }): void {
    // Lagos is UTC+1 year round, so this needs no tz database.
    const lagosHour = (new Date().getUTCHours() + 1) % 24;
    this.signIns.save(this.signIns.create({
      userId:    input.userId ?? null,
      email:     (input.email ?? '').slice(0, 180),
      name:      input.name ?? null,
      adminRole: input.adminRole ?? null,
      outcome:   input.outcome,
      ip:        input.ctx?.ip?.slice(0, 60) ?? null,
      userAgent: input.ctx?.userAgent?.slice(0, 400) ?? null,
      lagosHour,
      outsideHours: lagosHour < ADMIN_HOURS_START || lagosHour >= ADMIN_HOURS_END,
    }))
      .then(ev => {
        // Somebody signed in outside the window. Tell a super admin, and
        // give them a one-tap suspend. Founder 2026-09-02: flag and mail,
        // never block.
        if (ev.outsideHours && input.outcome === 'success' && input.userId) {
          this.security.adminOutsideHoursSignIn?.(ev).catch(() => {});
        }
      })
      .catch(e => this.logger.warn(`sign-in log write failed: ${e?.message ?? e}`));
  }

  private noteAccountLocked(userId: string, unlockAt: Date): void {
    this.security.accountLocked(userId, unlockAt)
      .catch(e => this.logger.warn(`lockout notice failed for ${userId}: ${e?.message ?? e}`));
  }

  async login(dto: LoginDto, ctx?: SignInContext) {
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .addSelect('u.failedLoginAttempts')
      .addSelect('u.lockedUntil')
      // canonicalEmail strips +aliases for consumer providers so login
      // works the same whether user typed me+a@gmail.com or me@gmail.com.
      .where('LOWER(u.email) = LOWER(:email)', { email: AuthService.canonicalEmail(dto.email) })
      .getOne();

    if (!user) throw new UnauthorizedException('Invalid email or password.');

    // New soft-delete flow leaves isActive=true during the grace window;
    // the presence of deletionScheduledAt is what signals pending deletion.
    // Bans set isActive=false without deletionScheduledAt - those still
    // fail login. Merged accounts fail with a specific message.
    if (!user.isActive) {
      if (user.mergedIntoUserId) {
        throw new UnauthorizedException('This account was merged into another. Sign in with the primary account.');
      }
      throw new UnauthorizedException('Account suspended. Contact support.');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Please verify your email before signing in.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new HttpException(
        `Too many failed attempts. Try again in ${retryAfter} minute${retryAfter === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const update: Partial<typeof user> = { failedLoginAttempts: attempts };
      if (attempts >= AuthService.MAX_ATTEMPTS) {
        update.lockedUntil = new Date(Date.now() + AuthService.LOCKOUT_MS);
      }
      await this.usersRepo.update(user.id, update as any);
      if (update.lockedUntil) this.noteAccountLocked(user.id, update.lockedUntil);
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Successful password match - reset failed attempt counter but leave
    // any pending deletion untouched. The app surfaces the deletion state
    // via `pendingDeletion` in the auth response and the user cancels
    // explicitly via /users/me/cancel-deletion.
    await this.usersRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null } as any);
    this.noteSignInSuccess(user.id, ctx);
    return this.buildAuthResponse(user);
  }

  async googleLogin(dto: SocialLoginDto) {
    const clientId = this.cfg.get<string>('GOOGLE_CLIENT_ID');
    let payload: { sub: string; email: string; name: string };

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken:  dto.idToken,
        audience: clientId,
      });
      const p = ticket.getPayload();
      if (!p?.sub || !p?.email) throw new Error('Invalid payload');
      payload = { sub: p.sub, email: p.email, name: p.name ?? p.email };
    } catch {
      throw new UnauthorizedException('Invalid Google token.');
    }

    const email = AuthService.canonicalEmail(payload.email);

    let user = await this.usersRepo.findOne({ where: [{ googleId: payload.sub }, { email }] });

    if (!user) {
      const accountId = await this.uniqueAccountId(AccountIdPrefix.CUSTOMER);
      user = this.usersRepo.create({
        name:          AuthService.toTitleCase(payload.name),
        email,
        phone:         '',
        password:      '',
        role:          UserRole.CUSTOMER,
        googleId:      payload.sub,
        accountId,
        emailVerified: true,
      });
      await this.usersRepo.save(user);
      await this.mailService.sendWelcome(user.email, user.name);
    } else if (!user.googleId) {
      await this.usersRepo.update(user.id, { googleId: payload.sub, emailVerified: true });
      user.googleId = payload.sub;
    }

    if (!user.isActive) throw new UnauthorizedException('Account suspended. Contact support.');

    return this.buildAuthResponse(user);
  }

  async appleLogin(dto: SocialLoginDto) {
    let payload: { sub: string; email?: string };

    try {
      const result = await appleSignin.verifyIdToken(dto.idToken, {
        audience:        this.cfg.get<string>('APPLE_CLIENT_ID'),
        ignoreExpiration: false,
      });
      if (!result.sub) throw new Error('Invalid payload');
      payload = { sub: result.sub, email: result.email };
    } catch {
      throw new UnauthorizedException('Invalid Apple token.');
    }

    let user = await this.usersRepo.findOne({ where: { appleId: payload.sub } });

    if (!user) {
      if (!payload.email) {
        throw new BadRequestException('Email is required for first-time Apple sign-in.');
      }
      const email     = AuthService.canonicalEmail(payload.email);
      const existing  = await this.usersRepo.findOne({ where: { email } });
      const accountId = await this.uniqueAccountId(AccountIdPrefix.CUSTOMER);

      if (existing) {
        await this.usersRepo.update(existing.id, { appleId: payload.sub, emailVerified: true });
        existing.appleId = payload.sub;
        user = existing;
      } else {
        user = this.usersRepo.create({
          name:          email.split('@')[0],
          email,
          phone:         '',
          password:      '',
          role:          UserRole.CUSTOMER,
          appleId:       payload.sub,
          accountId,
          emailVerified: true,
        });
        await this.usersRepo.save(user);
        await this.mailService.sendWelcome(user.email, user.name);
      }
    }

    if (!user.isActive) throw new UnauthorizedException('Account suspended. Contact support.');

    return this.buildAuthResponse(user);
  }

  async getMe(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    if (user.role === UserRole.DRIVER) {
      const driver = await this.driversRepo.findOne({
        where: { user: { id: userId } },
        relations: ['user'],
      });
      return { user, driver };
    }

    return { user };
  }

  async forgotPassword(email: string) {
    if (!email) throw new BadRequestException('Email is required.');
    const user = await this.usersRepo.findOne({
      where: { email: ILike(AuthService.canonicalEmail(email)) },
    });

    if (!user) return { message: 'If that email exists, a reset link has been sent.' };

    const token  = uuidv4();
    // 15 minutes (founder 2026-08-13: "anything password related should
    // be short time for security reasons", tightened from 30). A reset
    // link is a bearer key to the account: the window only needs to
    // cover reading one email, and every extra minute is runway for
    // whoever else is sitting in that inbox. Token is single-use.
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await this.usersRepo.update(user.id, {
      passwordResetToken:  token,
      passwordResetExpiry: expiry,
    });

    // Admins receive a web URL (admin dashboard); everyone else gets a
    // deep link in THEIR app's scheme. One email = one account = one
    // role, so the role fully determines which app to open: driver ->
    // seirsdriver, business (businessAccountId set) -> seirsbusiness,
    // else customer.
    const audience =
      user.role === UserRole.ADMIN  ? 'admin' :
      user.role === UserRole.DRIVER ? 'driver' :
      user.businessAccountId        ? 'business' : 'customer';
    // 15, matching the token minted above. The template used to hard-code
    // 30 and send real customers after a link that had already died.
    await this.mailService.sendPasswordReset(user.email, user.name, token, audience, 15);

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  // Spec V8 - logged-in password change. Requires current password as
  // proof so a stolen session token alone can't lock the user out.
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.id = :id', { id: userId })
      .getOne();
    if (!user) throw new NotFoundException('Account not found');

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) throw new BadRequestException('Current password did not match.');

    if (!AuthService.PASSWORD_REGEX.test(newPassword)) {
      throw new BadRequestException(
        'New password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number or symbol.',
      );
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must be different from current password.');
    }

    await this.usersRepo.update(userId, {
      password: await bcrypt.hash(newPassword, 12),
    });

    /**
     * Tell them it happened, even though they just did it.
     *
     * The notice is not for the person who typed it. It is for the
     * person who did NOT, whose session token was stolen: a change made
     * from a hijacked session is otherwise completely silent, and the
     * owner discovers it the next time their own password stops
     * working. Unawaited so a dead mail transport cannot turn a
     * successful password change into an error.
     */
    this.security.passwordChanged(userId)
      .catch(e => this.logger.warn(`password-change notice failed for ${userId}: ${e?.message ?? e}`));

    return { message: 'Password changed.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordResetToken')
      .addSelect('u.passwordResetExpiry')
      .where('u.passwordResetToken = :token', { token })
      .getOne();

    if (!user) throw new BadRequestException('Invalid or expired reset token.');
    if (!user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      throw new BadRequestException('Reset token has expired. Please request a new one.');
    }

    if (!AuthService.PASSWORD_REGEX.test(newPassword)) {
      throw new BadRequestException(AuthService.PASSWORD_HELP);
    }

    const hashed = await bcrypt.hash(newPassword, 12);

    await this.usersRepo.update(user.id, {
      password:            hashed,
      passwordResetToken:  null,
      passwordResetExpiry: null,
    });

    // The reset path matters more than the deliberate change above: it
    // is the one that needs no knowledge of the old password, so it is
    // the route a takeover actually takes.
    this.security.passwordChanged(user.id)
      .catch(e => this.logger.warn(`password-reset notice failed for ${user.id}: ${e?.message ?? e}`));

    return { message: 'Password reset successful. You can now log in.' };
  }

  /**
   * Store a fresh OTP and try to email it. Returns whether the email
   * actually went out.
   *
   * This used to let a mail failure propagate. Because register() saves
   * the user BEFORE calling this, the throw surfaced as a 500 while the
   * account existed, and the re-register path called straight back into
   * here and threw again: a permanent lockout for anyone whose address
   * the provider refused (found live 2026-08-24, twice).
   *
   * The OTP hash is written before the send, so a failed email loses
   * nothing. The code is valid and Resend will deliver it once the mail
   * path is healthy. Report, do not throw.
   */
  private async issueOtp(user: User): Promise<{ sent: boolean }> {
    const otp    = generateOtp();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);
    const hashed = await bcrypt.hash(otp, 8);

    await this.usersRepo.update(user.id, {
      emailVerificationOtp:    hashed,
      emailVerificationExpiry: expiry,
    });

    try {
      await this.mailService.sendEmailVerification(user.email, user.name, otp);
      return { sent: true };
    } catch (e: any) {
      this.logger?.error?.(
        `Verification email failed for ${user.email}: ${e?.message ?? e}. ` +
        'The account and its OTP are stored; the user can request a resend.',
      );
      return { sent: false };
    }
  }

  // ── Business / Partner Auth ────────────────────────────────────────────────

  async businessRegister(data: any) {
    const email = data.email ? AuthService.canonicalEmail(data.email) : null;
    if (!email) throw new BadRequestException('Email is required.');

    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing && existing.emailVerified) {
      throw new ConflictException('Email already registered.');
    }
    if (existing && !existing.emailVerified) {
      await this.issueOtp(existing);
      return { requiresOtp: true, email, message: 'Verification code re-sent.' };
    }

    if (!isValidRcNumber(data.rcNumber)) {
      throw new BadRequestException(RC_NUMBER_ERROR);
    }

    const hashed = await bcrypt.hash(data.password, 12);
    // Always BIZ-, never PART- (cleanup 2026-08-12). Partner is a
    // CAPABILITY of a business account, not a separate kind of account:
    // the SEIRS ID is printed on receipts and package labels, so it must
    // not change when a business is later approved to hold packages.
    // A store's own public identity is its storeCode (PART-XXXX on the
    // partner_stores row), which is a property of the shop, not the
    // company. The old branch minted a PART- SEIRS ID for anyone posting
    // accountType 'partner'; no client ever sent it, so nothing in
    // production carries such an ID, but it was a live trap for the next
    // developer.
    const accountId = generateUuidAccountId(AccountIdPrefix.BUSINESS);

    // Hybrid-account redesign (2026-05-11): every new business signup gets
    // canSend=true (instant). canPartner stays false until they apply via
    // Settings → "Apply to be a Partner Store" and an admin approves the
    // KYC docs. Legacy `businessRole` kept in sync for back-compat readers
    // (admin dashboard, old client code).
    const isPartnerSignup = data.accountType === 'partner';
    const user = this.usersRepo.create({
      name:          data.name?.trim(),
      email,
      phone:         data.phone?.trim() ?? '',
      password:      hashed,
      role:          UserRole.CUSTOMER,
      businessRole:  isPartnerSignup ? 'partner' : 'sender',
      capabilities:  { canSend: true, canPartner: false },
      accountId,
      emailVerified: false,
      // Referral attribution, 2026-09-01. Customer and driver signups have
      // always set this; business never did, so a business that arrived
      // through someone's referral link earned that person nothing.
      referredByCode: data.referralCode?.trim().toUpperCase() || null,
      // Consent, same gap as the other path.
      ageConfirmed:    data.ageConfirmed === true,
      termsAcceptedAt: data.termsAcceptedAt ? new Date(data.termsAcceptedAt) : null,
    });
    await this.usersRepo.save(user);

    // Every business signup gets a sender business account (the bulk-dispatch
    // wallet + recurring deliveries surface). Partner mode is *additive* on
    // top - applied for later via the Settings upgrade flow.
    const biz = this.bizRepo.create({
      ownerId:         user.id,
      companyName:     data.companyName ?? data.name,
      rcNumber:        canonicalRcNumber(data.rcNumber),
      businessAddress: data.businessAddress ?? '',
      // Structured parts (2026-05-11) - sent by the new register UI; older
      // clients omit them, which is fine because the columns are nullable.
      state:           data.state ?? null,
      city:            data.city ?? null,
      streetAddress:   data.streetAddress ?? null,
      walletBalance:   0,
      loyaltyPoints:   0,
    });
    await this.bizRepo.save(biz);
    await this.usersRepo.update(user.id, { businessAccountId: biz.id });

    // If they ALSO picked "I'm a Partner Store" at signup, queue the partner
    // application as PENDING_REVIEW. canPartner stays false until admin
    // approves - backwards-compatible with the existing one-role-per-signup
    // mental model while unlocking the path for the new hybrid pattern.
    if (isPartnerSignup) {
      const store = this.storeRepo.create({
        userId:       user.id,
        storeName:    data.storeName ?? data.name,
        storeAddress: data.storeAddress ?? '',
        maxCapacity:  data.capacity ?? 50,
        status:       PartnerStoreStatus.PENDING_REVIEW,
      });
      await this.storeRepo.save(store);
      await this.usersRepo.update(user.id, { partnerStoreId: store.id });
    }

    await this.issueOtp(user);

    return { requiresOtp: true, email, message: 'Account created. Please verify your email.' };
  }

  async adminLogin(email: string, password: string, ctx?: SignInContext) {
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .addSelect('u.failedLoginAttempts')
      .addSelect('u.lockedUntil')
      .where('LOWER(u.email) = LOWER(:email)', { email: AuthService.canonicalEmail(email) })
      .getOne();

    if (!user || user.role !== UserRole.ADMIN) {
      // Logged even though no account matched: an attempt against an
      // address that does not exist is itself the signal.
      this.recordAdminSignIn({
        email, outcome: user ? 'not_admin' : 'no_account',
        userId: user?.id ?? null, name: user?.name ?? null, ctx,
      });
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (!user.isActive) {
      this.recordAdminSignIn({
        userId: user.id, email, name: user.name,
        adminRole: (user as any).adminRole, outcome: 'suspended', ctx,
      });
      throw new UnauthorizedException('Account suspended. Contact support.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.recordAdminSignIn({
        userId: user.id, email, name: user.name,
        adminRole: (user as any).adminRole, outcome: 'locked', ctx,
      });
      const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new HttpException(
        `Too many failed attempts. Try again in ${retryAfter} minute${retryAfter === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const update: Partial<typeof user> = { failedLoginAttempts: attempts };
      if (attempts >= AuthService.MAX_ATTEMPTS) {
        update.lockedUntil = new Date(Date.now() + AuthService.LOCKOUT_MS);
      }
      await this.usersRepo.update(user.id, update as any);
      if (update.lockedUntil) this.noteAccountLocked(user.id, update.lockedUntil);
      this.recordAdminSignIn({
        userId: user.id, email, name: user.name,
        adminRole: (user as any).adminRole, outcome: 'bad_password', ctx,
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.usersRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });
    this.noteSignInSuccess(user.id, ctx);
    this.recordAdminSignIn({
      userId: user.id, email, name: user.name,
      adminRole: (user as any).adminRole, outcome: 'success', ctx,
    });
    return this.buildAuthResponse(user);
  }

  async businessLogin(email: string, password: string, ctx?: SignInContext) {
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .addSelect('u.failedLoginAttempts')
      .addSelect('u.lockedUntil')
      .where('LOWER(u.email) = LOWER(:email)', { email: AuthService.canonicalEmail(email) })
      .getOne();

    if (!user || !user.businessRole) throw new UnauthorizedException('Invalid email or password.');
    if (!user.isActive) throw new UnauthorizedException('Account suspended. Contact support.');
    if (!user.emailVerified) {
      throw new UnauthorizedException('Please verify your email before signing in.');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new HttpException(
        `Too many failed attempts. Try again in ${retryAfter} minute${retryAfter === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const update: Partial<typeof user> = { failedLoginAttempts: attempts };
      if (attempts >= AuthService.MAX_ATTEMPTS) {
        update.lockedUntil = new Date(Date.now() + AuthService.LOCKOUT_MS);
      }
      await this.usersRepo.update(user.id, update as any);
      if (update.lockedUntil) this.noteAccountLocked(user.id, update.lockedUntil);
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.usersRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });
    this.noteSignInSuccess(user.id, ctx);
    return this.buildAuthResponse(user);
  }

  async businessVerifyOtp(email: string, otp: string) {
    const normalised = AuthService.canonicalEmail(email);

    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.emailVerificationOtp')
      .addSelect('u.emailVerificationExpiry')
      .where('u.email = :email', { email: normalised })
      .getOne();

    if (!user) throw new NotFoundException('No account found with this email.');
    if (user.emailVerified) throw new BadRequestException('Email already verified.');

    if (!user.emailVerificationOtp) throw new BadRequestException('Invalid verification code.');
    const otpMatch = await bcrypt.compare(otp, user.emailVerificationOtp);
    if (!otpMatch) throw new BadRequestException('Invalid verification code.');

    if (!user.emailVerificationExpiry || user.emailVerificationExpiry < new Date()) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    await this.usersRepo.update(user.id, {
      emailVerified:           true,
      emailVerificationOtp:    null,
      emailVerificationExpiry: null,
    });
    user.emailVerified = true;

    await this.mailService.sendWelcome(user.email, user.name).catch(() => {});

    return this.buildAuthResponse(user);
  }

  // Spec V8 §3.6 - sliding-window refresh for admin sessions. Called
  // from /auth/refresh on user activity so an actively-working admin
  // doesn't get bounced mid-action. Non-admins also get a fresh token
  // (cheap, harmless - keeps the helper generic for all clients).
  async refreshToken(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account not found.');
    if (!user.isActive) throw new UnauthorizedException('Account suspended.');
    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: User) {
    // Spec V8 - resolve dynamic role permissions if assigned. The
    // admin client uses this to render the sidebar + gate page access
    // without hardcoding the permission map.
    //
    // This lookup MUST stay above the sign() call below. It used to sit
    // underneath it, so roleSlug and permissions reached the response
    // body but never the token. roles.service.ts assignToUser writes
    // roleId and never adminRole, so a custom-role admin's token read
    // {role:'admin', adminRole:null}, which the dashboard could not tell
    // apart from a legacy super admin: it decoded both as plain 'admin'
    // and applied no page gating at all. The more carefully a role was
    // configured, the less of it was enforced.
    //
    // Login, admin TOTP verify and /auth/refresh all funnel through this
    // method, so minting the claims here covers every way a session is
    // issued. The dashboard middleware already branches on
    // (roleSlug && permissions) first, so it starts gating correctly the
    // moment these claims appear, with no client change.
    let roleSlug:    string | null = null;
    let roleName:    string | null = null;
    let permissions: string[]      = [];
    if (user.roleId) {
      const role = await this.usersRepo.manager
        .createQueryBuilder()
        .select(['r.slug AS slug', 'r.name AS name', 'r.permissions AS permissions'])
        .from('roles', 'r')
        .where('r.id = :id', { id: user.roleId })
        .getRawOne();
      if (role) {
        roleSlug    = role.slug;
        roleName    = role.name;
        permissions = Array.isArray(role.permissions) ? role.permissions : [];
      }
    }

    // roleSlug stays null for an account with no dynamic role, which is
    // what keeps the dashboard's older adminRole branch in charge of
    // legacy sessions rather than handing them an empty permission list.
    const payload = {
      sub:       user.id,
      email:     user.email,
      role:      user.role,
      adminRole: user.adminRole,
      roleSlug,
      permissions,
    };
    // Spec V8 §3.6 - admin sessions must time out at 30min. Other
    // user roles keep the platform default (7d) so customers don't
    // get bounced to login every time they reopen the app.
    const isAdmin = user.role === UserRole.ADMIN;
    const token   = this.jwtService.sign(payload, isAdmin ? { expiresIn: '30m' } : {});

    return {
      token,
      user: {
        id:           user.id,
        accountId:    user.accountId,
        name:         user.name,
        email:        user.email,
        phone:        user.phone,
        role:         user.role,
        adminRole:    user.adminRole,
        roleId:       user.roleId ?? null,
        roleSlug,
        roleName,
        permissions,
        businessRole: user.businessRole ?? null,
        businessAccountId: user.businessAccountId ?? null,
        partnerStoreId:    user.partnerStoreId ?? null,
      },
      // Present only when the account is scheduled for hard-delete. The
      // client surfaces this as a persistent banner with a "Cancel deletion"
      // action wired to POST /users/me/cancel-deletion. Null when the
      // account has no pending deletion.
      pendingDeletion: user.deletionScheduledAt ? {
        requestedAt: user.deletionRequestedAt?.toISOString?.() ?? null,
        scheduledAt: user.deletionScheduledAt.toISOString(),
        requestedBy: user.deletionRequestedBy ?? 'self',
      } : null,
    };
  }
}
