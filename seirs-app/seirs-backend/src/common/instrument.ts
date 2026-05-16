// Must be imported BEFORE any other module so Sentry can patch
// http/express/typeorm spans correctly. See main.ts line 1.
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? process.env.RAILWAY_GIT_COMMIT_SHA,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? '0.1'),
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip authorization headers + cookies in case they sneak through
      if (event.request?.headers) {
        delete (event.request.headers as Record<string, string>).authorization;
        delete (event.request.headers as Record<string, string>).cookie;
      }
      return event;
    },
  });
}

export { Sentry };
