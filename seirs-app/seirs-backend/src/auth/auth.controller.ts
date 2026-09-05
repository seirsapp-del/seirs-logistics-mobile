import { Body, Controller, Get, Headers, Ip, Post, UseGuards } from '@nestjs/common';
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

  // Throttles below are per-IP per-minute. They were written when the
  // ThrottlerGuard was not registered, so none of them fired; the guard
  // is now global (see AppModule) and these are the real limits. The
  // unthrottled routes were the ones that mattered most: a 6-digit OTP
  // under the loose global default is a brute-force target, and the
  // resend and reset routes are free email cannons.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Stricter limit: 10 login attempts per minute per IP before lockout
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent?: string) {
    // The user-agent is the only thing distinguishing one sign-in from
    // another, so it has to reach the service for the new-device alert
    // to have anything to compare against.
    return this.authService.login(dto, { userAgent });
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('business-login')
  businessLogin(
    @Body() body: { email: string; password: string },
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.businessLogin(body.email, body.password, { userAgent });
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('admin-login')
  adminLogin(
    @Body() body: { email: string; password: string },
    @Headers('user-agent') userAgent?: string,
    // Recorded on the sign-in log so an attempt can be placed. Without it
    // the log answers "who" and never "from where", which is half a log.
    @Ip() ip?: string,
  ) {
    return this.authService.adminLogin(body.email, body.password, { userAgent, ip });
  }

  /**
   * POST /api/v1/auth/admin-google  and  /auth/admin-apple
   *
   * The dashboard's social buttons. Deliberately NOT /auth/google: that
   * one creates a customer account for an unknown address and issues a
   * session with no second factor, which on an admin login would be a
   * way around the TOTP the password path demands. See adminSocialLogin
   * for the three refusals it makes instead.
   *
   * Throttled like admin-login, and for the same reason: a social token
   * is still something an attacker can try repeatedly.
   */
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('admin-google')
  adminGoogleLogin(
    @Body() body: { idToken: string },
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ) {
    return this.authService.adminSocialLogin('google', body?.idToken ?? '', { userAgent, ip });
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('admin-apple')
  adminAppleLogin(
    @Body() body: { idToken: string },
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ) {
    return this.authService.adminSocialLogin('apple', body?.idToken ?? '', { userAgent, ip });
  }

  /**
   * Finish an admin sign-in that stopped for a second factor.
   *
   * The dashboard has called this route since it was built. It did not
   * exist, so a correct password alone was always a full admin session.
   */
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('admin-totp-verify')
  adminTotpVerify(
    @Body() body: { tempToken: string; code: string },
    @Headers('user-agent') userAgent?: string,
    @Ip() ip?: string,
  ) {
    return this.authService.adminTotpVerify(body.tempToken, body.code, { userAgent, ip });
  }

  // Enrolment. Setup returns the QR; enable requires a working code, so
  // nobody can lock themselves out by scanning badly and closing the tab.
  @UseGuards(JwtAuthGuard)
  @Post('admin-totp-setup')
  adminTotpSetup(@CurrentUser() user: any) {
    return this.authService.adminTotpSetup(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin-totp-enable')
  adminTotpEnable(@CurrentUser() user: any, @Body() body: { code: string }) {
    return this.authService.adminTotpEnable(user.id, body?.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin-totp-disable')
  adminTotpDisable(@CurrentUser() user: any, @Body() body: { code: string }) {
    return this.authService.adminTotpDisable(user.id, body?.code);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('resend-otp')
  resendOtp(@Body('email') email: string) {
    return this.authService.resendOtp(email);
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('google')
  googleLogin(@Body() dto: SocialLoginDto) {
    return this.authService.googleLogin(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('apple')
  appleLogin(@Body() dto: SocialLoginDto) {
    return this.authService.appleLogin(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: User) {
    return this.authService.getMe(user.id);
  }

  // Spec V8 §3.6 - sliding-window admin session. Admin tokens issue
  // with a 30-minute TTL; this endpoint extends the window when the
  // admin is actively using the dashboard. Non-admin callers get the
  // platform default (7d) so it's effectively a no-op for them.
  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  refresh(@CurrentUser() user: User) {
    return this.authService.refreshToken(user.id);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('forgot-password')
  forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  // The reset token is the only thing standing between a caller and
  // somebody else's account, so guessing attempts are capped hard.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('reset-password')
  resetPassword(
    @Body('token') token: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.authService.resetPassword(token, newPassword);
  }

  // POST /api/v1/auth/change-password
  // Logged-in password change - requires current password as proof.
  // Different from forgot/reset which goes through email link.
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: User,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(user.id, body.currentPassword, body.newPassword);
  }

  // ── Business / Partner Auth ────────────────────────────────────────────────

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('business-register')
  businessRegister(@Body() body: any) {
    return this.authService.businessRegister(body);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('business-verify-otp')
  businessVerifyOtp(@Body() body: { email: string; otp: string }) {
    return this.authService.businessVerifyOtp(body.email, body.otp);
  }
}
