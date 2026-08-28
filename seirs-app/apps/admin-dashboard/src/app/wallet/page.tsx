'use client';

/**
 * Rider payouts: the money SEIRS owes the people who did the riding.
 *
 * One job: keep the rider earnings ledger honest. Three questions, in
 * the order somebody opens this page to ask them: what is frozen and
 * waiting on a decision from me, what is sitting ready for riders to
 * withdraw, and what has actually left the bank this month.
 *
 * Only riders and partner stores hold withdrawable earnings on SEIRS.
 * Customers never hold a naira balance, so nothing on this screen is a
 * customer balance and nothing on it should read as one.
 */
import { useEffect, useState } from 'react';
import {
  Clock, ArrowDownCircle, TrendingUp, AlertCircle, RefreshCw, Banknote, CheckCircle2,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { naira } from '@/lib/money';
import { useConfirm } from '@/components/ConfirmDialog';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import Link from 'next/link';

interface PendingPayout {
  id: string;
  driverId: string;
  driverName: string;
  /** What the job was worth to the customer, before the SEIRS cut. */
  grossAmount?: number;
  /** SEIRS's share of that job. */
  seirsCut?: number;
  driverNet: number;
  availableAt: string;
  deliveryId: string;
}

interface HeldEarning {
  id: string;
  driverId: string;
  driverName: string;
  driverNet: number;
  holdReason: string | null;
  updatedAt: string;
  deliveryId: string;
}

interface RecentWithdrawal {
  id: string;
  driverId: string;
  driverName: string;
  /** What the rider earned on the settled jobs. NOT what reached their bank. */
  driverNet: number;
  /** What actually left SEIRS. Differs from driverNet when a holdback applied. */
  sentNgn?: number;
  requestedNgn?: number;
  holdbackNgn?: number;
  paidAt: string;
  reference?: string;
  flutterwaveTransferId: string | null;
  deliveryId?: string;
  earningCount?: number;
  /** True for rows predating the payout ledger: the figure is earned, not sent. */
  estimated?: boolean;
}

interface Summary {
  pendingTotal: number; pendingCount: number;
  heldTotal: number;    heldCount: number;
  paidMtdTotal: number; paidMtdCount: number;
  /** True while the total is derived from earnings rather than the payout ledger. */
  paidMtdEstimated?: boolean;
}

/**
 * The server sends at most 50 rows per table and offers no page two, so
 * the screen has to say when it is standing on that ceiling. The summary
 * cards count every row in the ledger, which is how a table of 50 under
 * a card reading 137 was quietly under-reporting what SEIRS owes.
 */
const ROW_CAP = 50;

/**
 * A person named on a screen is a link to that person.
 *
 * Founder's standing rule (2026-08-27: "why can't i click on the driver
 * and it takes me to his profile"). A payouts table that names a rider
 * and makes you go and search for them separately is a table you use
 * once and then work around.
 *
 * driverId on the earnings ledger is the USER id, not the driver row
 * id, which is why this points at /users rather than /drivers.
 */
function DriverLink({ id, name }: { id: string; name: string }) {
  if (!id) return <span className="font-medium text-[#0F2B4C]">{name}</span>;
  return (
    <Link
      href={`/users/${id}`}
      className="font-medium text-[#0F2B4C] hover:text-[#3A7BD5] hover:underline"
    >
      {name}
    </Link>
  );
}

/**
 * The job the money came from. It was printed as eight characters of a
 * UUID with an ellipsis, which is unusable: an admin querying a payout
 * has to see the delivery to know whether it was even completed.
 */
function DeliveryLink({ id }: { id?: string | null }) {
  if (!id) return <span className="text-xs text-gray-400">-</span>;
  return (
    <Link
      href={`/deliveries/${id}`}
      className="font-mono text-xs text-[#3A7BD5] hover:underline"
      title="Open the delivery this money came from"
    >
      {id.slice(0, 8)}…
    </Link>
  );
}

/** "50 of 137 shown" beats a silent truncation on a page about money. */
function RowCount({ shown, total, noun }: { shown: number; total?: number; noun: string }) {
  const capped = shown >= ROW_CAP;
  return (
    <span className="ml-auto text-xs text-gray-500">
      {typeof total === 'number' && total > shown
        ? `Showing the first ${shown} of ${total.toLocaleString()} ${noun}`
        : `${shown} ${noun}`}
      {capped && typeof total !== 'number' && ' (the most this screen can show)'}
    </span>
  );
}

export default function WalletPage() {
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [pending,    setPending]    = useState<PendingPayout[]>([]);
  const [held,       setHeld]       = useState<HeldEarning[]>([]);
  const [paid,       setPaid]       = useState<RecentWithdrawal[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [busyId,     setBusyId]     = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  /**
   * Money owed to CUSTOMERS, which this page never showed.
   *
   * Everything else here is what SEIRS owes its riders. This is the
   * opposite: a payment still held against a delivery that was cancelled
   * or failed, which is a refund that was owed and never issued.
   */
  const [stuck,      setStuck]      = useState<Array<any>>([]);
  const confirm                     = useConfirm();

  // Every call used to swallow its own failure, so a 403 or a cold
  // Railway boot rendered as an all-zero money summary: indistinguishable
  // from a quiet day. Keep the partial data, but say what failed.
  const load = async () => {
    setLoading(true);
    setError(null);
    const failures: string[] = [];
    try {
      const [s, p, h, w, sr] = await Promise.all([
        adminApi.wallet.summary().catch(() => { failures.push('the totals'); return null; }),
        adminApi.wallet.pendingPayouts().catch(() => { failures.push('the ready-to-withdraw list'); return []; }),
        adminApi.wallet.heldEarnings().catch(() => { failures.push('the frozen earnings'); return []; }),
        adminApi.wallet.recentWithdrawals().catch(() => { failures.push('the transfers already sent'); return []; }),
        adminApi.wallet.stuckRefunds().catch(() => { failures.push('refunds owed to customers'); return []; }),
      ]);
      setSummary(s);
      setPending(p ?? []);
      setHeld(h ?? []);
      setPaid(w ?? []);
      setStuck(sr ?? []);
      if (failures.length) {
        setError(`Could not load ${failures.join(', ')}. The figures below are incomplete: do not reconcile against them until this loads cleanly.`);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const release = async (h: HeldEarning) => {
    /**
     * This is real money becoming withdrawable. The old wording said
     * "the driver's earning moves from held back to available" and named
     * neither the rider nor the amount, so an admin releasing the wrong
     * row had nothing on screen to catch it. There is also no re-freeze
     * button anywhere in this dashboard, so the screen has to admit that
     * before the press, not after.
     */
    const ok = await confirm({
      title:        `Release ${naira(h.driverNet)} to ${h.driverName}?`,
      message:      `${naira(h.driverNet)} stops being frozen and becomes withdrawable by ${h.driverName} straight away: they can request it to their bank from the rider app within minutes.\n\nThis dashboard has no button to freeze it again, so treat it as final. The reason it was frozen (${h.holdReason ?? 'no reason recorded'}) stays in the audit log under your name.`,
      confirmLabel: `Release ${naira(h.driverNet)}`,
    });
    if (!ok) return;
    setBusyId(h.id);
    setError(null);
    try {
      await adminApi.wallet.releaseHeld(h.id);
      await load();
    } catch (e: any) {
      // A browser alert can be suppressed outright after the first one,
      // which on a money screen looks like the release silently worked.
      setError(`Nothing was released. ${e?.message ?? 'The server refused the request.'} The earning is still frozen.`);
    } finally { setBusyId(null); }
  };


  const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-NG', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="p-6 space-y-6">
      {/*
        The heading was "Wallet & Payouts", which invites the reading
        that somebody holds a wallet here. Nobody does: this is the
        rider earnings ledger, customers never hold naira with SEIRS,
        and the only balances on this page belong to riders.
      */}
      <PageIntro
        title="Rider payouts"
        purpose="The money SEIRS owes its riders: what is frozen pending your decision, what is ready for them to withdraw, and what has already reached their banks."
        storageKey="wallet"
        help={
          <>
            <p><b>Frozen</b> earnings are the only ones needing you. Somebody put a hold on them (fraud check, dispute, wrong rider paid) and the rider cannot touch that money until it is released.</p>
            <p><b>Release</b> makes that exact amount withdrawable to that rider immediately. There is no freeze button on this dashboard, so it is effectively final: check the reason and the delivery first.</p>
            <p><b>Ready to withdraw</b> is a watch list, not a to-do list. Riders request their own payouts from the rider app. Nothing here sends money.</p>
            <p><b>Sent to bank</b> is what actually left SEIRS through Flutterwave. When a rider is new, part of a payout is held back, so what was sent is smaller than what was earned. That is why the two columns differ.</p>
          </>
        }
        actions={
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => load()} className="shrink-0 font-semibold underline hover:no-underline">Try again</button>
        </div>
      )}

      {/*
        Above the rider figures on purpose. Everything else on this page
        is money SEIRS owes its own riders, which is normal business.
        This is money SEIRS is sitting on that belongs to a CUSTOMER
        whose delivery never happened, which is not. The endpoint has
        existed since the refund-honesty fix and no screen called it, so
        a refund owed and never issued could only be found by querying
        the database.
      */}
      {stuck.length > 0 ? (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-800">
            {stuck.length} customer{stuck.length === 1 ? '' : 's'} {stuck.length === 1 ? 'is' : 'are'} owed a refund that was never issued, totalling{' '}
            {naira(stuck.reduce((t: number, r: any) => t + Number(r.amountNgn ?? 0), 0))}
          </p>
          <p className="mt-1 text-xs text-red-700">
            Their delivery was cancelled or failed and SEIRS still holds the payment. This list
            should be empty. Each one needs the refund re-issued in Flutterwave against the
            reference shown.
          </p>
          <div className="mt-3 space-y-1.5">
            {stuck.map((r: any) => (
              <div key={r.paymentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white px-3 py-2 text-xs">
                <a href={`/deliveries/${r.deliveryId}`} className="font-mono font-bold text-[#3A7BD5] hover:underline">
                  {r.trackingCode}
                </a>
                <span className="font-semibold text-red-700">{naira(r.amountNgn)}</span>
                <a href={`/users/${r.customerId}`} className="text-[#0F2B4C] hover:underline">{r.customerName}</a>
                <span className="text-[#0F2B4C]/45">{r.deliveryStatus}</span>
                {r.providerReference && (
                  <span className="font-mono text-[#0F2B4C]/45">{r.providerReference}</span>
                )}
                <span className="ml-auto text-[#0F2B4C]/40">
                  {new Date(r.createdAt).toLocaleDateString('en-NG')}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : !loading && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="font-semibold">No customer is owed a refund.</span>{' '}
          Every payment on a cancelled or failed delivery has been returned.
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          label="Ready for riders to withdraw"
          sub={`${(summary?.pendingCount ?? 0).toLocaleString()} finished job${summary?.pendingCount === 1 ? '' : 's'} settled and waiting`}
          value={naira(summary?.pendingTotal ?? 0)}
          Icon={Clock}
          color="text-yellow-600"
        />
        <SummaryCard
          label="Frozen, waiting on a decision"
          sub={`${(summary?.heldCount ?? 0).toLocaleString()} earning${summary?.heldCount === 1 ? '' : 's'} a rider cannot touch`}
          value={naira(summary?.heldTotal ?? 0)}
          Icon={AlertCircle}
          color="text-red-600"
        />
        {/*
          Reads the payout ledger: money that actually left. While
          paidMtdEstimated is true the figure is summed from earnings
          instead, which is what riders earned on settled jobs and can
          exceed what was sent, so the card says so rather than quietly
          reporting a number the bank will not match.
        */}
        <SummaryCard
          label={summary?.paidMtdEstimated ? 'Earned this month (not confirmed sent)' : 'Sent to banks this month'}
          sub={summary?.paidMtdEstimated
            ? `${(summary?.paidMtdCount ?? 0).toLocaleString()} settled job${summary?.paidMtdCount === 1 ? '' : 's'}: check Flutterwave before reconciling`
            : `${(summary?.paidMtdCount ?? 0).toLocaleString()} transfer${summary?.paidMtdCount === 1 ? '' : 's'} since the 1st`}
          value={naira(summary?.paidMtdTotal ?? 0)}
          Icon={TrendingUp}
          color={summary?.paidMtdEstimated ? 'text-amber-600' : 'text-green-600'}
        />
      </div>

      {/* Frozen earnings: the only section on this page with a decision in it */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <AlertCircle size={15} className="text-red-500" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Frozen earnings: waiting on you</span>
          <RowCount shown={held.length} total={summary?.heldCount} noun="frozen" />
        </div>
        <div className="overflow-x-auto">
          {loading && held.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : held.length === 0 ? (
            /* An empty compliance queue is the best news of the day and
               should not read as a fault, which "No held earnings." in
               grey did. */
            <EmptyState
              icon={<CheckCircle2 size={20} />}
              tone="good"
              title="No rider's money is frozen"
              body="Nothing is being withheld from anybody. Frozen earnings show up here when a hold is placed during a fraud check or a dispute."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Rider</th>
                  <th className="text-left px-4 py-3">Frozen amount</th>
                  <th className="text-left px-4 py-3">Why it was frozen</th>
                  <th className="text-left px-4 py-3">Delivery</th>
                  <th className="text-left px-4 py-3">Frozen since</th>
                  <th className="text-left px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {held.map(h => (
                  <tr key={h.id}>
                    <td className="px-4 py-3"><DriverLink id={h.driverId} name={h.driverName} /></td>
                    <td className="px-4 py-3 font-semibold text-gray-800 tabular-nums">{naira(h.driverNet)}</td>
                    {/* No reason recorded is a fact worth seeing: it means
                        nobody can tell you why this rider is not being paid. */}
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {h.holdReason ?? <span className="text-amber-700">No reason was recorded</span>}
                    </td>
                    <td className="px-4 py-3"><DeliveryLink id={h.deliveryId} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(h.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => release(h)}
                        disabled={busyId === h.id}
                        title={`Make ${naira(h.driverNet)} withdrawable by ${h.driverName}. Cannot be undone here.`}
                        className="text-xs px-3 py-1.5 font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {busyId === h.id ? 'Releasing…' : `Release ${naira(h.driverNet)}`}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Ready to withdraw */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Clock size={15} className="text-yellow-600" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Ready for riders to withdraw</span>
          <RowCount shown={pending.length} total={summary?.pendingCount} noun="earnings" />
        </div>
        {/* The subtitle used to read "drivers self-serve via
            /payments/withdraw", an API path on a screen read by people
            who do not have one. */}
        <p className="px-4 pt-2 text-xs text-gray-500">
          Nothing on this list needs an action. Riders request these themselves in the SEIRS rider app, oldest first.
        </p>
        <div className="overflow-x-auto">
          {loading && pending.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : pending.length === 0 ? (
            <EmptyState
              icon={<Banknote size={20} />}
              title="Nothing is waiting to be withdrawn"
              body="Either every settled job has already been paid out, or no job has finished since the last payout run."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Rider</th>
                  <th className="text-left px-4 py-3">Rider keeps</th>
                  {/* Gross and the SEIRS cut were already in the payload
                      and drawn nowhere, so the one screen about payouts
                      could not show what the job earned SEIRS. */}
                  <th className="text-left px-4 py-3">Customer paid</th>
                  <th className="text-left px-4 py-3">SEIRS cut</th>
                  <th className="text-left px-4 py-3">Waiting since</th>
                  <th className="text-left px-4 py-3">Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map(p => (
                  <tr key={p.id}>
                    <td className="px-4 py-3"><DriverLink id={p.driverId} name={p.driverName} /></td>
                    <td className="px-4 py-3 font-semibold text-gray-800 tabular-nums">{naira(p.driverNet)}</td>
                    <td className="px-4 py-3 text-gray-600 tabular-nums">{p.grossAmount == null ? '-' : naira(p.grossAmount)}</td>
                    <td className="px-4 py-3 text-gray-600 tabular-nums">{p.seirsCut == null ? '-' : naira(p.seirsCut)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(p.availableAt)}</td>
                    <td className="px-4 py-3"><DeliveryLink id={p.deliveryId} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Money that has already gone */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <ArrowDownCircle size={15} className="text-[#3A7BD5]" />
          <span className="text-sm font-semibold text-[#0F2B4C]">Already sent to riders' banks</span>
          <RowCount shown={paid.length} noun="transfers, newest first" />
        </div>
        <div className="overflow-x-auto">
          {loading && paid.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : paid.length === 0 ? (
            <EmptyState
              icon={<ArrowDownCircle size={20} />}
              title="No money has been sent out yet"
              body="Transfers appear here the moment a rider's withdrawal completes at Flutterwave."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Rider</th>
                  <th className="text-left px-4 py-3">Reached their bank</th>
                  <th className="text-left px-4 py-3">Held back</th>
                  <th className="text-left px-4 py-3">Sent</th>
                  <th className="text-left px-4 py-3">Flutterwave reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paid.map(w => (
                  <tr key={w.id}>
                    <td className="px-4 py-3"><DriverLink id={w.driverId} name={w.driverName} /></td>
                    <td className="px-4 py-3 font-semibold text-gray-800 tabular-nums">
                      {naira(w.sentNgn ?? w.driverNet)}
                      {w.estimated && (
                        <span
                          className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                          title="Predates the payout ledger. This is what the rider earned; if a holdback applied, less reached the bank. Check the Flutterwave reference before reconciling."
                        >
                          earned, not confirmed sent
                        </span>
                      )}
                    </td>
                    {/* Held back is a real deduction from a real person's
                        pay, so it says why rather than showing a bare figure. */}
                    <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">
                      {w.holdbackNgn && w.holdbackNgn > 0 ? (
                        <span title="New-rider holdback. Kept by SEIRS on early payouts and released later.">
                          {naira(w.holdbackNgn)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(w.paidAt)}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {w.reference ?? w.flutterwaveTransferId ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, sub, value, Icon, color }: {
  label: string; sub: string; value: string; Icon: any; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
        <Icon size={18} className={color} />
      </div>
      <div>
        <div className="text-xl font-bold text-[#0F2B4C] tabular-nums">{value}</div>
        <div className="text-xs font-medium text-gray-700">{label}</div>
        <div className="text-xs text-gray-400">{sub}</div>
      </div>
    </div>
  );
}
