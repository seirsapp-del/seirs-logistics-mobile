'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Catches anything that escapes per-segment error.tsx boundaries.
// Required for @sentry/nextjs to capture root-level React errors.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: 48,
          color: '#111',
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ color: '#666', marginBottom: 24, maxWidth: 480 }}>
          We've logged this and the team has been notified. Reload the page to try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#0d6efd',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
