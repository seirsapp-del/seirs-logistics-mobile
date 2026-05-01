import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import * as appleSignin from 'apple-signin-auth';
import { User, UserRole } from '../users/user.entity';
import { Driver } from '../drivers/driver.entity';
import { BusinessAccount, BusinessTeamMember } from '../business/business-account.entity';
import { PartnerStore } from '../business/partner-store.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    @InjectRepository(User)             private usersRepo:   Repository<User>,
    @InjectRepository(Driver)           private driversRepo: Repository<Driver>,
    @InjectRepository(BusinessAccount)  private bizRepo:     Repository<BusinessAccount>,
    @InjectRepository(PartnerStore)     private storeRepo:   Repository<PartnerStore>,
    private jwtService:  JwtService,
    private mailService: MailService,
    private cfg:         ConfigService,
  ) {
    this.googleClient = new OAuth2Client(cfg.get<string>('GOOGLE_CLIENT_ID'));
  }

  private static readonly PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\d\W]).{8,}$/;

  private static toTitleCase(str: string): string {
    return str.trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private static generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private static generateAccountId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = 'CUST-';
    for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) {
      if (!existing.emailVerified) {
        // Re-send OTP for unverified accounts rather than blocking
        await this.issueOtp(existing);
        return { message: 'Verification email re-sent. Please check your inbox.', requiresOtp: true };
      }
      throw new ConflictException('Email already registered.');
    }

    if (dto.role === UserRole.DRIVER && !dto.vehicleType) {
      throw new BadRequestException('Vehicle type is required for driver registration.');
    }

    if (!AuthService.PASSWORD_REGEX.test(dto.password)) {
      throw new BadRequestException(
        'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number or symbol.',
      );
    }

    const hashed    = await bcrypt.hash(dto.password, 12);
    const accountId = AuthService.generateAccountId();

    const user = this.usersRepo.create({
      name:      AuthService.toTitleCase(dto.name),
      email,
      phone:     dto.phone.trim(),
      password:  hashed,
      role:      dto.role,
      accountId,
      emailVerified: false,
    });
    await this.usersRepo.save(user);

    if (dto.role === UserRole.DRIVER) {
      const driver = this.driversRepo.create({ user, vehicleType: dto.vehicleType });
      await this.driversRepo.save(driver);
    }

    await this.issueOtp(user);

    return { message: 'Account created. Please verify your email.', requiresOtp: true };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const email = dto.email.trim().toLowerCase();

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
    const normalised = email.trim().toLowerCase();

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

  async login(dto: LoginDto) {
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .addSelect('u.failedLoginAttempts')
      .addSelect('u.lockedUntil')
      .where('LOWER(u.email) = LOWER(:email)', { email: dto.email.trim() })
      .getOne();

    if (!user) throw new UnauthorizedException('Invalid email or password.');
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

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const update: Partial<typeof user> = { failedLoginAttempts: attempts };
      if (attempts >= AuthService.MAX_ATTEMPTS) {
        update.lockedUntil = new Date(Date.now() + AuthService.LOCKOUT_MS);
      }
      await this.usersRepo.update(user.id, update as any);
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.usersRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });
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

    const email = payload.email.toLowerCase();

    let user = await this.usersRepo.findOne({ where: [{ googleId: payload.sub }, { email }] });

    if (!user) {
      const accountId = AuthService.generateAccountId();
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
      const email     = payload.email.toLowerCase();
      const existing  = await this.usersRepo.findOne({ where: { email } });
      const accountId = AuthService.generateAccountId();

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
      where: { email: ILike(email.trim()) },
    });

    if (!user) return { message: 'If that email exists, a reset link has been sent.' };

    const token  = uuidv4();
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    await this.usersRepo.update(user.id, {
      passwordResetToken:  token,
      passwordResetExpiry: expiry,
    });

    await this.mailService.sendPasswordReset(user.email, user.name, token);

    return { message: 'If that email exists, a reset link has been sent.' };
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

    const hashed = await bcrypt.hash(newPassword, 12);

    await this.usersRepo.update(user.id, {
      password:            hashed,
      passwordResetToken:  null,
      passwordResetExpiry: null,
    });

    return { message: 'Password reset successful. You can now log in.' };
  }

  private async issueOtp(user: User) {
    const otp    = AuthService.generateOtp();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);
    const hashed = await bcrypt.hash(otp, 8);

    await this.usersRepo.update(user.id, {
      emailVerificationOtp:    hashed,
      emailVerificationExpiry: expiry,
    });

    await this.mailService.sendEmailVerification(user.email, user.name, otp);
  }

  // ── Business / Partner Auth ────────────────────────────────────────────────

  async businessRegister(data: any) {
    const email = data.email?.trim().toLowerCase();
    if (!email) throw new BadRequestException('Email is required.');

    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing && existing.emailVerified) {
      throw new ConflictException('Email already registered.');
    }
    if (existing && !existing.emailVerified) {
      await this.issueOtp(existing);
      return { requiresOtp: true, email, message: 'Verification code re-sent.' };
    }

    const hashed    = await bcrypt.hash(data.password, 12);
    const accountId = 'BIZ-' + uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();

    const user = this.usersRepo.create({
      name:          data.name?.trim(),
      email,
      phone:         data.phone?.trim() ?? '',
      password:      hashed,
      role:          UserRole.CUSTOMER,
      businessRole:  data.accountType === 'partner' ? 'partner' : 'sender',
      accountId,
      emailVerified: false,
    });
    await this.usersRepo.save(user);

    if (data.accountType === 'partner') {
      const store = this.storeRepo.create({
        userId:       user.id,
        storeName:    data.storeName ?? data.name,
        storeAddress: data.storeAddress ?? '',
        maxCapacity:  data.capacity ?? 50,
      });
      await this.storeRepo.save(store);
      await this.usersRepo.update(user.id, { partnerStoreId: store.id });
    } else {
      const biz = this.bizRepo.create({
        ownerId:         user.id,
        companyName:     data.companyName ?? data.name,
        rcNumber:        data.rcNumber ?? '',
        businessAddress: data.businessAddress ?? '',
        walletBalance:   0,
        loyaltyPoints:   0,
      });
      await this.bizRepo.save(biz);
      await this.usersRepo.update(user.id, { businessAccountId: biz.id });
    }

    await this.issueOtp(user);

    return { requiresOtp: true, email, message: 'Account created. Please verify your email.' };
  }

  async adminLogin(email: string, password: string) {
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .addSelect('u.failedLoginAttempts')
      .addSelect('u.lockedUntil')
      .where('LOWER(u.email) = LOWER(:email)', { email: email.trim() })
      .getOne();

    if (!user || user.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (!user.isActive) throw new UnauthorizedException('Account suspended. Contact support.');

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
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.usersRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });
    return this.buildAuthResponse(user);
  }

  async businessLogin(email: string, password: string) {
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .addSelect('u.failedLoginAttempts')
      .addSelect('u.lockedUntil')
      .where('LOWER(u.email) = LOWER(:email)', { email: email.trim() })
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
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.usersRepo.update(user.id, { failedLoginAttempts: 0, lockedUntil: null });
    return this.buildAuthResponse(user);
  }

  async businessVerifyOtp(email: string, otp: string) {
    const normalised = email.trim().toLowerCase();

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

  private buildAuthResponse(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role, adminRole: user.adminRole };
    const token   = this.jwtService.sign(payload);

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
        businessRole: user.businessRole ?? null,
        businessAccountId: user.businessAccountId ?? null,
        partnerStoreId:    user.partnerStoreId ?? null,
      },
    };
  }
}
