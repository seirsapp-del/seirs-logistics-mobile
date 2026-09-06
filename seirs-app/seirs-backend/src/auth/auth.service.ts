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
import { createHash } from 'crypto';
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
/**
 * otplib v13 exports functions, not the v12 `authenticator` singleton.
 * Verified against the installed build before use: generateSecret() returns
 * a 32-char base32 string, verifySync() returns { valid, delta }.
 */
import { generateSecret, generateURI, verifySync } from 'otplib';
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
      // Count it. The check above burns the code once this passes the limit.
      await this.usersRepo.increment({ id: user.id }, 'emailOtpAttempts', 1);
      throw new BadRequestException('Invalid verification code.');
    }
    // A correct code clears the counter for whatever is issued next.
    await this.usersRepo.update(user.id, { emailOtpAttempts: 0 } as any);

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

  /**
   * Sign in, for a named app.
   *
   * `expect` is the role the app doing the asking is for. Without it this
   * method checked the password and nothing else, and BOTH the customer
   * and the driver app called it: a customer could sign into the driver
   * app and a driver into the customer app. Nothing leaked, because the
   * driver routes carry JwtAuthGuard and a customer has no driver profile
   * to read, so every call simply 404d "Driver profile not found" and the
   * person sat in a shell that did nothing.
   *
   * Business already got this right through businessLogin, which refuses
   * anyone without a businessRole. This is the same idea for the other two.
   *
   * The refusal deliberately reuses the credentials message: telling
   * somebody "this is a driver account" confirms which app an email is
   * registered on, to anybody who can type an address.
   */
  async login(dto: LoginDto, ctx?: SignInContext, expect?: 'customer' | 'driver') {
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

    // Wrong app for this account. Business accounts are not checked here:
    // they carry role CUSTOMER plus a businessRole and sign in through
    // businessLogin, so whether a business owner may also use the customer
    // app is a separate decision, not one to make silently in a guard.
    if (expect && user.role !== expect) {
      throw new UnauthorizedException('Invalid email or password.');
    }

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

    /*
     * Google says whether it has verified this address. We never asked.
     *
     * The account below is matched by email and then LINKED to this Google
     * identity, with emailVerified set true. Doing that on an address
     * Google itself has not verified is how a social button becomes an
     * account takeover. Always true for gmail.com, not guaranteed for a
     * Workspace domain, which is exactly the case worth refusing.
     */
    if ((payload as any).email_verified === false) {
      throw new UnauthorizedException('That Google address is not verified. Verify it with Google first.');
    }
    const email = AuthService.canonicalEmail(payload.email);

    let user = await this.usersRepo.findOne({ where: [{ googleId: payload.sub }, { email }] });

    // Sign-in only for the driver and business apps. See SocialLoginDto.
    this.assertSocialRole(dto.role, user, 'Google');

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

    /**
     * Apple hides the address on every sign-in after the first, so an
     * existing driver or business is found by appleId here. When it is a
     * first sign-in we have an address and can look them up below; either
     * way the same rule applies, which is why the check runs twice.
     */
    if (user) this.assertSocialRole(dto.role, user, 'Apple');

    if (!user) {
      if (!payload.email) {
        throw new BadRequestException('Email is required for first-time Apple sign-in.');
      }
      // Same reasoning as the Google path. Apple sends this as a string.
      if (String((payload as any).email_verified) === 'false') {
        throw new UnauthorizedException('That Apple address is not verified.');
      }
      const email     = AuthService.canonicalEmail(payload.email);
      const existing  = await this.usersRepo.findOne({ where: { email } });
      this.assertSocialRole(dto.role, existing, 'Apple');
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

  /**
   * Reset tokens are stored hashed, never in the clear.
   *
   * The raw uuid goes in the email and nowhere else. A database dump used
   * to hand over working reset tokens for anybody with a request in
   * flight; now it hands over hashes, which are useless for the 15 minutes
   * they would have been good for (audit 2026-09-05).
   *
   * sha256, not bcrypt: the value has to be LOOKED UP by the incoming
   * token, so the hash must be deterministic. A uuid has full entropy
   * already, so there is nothing for a salt to defend against.
   */
  private static hashResetToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
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
      passwordResetToken:  AuthService.hashResetToken(token),
      passwordResetExpiry: expiry,
    });

    // Admins receive a web URL (admin dashboard); everyone else gets the
    // website's reset page, which only uses the audience to name the app
    // to go back to. One email = one account = one role, so the role
    // fully determines it: driver, business (businessAccountId set),
    // else customer. The apps carry no reset screen (removed 2026-09-06).
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
      .where('u.passwordResetToken = :token', { token: AuthService.hashResetToken(token) })
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

    /**
     * Second factor, if this staff member has one.
     *
     * The dashboard has handled `requiresTOTP` and called
     * /auth/admin-totp-verify since it was built. Neither existed here, so
     * a correct password alone has always been a full admin session, and
     * the client-side flow was dead code against a server that said yes.
     *
     * The temp token carries a scope claim and five minutes. It is useless
     * against any other route: JwtAuthGuard sees no id and rejects it.
     * The sign-in is logged as totp_required rather than success, because
     * nobody is in yet.
     */
    if ((user as any).totpEnabled) {
      this.recordAdminSignIn({
        userId: user.id, email, name: user.name,
        adminRole: (user as any).adminRole, outcome: 'totp_required', ctx,
      });
      const tempToken = await this.jwtService.signAsync(
        { sub: user.id, scope: 'totp_pending' },
        { expiresIn: '5m' },
      );
      return { requiresTOTP: true, tempToken };
    }

    this.noteSignInSuccess(user.id, ctx);
    this.recordAdminSignIn({
      userId: user.id, email, name: user.name,
      adminRole: (user as any).adminRole, outcome: 'success', ctx,
    });
    return this.buildAuthResponse(user);
  }

  /**
   * The driver and business apps may SIGN IN with a social account, never
   * register with one (founder 2026-09-05).
   *
   * Their signup does more than make a user: it creates a Driver row or a
   * BusinessAccount. A social button that skipped that would leave
   * somebody inside an app built entirely around a vehicle or a company
   * they do not have, and the customer path would have filed them as a
   * CUSTOMER on the way in.
   *
   * Silent for the customer app, which is allowed to create.
   */
  private assertSocialRole(
    role: 'customer' | 'driver' | 'business' | undefined,
    user: { role?: UserRole; businessRole?: string | null } | null,
    provider: string,
  ): void {
    if (!role || role === 'customer') {
      /*
       * The customer app used to return here unconditionally, so its Google
       * and Apple buttons let a DRIVER account straight in: the password
       * door has a role check now and this one did not.
       *
       * A missing user is fine and must stay fine, because customer social
       * sign-in is also customer SIGNUP: it creates the account. Only an
       * existing account belonging to another app is refused.
       *
       * Business accounts are deliberately not refused here. They carry role
       * CUSTOMER plus a businessRole, and whether a business owner may also
       * use the customer app is a product decision, not one to make quietly
       * inside a guard.
       */
      if (user?.role === UserRole.DRIVER) {
        throw new UnauthorizedException(
          'That address is registered on another SEIRS app. Sign in there instead.',
        );
      }
      return;
    }

    const kind = role === 'driver' ? 'driver' : 'business';
    const matches =
      role === 'driver'
        ? user?.role === UserRole.DRIVER
        : !!user?.businessRole;

    if (!user || !matches) {
      // One sentence for both cases: which it was is what an attacker
      // would like to learn, and the person's next step is the same.
      throw new UnauthorizedException(
        `No ${kind} account for that ${provider} address. Create one first, then you can sign in this way.`,
      );
    }
  }

  /**
   * Sign a STAFF member in with Google or Apple (founder 2026-09-05).
   *
   * WHY THIS EXISTS RATHER THAN REUSING googleLogin. That method is the
   * customer one, and it is right for customers: an unknown email becomes
   * a brand new CUSTOMER account and is handed a session immediately.
   * Pointed at the dashboard, those same two behaviours are a way in:
   * anyone whose Google address happened to match a staff member's would
   * receive an admin session, and it would arrive WITHOUT the second
   * factor that /auth/admin-login has demanded since 2 September. A
   * social button on an admin login is only ever as strong as the rules
   * behind it, and the rules have to be the admin ones.
   *
   * So, three refusals that the customer path does not make:
   *
   *   1. It NEVER creates an account. Signing in as staff is something
   *      you already are, not something a login can make you.
   *   2. The account must already hold the admin role.
   *   3. Suspension, lockout and TOTP are checked exactly as the password
   *      path checks them, and the temp-token shape is identical, so the
   *      dashboard's existing second-factor screen needs no special case.
   *
   * Every outcome lands on the same sign-in log as the password path, so
   * an attempt through this door is as visible as one through the other.
   */
  async adminSocialLogin(
    provider: 'google' | 'apple',
    idToken: string,
    ctx?: SignInContext,
  ) {
    let payload: { sub: string; email: string };
    try {
      if (provider === 'google') {
        const ticket = await this.googleClient.verifyIdToken({
          idToken,
          audience: this.cfg.get<string>('GOOGLE_CLIENT_ID'),
        });
        const p = ticket.getPayload();
        if (!p?.sub || !p?.email) throw new Error('Invalid payload');
        payload = { sub: p.sub, email: p.email };
      } else {
        const r = await appleSignin.verifyIdToken(idToken, {
          audience:         this.cfg.get<string>('APPLE_CLIENT_ID'),
          ignoreExpiration: false,
        });
        /**
         * Apple withholds the address on every sign-in after the first,
         * which is fine for a customer we can find by appleId but useless
         * here: staff are matched by their real work address, never by a
         * relay we have not seen before.
         */
        if (!r?.sub || !r?.email) throw new Error('Invalid payload');
        payload = { sub: r.sub, email: r.email };
      }
    } catch {
      this.recordAdminSignIn({ email: '', outcome: `bad_${provider}_token`, ctx });
      throw new UnauthorizedException(`Invalid ${provider === 'google' ? 'Google' : 'Apple'} token.`);
    }

    const email = AuthService.canonicalEmail(payload.email);
    const user  = await this.usersRepo.findOne({ where: { email } });

    if (!user || user.role !== UserRole.ADMIN) {
      this.recordAdminSignIn({
        email, outcome: user ? 'not_admin' : 'no_account',
        userId: user?.id ?? null, name: user?.name ?? null, ctx,
      });
      // Deliberately the same sentence either way: which of the two it
      // was is exactly what an attacker would like to learn.
      throw new UnauthorizedException('That account cannot sign in here.');
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

    // Remember the provider id, so a later sign-in matches on it as well
    // as the address. Never sets emailVerified: this proves the provider
    // trusts the address, not that we asked its owner anything.
    const idField = provider === 'google' ? 'googleId' : 'appleId';
    if (!(user as any)[idField]) {
      await this.usersRepo.update(user.id, { [idField]: payload.sub } as any);
    }

    if ((user as any).totpEnabled) {
      this.recordAdminSignIn({
        userId: user.id, email, name: user.name,
        adminRole: (user as any).adminRole, outcome: 'totp_required', ctx,
      });
      const tempToken = await this.jwtService.signAsync(
        { sub: user.id, scope: 'totp_pending' },
        { expiresIn: '5m' },
      );
      return { requiresTOTP: true, tempToken };
    }

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

    /*
     * Five wrong guesses burn the code.
     *
     * Without this the only limit was the route throttle, which counts per
     * IP address, and a six digit code is a million guesses: cheap for
     * anyone with a handful of addresses. Burning the code rather than
     * locking the account keeps the cost on the attacker, since the owner
     * can simply request another one.
     */
    const MAX_OTP_ATTEMPTS = 5;
    if ((user.emailOtpAttempts ?? 0) >= MAX_OTP_ATTEMPTS) {
      await this.usersRepo.update(user.id, {
        emailVerificationOtp: null, emailVerificationExpiry: null, emailOtpAttempts: 0,
      } as any);
      throw new BadRequestException('Too many incorrect codes. Request a new one.');
    }

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

  /**
   * Finish a sign-in that stopped for a second factor.
   *
   * A wrong code is logged as totp_failed, which is the row that shows
   * somebody with a stolen password failing at the last step.
   */
  async adminTotpVerify(tempToken: string, code: string, ctx?: SignInContext) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(tempToken);
    } catch {
      throw new UnauthorizedException('That sign-in expired. Start again.');
    }
    if (payload?.scope !== 'totp_pending' || !payload?.sub) {
      throw new UnauthorizedException('That sign-in expired. Start again.');
    }

    const user = await this.usersRepo.createQueryBuilder('u')
      .addSelect('u.totpSecret')
      .where('u.id = :id', { id: payload.sub })
      .getOne();
    if (!user || !(user as any).totpSecret) {
      throw new UnauthorizedException('Two-factor is not set up on this account.');
    }

    const ok = verifySync({
      secret: (user as any).totpSecret,
      token:  String(code ?? '').trim(),
    })?.valid === true;
    if (!ok) {
      this.recordAdminSignIn({
        userId: user.id, email: user.email, name: user.name,
        adminRole: (user as any).adminRole, outcome: 'totp_failed', ctx,
      });
      throw new UnauthorizedException('That code is not right. Check the app and try again.');
    }

    this.noteSignInSuccess(user.id, ctx);
    this.recordAdminSignIn({
      userId: user.id, email: user.email, name: user.name,
      adminRole: (user as any).adminRole, outcome: 'success', ctx,
    });
    return this.buildAuthResponse(user);
  }

  /**
   * Begin enrolment. Returns a secret and the otpauth:// URI a phone scans.
   *
   * NOT enabled by this call. The secret is stored but totpEnabled stays
   * false until they prove they can produce a code, so nobody can lock
   * themselves out by scanning a QR badly and closing the tab.
   */
  async adminTotpSetup(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user || user.role !== UserRole.ADMIN) throw new UnauthorizedException('Staff only.');
    const secret = generateSecret();
    await this.usersRepo.update(userId, { totpSecret: secret, totpEnabled: false } as any);
    return {
      secret,
      otpauth: generateURI({ issuer: 'SEIRS Admin', label: user.email, secret }),
      message: 'Scan this in your authenticator app, then enter a code to switch it on.',
    };
  }

  /** Prove a code works, then switch it on. */
  async adminTotpEnable(userId: string, code: string) {
    const user = await this.usersRepo.createQueryBuilder('u')
      .addSelect('u.totpSecret').where('u.id = :id', { id: userId }).getOne();
    if (!user || !(user as any).totpSecret) {
      throw new BadRequestException('Start the setup first.');
    }
    if (verifySync({ secret: (user as any).totpSecret, token: String(code ?? '').trim() })?.valid !== true) {
      throw new BadRequestException('That code is not right. Try the next one your app shows.');
    }
    await this.usersRepo.update(userId, { totpEnabled: true } as any);
    return { enabled: true };
  }

  /**
   * Switch it off. Requires a current code, not just a session: a stolen
   * session must not be able to remove the thing protecting the account.
   */
  async adminTotpDisable(userId: string, code: string) {
    const user = await this.usersRepo.createQueryBuilder('u')
      .addSelect('u.totpSecret').where('u.id = :id', { id: userId }).getOne();
    if (!user || !(user as any).totpSecret) return { enabled: false };
    if (verifySync({ secret: (user as any).totpSecret, token: String(code ?? '').trim() })?.valid !== true) {
      throw new BadRequestException('Enter a current code to switch two-factor off.');
    }
    await this.usersRepo.update(userId, { totpSecret: null, totpEnabled: false } as any);
    return { enabled: false };
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
