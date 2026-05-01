import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Stricter limit: 10 login attempts per minute per IP before lockout
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('business-login')
  businessLogin(@Body() body: { email: string; password: string }) {
    return this.authService.businessLogin(body.email, body.password);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('admin-login')
  adminLogin(@Body() body: { email: string; password: string }) {
    return this.authService.adminLogin(body.email, body.password);
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('resend-otp')
  resendOtp(@Body('email') email: string) {
    return this.authService.resendOtp(email);
  }

  @Post('google')
  googleLogin(@Body() dto: SocialLoginDto) {
    return this.authService.googleLogin(dto);
  }

  @Post('apple')
  appleLogin(@Body() dto: SocialLoginDto) {
    return this.authService.appleLogin(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: User) {
    return this.authService.getMe(user.id);
  }

  @Post('forgot-password')
  forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('reset-password')
  resetPassword(
    @Body('token') token: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.authService.resetPassword(token, newPassword);
  }

  // ── Business / Partner Auth ────────────────────────────────────────────────

  @Post('business-register')
  businessRegister(@Body() body: any) {
    return this.authService.businessRegister(body);
  }

  @Post('business-verify-otp')
  businessVerifyOtp(@Body() body: { email: string; otp: string }) {
    return this.authService.businessVerifyOtp(body.email, body.otp);
  }
}
