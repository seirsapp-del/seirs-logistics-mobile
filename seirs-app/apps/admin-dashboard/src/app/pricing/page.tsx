'use client';
/**
 * Pricing: one page, two books (founder, 2026-08-28).
 *
 * "the price engine and the fee cataloug need to be in a single page and
 * well organised", after an audit showed the two screens overlap, that
 * where they overlap the winner is not obvious, and that he could not
 * remember which held what. Splitting money across two menu entries was
 * the root cause of every question he asked about it.
 *
 * THE ONE THING THIS PAGE MUST NOT BLUR. The two halves save in opposite
 * ways and both are correct:
 *
 *   The rate card is a DRAFT. Typing changes nothing until Publish new
 *   version, which writes an auditable version and takes about five
 *   minutes to reach the apps.
 *
 *   A fee row is LIVE. Saving one changes the platform immediately, one
 *   row at a time, with its own history.
 *
 * Merge them into one form and somebody edits a fee expecting to publish
 * it, or edits the card believing it is already live. So the two panels
 * stay visually distinct and each states its own rule at the top. The
 * merge is about finding things, not about pretending they are the same
 * kind of thing.
 *
 * The panels are the previous two pages, moved verbatim into named
 * components rather than rewritten. A 1,600 line rewrite of the two
 * screens that set every price SEIRS charges, four days before the
 * pitch, is not a thing to do for tidiness.
 */
import { useEffect, useState } from 'react';
import { Tag, DollarSign, Compass } from 'lucide-react';
import { RateCardPanel } from './RateCardPanel';
import { FeeCataloguePanel } from '../fees/FeeCataloguePanel';
import { canAccessFromUser } from '@/lib/rbac';
import { getUser } from '@/lib/auth';

/**
 * The index the founder actually needed: money grouped by WHAT IT IS,
 * with the book that holds it named. Answers "where do I change X"
 * without him having to remember which of the two screens owns it.
 */
const WHERE_THINGS_LIVE: Array<{ topic: string; card?: string; fees?: string }> = [
  { topic: 'Fuel the rates are built on',   card: 'Fuel prices' },
  { topic: "Today's pump price",            fees: 'current_petrol_price_ngn, current_diesel_price_ngn' },
  { topic: 'Per-vehicle base and per-km',   card: 'Per-vehicle rates' },
  { topic: 'Weight, stops and waiting',     card: 'Weight tiers, Multi-stop and dwell, Cultural buffers' },
  { topic: 'Night and peak',                card: 'Time surcharges' },
  { topic: 'Interstate and long-haul',      card: 'Zone surcharges' },
  { topic: 'Pricing by area',               card: 'Set on the Zones page' },
  { topic: 'Discounts and loyalty',         card: 'Discounts' },
  { topic: 'Service fee on every booking',  card: 'Service fee' },
  { topic: 'High-value premium',            card: 'High-value premium', fees: 'high_value_threshold_ngn gates the signature' },
  { topic: 'Cancellation, waiting, returns', card: 'Cancellation / wait / return', fees: 'cancel_processing_pct, return_to_sender_fee, storage_*' },
  { topic: 'Partner stores and counters',   fees: 'partner_store_handling_ngn, counter_fee_*' },
  // Corrected by the audit of 2026-08-28: a rider's pay comes from the
  // card's per-vehicle driver base and per-km, NOT from
  // platform_commission_pct, which now only settles legacy jobs.
  { topic: 'What a driver earns per job',    card: 'Per-vehicle rates, driver columns' },
  { topic: 'Driver caps, levels and holdbacks', fees: 'driver_level_*, driver_daily_cap_ngn, driver_new_holdback_pct' },
  { topic: 'Card processing and postal levy', fees: 'card_processing_pct, nipost_postal_fund_pct' },
  { topic: 'VAT',                           card: 'VAT' },
];

export default function PricingPage() {
  const [open, setOpen] = useState(false);
  /**
   * The fee catalogue keeps its own permission.
   *
   * This route is gated on `pricing` and the panel below it was gated on
   * `fees`. Merging the pages must not quietly widen who can read fee
   * rows, so the gate moves onto the panel. Both roles that hold either
   * permission today hold both, so nobody loses anything; this exists so
   * a future role granted only `pricing` still cannot see the catalogue.
   *
   * Read after mount rather than during render: the session lives in a
   * cookie the server does not have, and reading it while rendering
   * makes the first paint disagree with the second.
   */
  const [canFees, setCanFees] = useState(false);
  useEffect(() => { setCanFees(canAccessFromUser(getUser() as any, 'fees')); }, []);

  return (
    <div className="min-h-screen">
      <div className="px-6 pt-6">
        <h1 className="text-2xl font-bold text-[#0F2B4C]">Pricing</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#0F2B4C]/55">
          Every number that decides what a customer pays and what a driver earns. Two halves,
          because they change in different ways: the rate card is published as a version, and a
          fee row takes effect the moment you save it.
        </p>

        {/*
          The index, collapsed by default. It exists to answer "which of
          these two holds the thing I want", which was the founder's
          actual complaint, without adding noise for somebody who already
          knows.
        */}
        <button
          onClick={() => setOpen(v => !v)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#3A7BD5] hover:underline"
        >
          <Compass size={12} /> {open ? 'Hide' : 'Where do I change...?'}
        </button>

        {open && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F5F0] text-[10px] uppercase tracking-wide text-[#0F2B4C]/40">
                <tr>
                  <th className="px-4 py-2.5 text-left">To change</th>
                  <th className="px-4 py-2.5 text-left">Rate card, below</th>
                  <th className="px-4 py-2.5 text-left">Fee catalogue, further down</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F0]">
                {WHERE_THINGS_LIVE.map(r => (
                  <tr key={r.topic}>
                    <td className="px-4 py-2.5 font-medium text-[#0F2B4C]">{r.topic}</td>
                    <td className="px-4 py-2.5 text-xs text-[#0F2B4C]/60">{r.card ?? ''}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[#0F2B4C]/60">{r.fees ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Half one: the rate card ─────────────────────────────────── */}
      <section id="rate-card" className="mt-6">
        <div className="mx-6 flex items-center gap-2 border-b-2 border-[#0F2B4C] pb-2">
          <Tag size={15} className="text-[#0F2B4C]" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#0F2B4C]">
            The rate card
          </h2>
          <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            a draft until you publish
          </span>
        </div>
        <RateCardPanel />
      </section>

      {/* ── Half two: the fee catalogue ─────────────────────────────── */}
      {canFees && (
      <section id="fees" className="mt-10">
        <div className="mx-6 flex items-center gap-2 border-b-2 border-[#0F2B4C] pb-2">
          <DollarSign size={15} className="text-[#0F2B4C]" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#0F2B4C]">
            The fee catalogue
          </h2>
          <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
            each row goes live when saved
          </span>
        </div>
        <FeeCataloguePanel />
      </section>
      )}
    </div>
  );
}
