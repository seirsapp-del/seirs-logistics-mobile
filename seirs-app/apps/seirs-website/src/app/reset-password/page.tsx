'use client';

/**
 * Password-reset landing page (live test 2026-08-10).
 *
 * Reset emails used to deep-link straight to the app's custom scheme
 * (seirsdriver:// etc). Gmail and most mail clients refuse non-https
 * links, so the button did nothing. The email now points here: an
 * https page Gmail is happy with. The user resets their password right
 * on this page (same public POST /auth/reset-password the apps use),
 * then jumps back into their app to sign in.
 *
 * Query params: ?token=<reset token>&app=customer|driver|business
 */
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://seirs-logistics-mobile-production.up.railway.app/api/v1';

const APP_LABEL: Record<string, string> = {
  customer: 'SEIRS',
  driver:   'SEIRS Driver',
  business: 'SEIRS Business',
};
const APP_SCHEME: Record<string, string> = {
  customer: 'seirscustomer://',
  driver:   'seirsdriver://',
  business: 'seirsbusiness://',
};

// Mirrors shared/utils/password.ts (single policy across apps + backend).
function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(password)) return 'Add at least one lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Add at least one uppercase letter.';
  if (!/\d/.test(password))    return 'Add at least one number.';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return 'Add at least one symbol (e.g. ! @ # $ % &).';
  }
  return null;
}

function ResetForm() {
  const params = useSearchParams();
  const token  = params.get('token') ?? '';
  const app    = (params.get('app') ?? 'customer').toLowerCase();

  const appLabel  = APP_LABEL[app] ?? 'SEIRS';
  const appScheme = APP_SCHEME[app] ?? APP_SCHEME.customer;

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [show,     setShow]     = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState('');

  const missingToken = useMemo(() => token.trim().length === 0, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwErr = validatePassword(password);
    if (pwErr) { setError(pwErr); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setError('');
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? 'This link may have expired. Request a new one from the app.');
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (missingToken) {
    return (
      <CardShell>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">This link is incomplete</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            The reset link is missing its security token. Open the reset email again and tap the
            button, or request a fresh link from the {appLabel} app&apos;s sign-in screen.
          </p>
        </div>
      </CardShell>
    );
  }

  if (done) {
    return (
      <CardShell>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Password updated</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Your {appLabel} password has been changed. Open the app on your phone and sign in with
            the new password.
          </p>
          <a
            href={appScheme}
            className="mt-6 inline-block rounded-xl bg-[#0F2B4C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#1A3A63]"
          >
            Open {appLabel}
          </a>
          <p className="mt-3 text-xs text-slate-400">
            Button does nothing? Just open the app from your home screen.
          </p>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell>
      <h1 className="text-xl font-bold text-slate-900">Choose a new password</h1>
      <p className="mt-1 text-sm text-slate-500">
        For your {appLabel} account. At least 8 characters with uppercase, lowercase, a number, and
        a symbol.
      </p>

      {error !== '' && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            New password
          </span>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 focus-within:border-[#3A7BD5]">
            <Lock className="h-4 w-4 text-slate-400" />
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-transparent text-sm text-slate-900 outline-none"
              placeholder="New password"
            />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label="Toggle password visibility">
              {show ? <EyeOff className="h-4 w-4 text-slate-400" /> : <Eye className="h-4 w-4 text-slate-400" />}
            </button>
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Confirm password
          </span>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 focus-within:border-[#3A7BD5]">
            <Lock className="h-4 w-4 text-slate-400" />
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-transparent text-sm text-slate-900 outline-none"
              placeholder="Repeat new password"
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-xl bg-[#0F2B4C] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#1A3A63] disabled:opacity-50"
        >
          {busy ? 'Updating…' : 'Update Password'}
        </button>
      </form>

      <div className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#3A7BD5]" />
        <span>
          This link works once and expires 1 hour after it was requested. If you didn&apos;t ask to
          reset your password, you can safely ignore the email; your account stays untouched.
        </span>
      </div>
    </CardShell>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="bg-[#0F2B4C] px-4 py-5">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/seirs-logo-white.png" alt="SEIRS" className="h-9 w-9" />
          <span className="text-lg font-black tracking-[0.25em] text-white">SEIRS</span>
        </div>
      </div>
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-2xl bg-white p-8 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Need help? <Link href="/contact" className="text-[#3A7BD5] underline">Contact support</Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-100" />}>
      <ResetForm />
    </Suspense>
  );
}
