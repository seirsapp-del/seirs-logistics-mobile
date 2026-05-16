import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Sentry } from '../instrument';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Only send 5xx (server faults) + uncaught non-HTTP errors to Sentry.
    // 4xx are client errors — noisy and not actionable.
    const shouldReport =
      !(exception instanceof HttpException) || status >= 500;

    if (shouldReport) {
      Sentry.withScope((scope) => {
        scope.setTag('route', req.route?.path ?? req.url);
        scope.setTag('method', req.method);
        const userId = (req as any).user?.id;
        if (userId) scope.setUser({ id: String(userId) });
        Sentry.captureException(exception);
      });
      this.logger.error(
        `Unhandled ${req.method} ${req.url} → ${status}`,
        (exception as Error)?.stack,
      );
    }

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: status, message: 'Internal server error' };

    res.status(status).json(typeof body === 'string' ? { message: body } : body);
  }
}
