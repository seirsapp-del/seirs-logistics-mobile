import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from '../users/user.entity';
import { Driver } from '../drivers/driver.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)   private usersRepo:   Repository<User>,
    @InjectRepository(Driver) private driversRepo: Repository<Driver>,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  // Enforced password policy: 8+ chars, uppercase, lowercase, digit or symbol
  private static readonly PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\d\W]).{8,}$/;

  // "OLUWASEYE ISRAEL OYADEYI" → "Oluwaseye Israel Oyadeyi"
  private static toTitleCase(str: string): string {
    return str.trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered.');

    if (dto.role === UserRole.DRIVER && !dto.vehicleType) {
      throw new BadRequestException('Vehicle type is required for driver registration.');
    }

    if (!AuthService.PASSWORD_REGEX.test(dto.password)) {
      throw new BadRequestException(
        'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number or symbol.',
      );
    }

    const hashed = await bcrypt.hash(dto.password, 12);

    const user = this.usersRepo.create({
      name:     AuthService.toTitleCase(dto.name),
      email,
      phone:    dto.phone.trim(),
      password: hashed,
      role:     dto.role,
    });
    await this.usersRepo.save(user);

    if (dto.role === UserRole.DRIVER) {
      const driver = this.driversRepo.create({ user, vehicleType: dto.vehicleType });
      await this.driversRepo.save(driver);
    }

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findOne({
      where: { email: ILike(dto.email.trim()) },
      select: ['id', 'name', 'email', 'phone', 'role', 'password', 'isActive'],
    });

    if (!user) throw new UnauthorizedException('Invalid email or password.');
    if (!user.isActive) throw new UnauthorizedException('Account suspended. Contact support.');

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid email or password.');

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

    // Always return success to prevent email enumeration
    if (!user) return { message: 'If that email exists, a reset link has been sent.' };

    const token  = uuidv4();
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

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

  private buildAuthResponse(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      token,
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        phone: user.phone,
        role:  user.role,
      },
    };
  }
}
