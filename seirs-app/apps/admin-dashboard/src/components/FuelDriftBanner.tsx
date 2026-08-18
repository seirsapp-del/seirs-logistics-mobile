'use client';
/**
 * Warns when the pump price has left the rate card behind.
 *
 * Fuel is reimbursed from the Fee Catalogue, so drivers are paid the
 * real price the moment it is corrected there. The rate card is a
 * separate thing: it still carries the fuel assumption that its
 * CUSTOMER-facing rates were built on, and it is republished rarely.
 * When the two diverge far enough, customers are being quoted off stale
 * assumptions even though drivers are being paid correctly.
 *
 * This went unnoticed until a review found the card assuming NGN 950
 * petrol against a real pump price near NGN 1,380, which had every
 * driver silently subsidising their own fuel (2026-08-18). Nobody should
 * have to go looking for that again.
 */
import { useEffect, useState } from 'react';
import { Fuel, X } from 'lucide-react';
import { adminApi } from '@/lib/api';

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
          {naira(worst.card)}. Drivers are already reimbursed at the real price, but customer
          rates are still priced off the old one. Republish the rate card to bring them back
          in line.
        </p>
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
