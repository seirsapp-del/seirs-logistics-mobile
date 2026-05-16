'use client';

import { useEffect } from 'react';

// Lightweight Sentry init for the static-export marketing site. The
// dynamic import keeps @sentry/browser out of every page bundle until
// after first paint, so a missing DSN means zero runtime cost.
export default function SentryInit(): null {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;

    let cancelled = false;
    import('@sentry/browser')
      .then((Sentry) => {
        if (cancelled) return;
        Sentry.init({
          dsn,
          environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'production',
          release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
          tracesSampleRate: 0.05,
          beforeSend(event) {
            if (event.request?.headers) {
              delete (event.request.headers as Record<string, string>).authorization;
              delete (event.request.headers as Record<string, string>).cookie;
            }
            return event;
          },
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
