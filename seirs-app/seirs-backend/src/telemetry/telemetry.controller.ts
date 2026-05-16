import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Sentry } from '../common/instrument';

class ReportErrorDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  stack?: string;

  @IsIn(['customer', 'driver', 'business', 'website', 'unknown'])
  app!: 'customer' | 'driver' | 'business' | 'website' | 'unknown';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  userId?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

// Client-side error sink. Mobile apps + static-export web POST here when
// an unhandled exception or React error boundary fires. We forward to
// Sentry server-side so the client doesn't need a native Sentry SDK or
// know the DSN.
@Controller('_telemetry')
export class TelemetryController {
  @Post('error')
  @HttpCode(204)
  reportError(@Body() dto: ReportErrorDto): void {
    Sentry.withScope((scope) => {
      scope.setTag('app', dto.app);
      if (dto.appVersion) scope.setTag('app_version', dto.appVersion);
      if (dto.platform) scope.setTag('platform', dto.platform);
      if (dto.userId) scope.setUser({ id: dto.userId });
      if (dto.context) scope.setContext('client_context', dto.context);

      const err = new Error(dto.message);
      if (dto.stack) err.stack = dto.stack;
      Sentry.captureException(err);
    });
  }
}
