'use client';
import { useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { getUser } from '@/lib/auth';

/**
 * Turn on a second factor for this staff account.
 *
 * WHY it did not exist. The login screen has handled `requiresTOTP` and
 * called /auth/admin-totp-verify since the dashboard was built. Neither the
 * route nor the check existed, so a correct password alone has always been a
 * full admin session and the client-side flow was dead code against a server
 * that said yes. Built 2 September 2026 with the backend half.
 *
 * Enrolment is deliberately two steps. Scanning stores the secret and leaves
 * two-factor OFF; it only switches on once they have typed a code the server
 * accepts. Otherwise somebody scans badly, closes the tab, and is locked out
 * of the dashboard by the feature meant to protect it.
 *
 * Switching it off also needs a current code. A stolen session must not be
 * able to remove the thing standing in its way.
 *
 * No QR image library: the otpauth:// string is shown to copy, and most
 * authenticator apps take a typed key. Adding a QR renderer for this is a
 * dependency for a screen used once per staff member.
 */
export function TotpEnrolment() {
  const user = getUser();
  const [step,    setStep]    = useState<'idle' | 'scanning'>('idle');
  const [secret,  setSecret]  = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [code,    setCode]    = useState('');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean>(Boolean((user as any)?.totpEnabled));

  const start = async () => {
    setBusy(true); setError(null);
    try {
      const r = await adminApi.totp.setup();
      setSecret(r.secret); setOtpauth(r.otpauth); setStep('scanning');
    } catch (e: any) {
      setError(e?.message ?? 'Could not start setup.');
    } finally { setBusy(false); }
  };

  const finish = async () => {
    setBusy(true); setError(null);
    try {
      await adminApi.totp.enable(code.trim());
      setEnabled(true); setStep('idle'); setCode(''); setSecret(null);
    } catch (e: any) {
      setError(e?.message ?? 'That code was not accepted.');
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true); setError(null);
    try {
      await adminApi.totp.disable(code.trim());
      setEnabled(false); setCode('');
    } catch (e: any) {
      setError(e?.message ?? 'That code was not accepted.');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {enabled ? <ShieldCheck className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-[#0F2B4C]">Two-factor sign-in</h3>
          <p className="mt-0.5 text-sm text-[#5C6E82]">
            {enabled
              ? 'On. You are asked for a code from your authenticator app every time you sign in.'
              : 'Off. Your password alone opens this dashboard, including everything it can do with money and people.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      {!enabled && step === 'idle' && (
        <button type="button" onClick={start} disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0F2B4C] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Turn it on
        </button>
      )}

      {!enabled && step === 'scanning' && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-[#5C6E82]">
            Add this to Google Authenticator, Authy or 1Password, then type the six digits it shows.
          </p>
          <div className="rounded-lg border border-[#E5E7EB] bg-[#F5F5F0] p-3">
            <p className="text-[11px] uppercase tracking-wide text-[#0F2B4C]/40">Setup key</p>
            <p className="mt-1 select-all break-all font-mono text-sm text-[#0F2B4C]">{secret}</p>
            {otpauth && (
              <p className="mt-2 select-all break-all font-mono text-[11px] text-[#5C6E82]">{otpauth}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="000000" inputMode="numeric" maxLength={8}
              className="w-32 rounded-lg border border-[#E5E7EB] px-3 py-2 text-center font-mono tracking-widest"
            />
            <button type="button" onClick={finish} disabled={busy || code.trim().length < 6}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F7A57] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Switch it on
            </button>
            <button type="button" onClick={() => { setStep('idle'); setCode(''); setError(null); }}
              className="px-3 py-2 text-sm text-[#5C6E82] hover:underline">
              Cancel
            </button>
          </div>
          <p className="text-xs text-[#5C6E82]">
            Nothing changes until that code is accepted, so a bad scan cannot lock you out.
          </p>
        </div>
      )}

      {enabled && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="000000" inputMode="numeric" maxLength={8}
            className="w-32 rounded-lg border border-[#E5E7EB] px-3 py-2 text-center font-mono tracking-widest"
          />
          <button type="button" onClick={turnOff} disabled={busy || code.trim().length < 6}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Turn it off
          </button>
          <span className="text-xs text-[#5C6E82]">
            A current code is required, so a stolen session cannot remove it.
          </span>
        </div>
      )}
    </div>
  );
}
