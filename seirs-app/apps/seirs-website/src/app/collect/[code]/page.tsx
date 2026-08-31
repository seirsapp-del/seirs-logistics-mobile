'use client';

/**
 * Collection page for a package waiting at a SEIRS partner counter.
 *
 * This exists for the one person in the system with no account and no
 * app: the receiver. When a delivery fails because nobody was home, the
 * package goes to the nearest counter and the counter's location stays
 * masked until the fee is settled. Until this page existed the only way
 * to settle it was inside the customer app, as the sender, so a receiver
 * could read "settle the fee to reveal the pickup location" and have no
 * way to do it.
 *
 * The sender can still pay in the app on the receiver's behalf. This
 * page is the other half: send the receiver the link and they settle it
 * themselves, without SEIRS having to sit in the middle of a transfer
 * between two people who know each other.
 *
 * Same public GET /deliveries/track/:code the tracking page uses, plus
 * POST /deliveries/track/:code/collection-payment which needs no token.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { naira } from '@/lib/money';
import {
  Package, Store, Lock, CheckCircle2, XCircle, Loader2, ShieldCheck, Info,
} from 'lucide-react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'https://seirs-logistics-mobile-production.up.railway.app/api/v1';

interface TrackDTO {
  trackingCode:       string;
  status:             string;
  dropoffAddress:     string;
  redirectFeeOwedNgn: number | null;
  package?: { recipientFirstName: string | null } | null;
}

export default function CollectPage() {
  const { code }  = useParams<{ code: string }>();
  const params    = useSearchParams();
  const justPaid  = params.get('paid') === '1';

  const [delivery, setDelivery] = useState<TrackDTO | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const [email,    setEmail]    = useState('');
  const [name,     setName]     = useState('');
  const [phone,    setPhone]    = useState('');
  const [paying,   setPaying]   = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Encoded, same as track/[code]. This path segment comes straight
      // from the URL and was interpolated raw.
      const r = await fetch(`${API_BASE}/deliveries/track/${encodeURIComponent(code)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('We could not find a package with that code.');
      setDelivery(await r.json());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { void load(); }, [load]);

  // Coming back from the payment page, the unmask can lag the redirect by
  // a second or two while the webhook lands. One retry covers it without
  // making the page feel like it is polling.
  useEffect(() => {
    if (!justPaid) return;
    const t = setTimeout(() => { void load(); }, 2500);
    return () => clearTimeout(t);
  }, [justPaid, load]);

  const pay = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const r = await fetch(`${API_BASE}/deliveries/track/${encodeURIComponent(code)}/collection-payment`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, name, phone }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.message ?? 'We could not start that payment.');
      if (!body?.authorizationUrl) throw new Error('We could not start that payment.');
      window.location.href = body.authorizationUrl;
    } catch (e: unknown) {
      setPayError(e instanceof Error ? e.message : 'Something went wrong.');
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl bg-white p-12 text-center text-slate-500 shadow-sm">
          <Loader2 size={28} className="mx-auto mb-3 animate-spin text-slate-400" />
          Checking that code...
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
          <XCircle size={40} className="mx-auto mb-3 text-red-500" />
          <div className="mb-1 text-lg font-bold text-slate-900">Package not found</div>
          <div className="mb-3 text-sm text-slate-600">
            We have nothing under{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{code}</code>.
          </div>
          <div className="text-xs text-slate-400">{error}</div>
          <Link
            href="/track"
            className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Track a package instead
          </Link>
        </div>
      </div>
    );
  }

  const owed = Number(delivery.redirectFeeOwedNgn ?? 0);
  const settled = owed <= 0;

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 pb-4 pt-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Collect your package
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900">
            {delivery.trackingCode}
          </div>
          {delivery.package?.recipientFirstName && (
            <div className="mt-1 text-sm text-slate-600">
              For {delivery.package.recipientFirstName}
            </div>
          )}
        </div>

        {settled ? (
          <div className="px-5 py-6">
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <div className="font-semibold text-emerald-900">Nothing left to pay</div>
                <div className="mt-1 text-sm text-emerald-800">
                  Take your ID and this tracking code to the counter below.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <Store size={20} className="mt-0.5 shrink-0 text-slate-500" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Pick it up from
                </div>
                <div className="mt-1 font-medium text-slate-900">
                  {delivery.dropoffAddress}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 text-xs text-slate-500">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              <span>
                Counter staff never take payment for SEIRS. If anyone at the
                counter asks you for money, do not pay it: contact SEIRS support.
              </span>
            </div>
          </div>
        ) : (
          <div className="px-5 py-6">
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <Lock size={20} className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <div className="font-semibold text-amber-900">
                  {naira(owed)} to settle before collection
                </div>
                <div className="mt-1 text-sm text-amber-800">
                  Nobody was available when the driver arrived, so your package is
                  being kept safe at a SEIRS partner counter. Settle this and the
                  counter&apos;s address appears here straight away.
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Email for your receipt
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Your name
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Phone
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  />
                </label>
              </div>
            </div>

            {payError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {payError}
              </div>
            )}

            <button
              onClick={() => void pay()}
              disabled={paying || !email.trim()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {paying ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
              {paying ? 'Opening payment...' : `Pay ${naira(owed)}`}
            </button>

            <div className="mt-4 flex items-start gap-2 text-xs text-slate-500">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                The sender can also settle this from the SEIRS app if you would
                rather sort it out between yourselves.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-center text-xs text-slate-400">
        <Link href={`/track/${delivery.trackingCode}`} className="hover:text-slate-600">
          See the full delivery history
        </Link>
      </div>
    </div>
  );
}
