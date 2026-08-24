'use client';
/**
 * Warns when the pump price has left the rate card behind.
 *
 * The rate card is the single source of truth for fuel: it is what
 * drivers are reimbursed from and what customers are quoted. The Fee
 * Catalogue holds today's actual pump price purely as a reference, so
 * the two can be compared.
 *
 * A card is republished rarely and Nigerian pump prices are not rare.
 * A review found the card assuming NGN 950 petrol against a real price
 * near NGN 1,380, which had every driver silently subsidising their own
 * fuel: a truck driver on a 400km run was NGN 53,333 short (2026-08-18).
 *
 * Correcting it was always possible, by editing the pricing form and
 * publishing. It was never done, because that is friction. Hence the
 * button: one action, a proper new card version, a full audit trail.
 */
import { useEffect, useState } from 'react';
import { Fuel, X } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { isSuperAdminFromUser } from '@/lib/rbac';
import { getUser } from '@/lib/auth';

interface Drift {
  petrol: { card: number; live: number; driftPct: number };
  diesel: { card: number; live: number; driftPct: number };
  thresholdPct: number;
  stale: boolean;
}

const naira = (v: number) => `₦${Math.round(Number(v ?? 0)).toLocaleString()}`;

export default function FuelDriftBanner() {
  const [drift, setDrift]     = useState<Drift | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [done, setDone]       = useState<string | null>(null);

  // Publishing a rate card is a super-admin route. This banner renders on
  // the dashboard home and on /fees, both of which ops_manager and
  // finance_officer can open, so the button used to hand them a 403.
  // They still need to SEE the drift: it is the reason drivers are short.
  const canPublish = isSuperAdminFromUser(getUser());

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await adminApi.pricing.syncFuel();
      setDone(r.published
        ? `Published rate card version ${r.version}. Customer rates now match the pump.`
        : (r.message ?? 'Already up to date.'));
      adminApi.pricing.fuelDrift().then(setDrift).catch(() => {});
    } catch (e: any) {
      setDone(e?.message ?? 'Could not publish. Try the pricing page.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    adminApi.pricing.fuelDrift().then(setDrift).catch(() => setDrift(null));
  }, []);

  if (!drift || !drift.stale || dismissed) return null;

  const worst = Math.abs(drift.petrol.driftPct) >= Math.abs(drift.diesel.driftPct)
    ? { label: 'Petrol', ...drift.petrol }
    : { label: 'Diesel', ...drift.diesel };

  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <Fuel size={18} className="mt-0.5 shrink-0 text-amber-600" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-amber-900">
          The rate card&apos;s fuel assumption is {Math.abs(worst.driftPct)}% behind the pump
        </p>
        <p className="mt-0.5 text-amber-800/80">
          {worst.label} is {naira(worst.live)}/litre today; the active rate card was built on{' '}
          {naira(worst.card)}. Fuel is reimbursed from the card, so every driver is paying the
          difference out of their own pocket on every trip until it is republished.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          {canPublish ? (
            <button
              onClick={sync}
              disabled={syncing}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {syncing ? 'Publishing…' : 'Apply pump prices and publish'}
            </button>
          ) : (
            <span className="text-xs font-medium text-amber-900/70">
              Publishing a corrected rate card needs a Super Admin. Please flag this to one.
            </span>
          )}
          {done && <span className="text-xs font-medium text-amber-900">{done}</span>}
        </div>
        <p className="mt-1.5 text-xs text-amber-800/60">
          Petrol {naira(drift.petrol.live)} vs {naira(drift.petrol.card)} ({drift.petrol.driftPct > 0 ? '+' : ''}{drift.petrol.driftPct}%)
          {' · '}
          Diesel {naira(drift.diesel.live)} vs {naira(drift.diesel.card)} ({drift.diesel.driftPct > 0 ? '+' : ''}{drift.diesel.driftPct}%)
          {' · '}warns past {drift.thresholdPct}%
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss until next page load"
        className="shrink-0 rounded p-1 text-amber-700/60 hover:bg-amber-100 hover:text-amber-900"
      >
        <X size={15} />
      </button>
    </div>
  );
}
