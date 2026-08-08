'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { SeirsLockup } from '@/components/SeirsLogo';

// Segment-level error boundary. Catches thrown errors from any route under
// the app tree without escaping to global-error (which strips theme + nav).
// global-error.tsx stays as the last resort for root-layout crashes.
export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { Sentry.captureException(error); }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center text-center">
        <SeirsLockup size={140} color="#0E2540" />
        <h1 className="mt-6 text-xl font-bold text-gray-900">Something broke on this page</h1>
        <p className="mt-2 text-sm text-gray-600">
          The team has been notified. You can retry, or head back to the dashboard.
        </p>
        {error?.digest && (
          <p className="mt-3 text-xs text-gray-400 font-mono">Ref: {error.digest}</p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-[#0E2540] text-white text-sm font-semibold hover:bg-[#0a1b30]"
          >
            Retry
          </button>
          <a
            href="/"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200"
          >
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
