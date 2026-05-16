// Lightweight client-side error reporter. Each Expo app configures it
// once in its root _layout.tsx, then unhandled errors + React error
// boundaries POST to the backend's /_telemetry/error endpoint, which
// forwards to Sentry server-side. Avoids @sentry/react-native which
// pulls native modules and forces an EAS rebuild.

import { Platform } from 'react-native';

type AppName = 'customer' | 'driver' | 'business' | 'unknown';

interface ReporterConfig {
  baseUrl: string;
  app: AppName;
  appVersion?: string;
  getUserId?: () => string | null | undefined;
}

let _config: ReporterConfig | null = null;
let _installed = false;

export function configureErrorReporter(config: ReporterConfig): void {
  _config = config;
}

export function setReporterUserIdGetter(fn: () => string | null | undefined): void {
  if (_config) _config.getUserId = fn;
}

interface ReportOptions {
  context?: Record<string, unknown>;
  fatal?: boolean;
}

export async function reportError(error: unknown, opts: ReportOptions = {}): Promise<void> {
  if (!_config) return;

  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : JSON.stringify(error));

  const payload = {
    message: err.message?.slice(0, 2000) ?? 'Unknown error',
    stack: err.stack?.slice(0, 10000),
    app: _config.app,
    appVersion: _config.appVersion,
    platform: Platform.OS,
    userId: _config.getUserId?.() ?? undefined,
    context: { ...(opts.context ?? {}), fatal: !!opts.fatal },
  };

  try {
    await fetch(`${_config.baseUrl}/_telemetry/error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Swallow — never let the reporter itself crash the app.
  }
}

// Install a global handler that catches uncaught JS errors + unhandled
// promise rejections. Safe to call from app entry; no-op on second call.
export function installGlobalErrorHandler(): void {
  if (_installed) return;
  _installed = true;

  // React Native's ErrorUtils — the original handler still fires (red
  // box in dev, app crash in production); we just piggyback to report.
  const ErrorUtils: any = (global as any).ErrorUtils;
  if (ErrorUtils?.setGlobalHandler) {
    const prev = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((err: any, isFatal?: boolean) => {
      reportError(err, { fatal: !!isFatal });
      if (prev) prev(err, isFatal);
    });
  }

  // Unhandled promise rejections (web + RN's promise polyfill)
  const tracking: any = (global as any).HermesInternal?.enablePromiseRejectionTracker;
  if (typeof tracking === 'function') {
    tracking({
      allRejections: true,
      onUnhandled: (_id: number, err: unknown) => reportError(err, { context: { type: 'unhandled_rejection' } }),
    });
  }
}
