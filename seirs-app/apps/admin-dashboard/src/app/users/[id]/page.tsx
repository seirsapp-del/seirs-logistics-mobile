'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { naira } from "@/lib/money";
import { useConfirm } from '@/components/ConfirmDialog';
import { Section, Field, IdentityDocsReveal } from '@/components/DetailSections';
import { SosHistory } from '@/components/SosHistory';
import { HardDeleteModal } from '@/components/HardDeleteModal';
import { SendDocumentModal } from '@/components/SendDocumentModal';
import { canExportNdprData, canHardDeleteAccount } from '@/lib/rbac';
import { getUser } from '@/lib/auth';
import { AlertTriangle, CheckCircle2, Lock, ArrowLeft } from 'lucide-react';


const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  delivered:  'bg-green-100 text-green-700',
  assigned:   'bg-blue-100 text-blue-700',
  in_transit: 'bg-cyan-100 text-cyan-700',
  cancelled:  'bg-gray-100 text-gray-500',
  failed:     'bg-red-100 text-red-700',
};


export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const confirm               = useConfirm();
  // The NDPR tools are role-gated server-side. This check was computed
  // here and never wired, so ops_manager and driver_compliance saw a
  // live irreversible-purge button that only 403s after they have typed
  // the reason and confirmed the name.
  const sessionUser           = getUser();
  const canExportNdpr         = canExportNdprData(sessionUser);
  const canPurge              = canHardDeleteAccount(sessionUser);

  const [error, setError] = useState<string | null>(null);

  const loadUser = () => {
    setLoading(true);
    setError(null);
    adminApi.user(id)
      .then(setData)
      // "User not found" and "the request failed" are different facts and
      // used to render identically.
      .catch((e: any) => setError(e?.message ?? 'Could not load this account'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadUser(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const toggleBan = async () => {
    if (!data) return;
    const ok = await confirm(data.user.isActive
      ? {
          title:        `Ban ${data.user.name}?`,
          message:      'They will be signed out on their next request and cannot use the app until unbanned. Their historical data, deliveries, and wallet balance are preserved.',
          confirmLabel: 'Ban',
          danger:       true,
        }
      : {
          title:        `Unban ${data.user.name}?`,
          message:      'They will regain full access on next sign-in.',
          confirmLabel: 'Unban',
        });
    if (!ok) return;
    setSaving(true);
    await adminApi.updateUser(id, { isActive: !data.user.isActive });
    setData(await adminApi.user(id));
    setSaving(false);
  };


  // Change role between customer and driver. Admin promotion still lives
  // in the dedicated promoteToAdmin flow above so the extra warning shows.

  // Spec V8 §3.13 - NDPR admin tools (A32 + A33)
  const exportData = async () => {
    try {
      const bundle = await adminApi.ndpr.exportUser(id);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seirs-export-${id}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { alert(e?.message ?? 'Export failed'); }
  };

  // Documents hub: opens the SendDocumentModal (title + category +
  // pasted text OR an uploaded PDF that lands in SEIRS's own R2
  // storage; the app opens the resulting URL).
  const [sendDocOpen, setSendDocOpen] = useState(false);
  const sendDocument = () => setSendDocOpen(true);

  // Hard-delete triggers a two-step branded modal (reason input → confirm)
  // instead of the browser's ugly prompt()/confirm(). See HardDeleteModal
  // component at the bottom of this file.
  const runHardDelete = async (reason: string) => {
    try {
      const r = await adminApi.ndpr.hardDeleteUser(id, reason.trim());
      alert(`Account purged. Archived at ${r.archivedAt}.`);
      router.push('/users');
    } catch (e: any) { alert(e?.message ?? 'Hard-delete failed'); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (!data) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-sm text-center">
        <p className="text-gray-500">{error ?? 'User not found'}</p>
        {error && (
          <button onClick={loadUser} className="mt-3 text-sm font-semibold text-[#3A7BD5] underline hover:no-underline">
            Retry
          </button>
        )}
      </div>
    </div>
  );

  const {
    user, deliveries, deliveryCount, totalSpent, cancelledCount,
    loyalty, identity, referrer, referredUsers, relatedAccounts,
    auditLog, driverRecord, fraudFlags,
    /* Neither is in the payload today. Both names are read because the
       server already computes one of them (deliveredCount, discarded
       before the return) and completedCount is the name the driver
       profile is waiting on, so whichever gets wired lands here.

       A warning for whoever wires it: that existing deliveredCount is
       NOT the number to return. getUserDetail filters it out of the
       deliveries array, which findAndCount capped at take: 10, so it
       can never exceed ten however many runs the customer has made. It
       needs its own count() on status = delivered, the way
       cancelledCount already does it. */
    completedCount, deliveredCount,
    /* Every SOS this person has raised. Nothing sends it yet: see the
       long note in components/SosHistory.tsx for why, and for the one
       server change that would light this up. */
    sosAlerts,
  } = data;

  const fmtDate = (d: any) => d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const fmtDateShort = (d: any) => d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-8 max-w-4xl mx-auto">
        {/* Back to the list. This page had no route out at all, and it is
            the most linked-to page in the dashboard (fraud flags, SOS
            alerts, support threads, recycle bin, delivery and partner
            detail all land here), so an admin could arrive and have
            nothing to click to leave (founder 2026-08-24: "why can't i
            click back here and it will take me back to the previous
            screen"). Same affordance as the delivery detail page. */}
        {/*
          "All customers" regardless of who this is (founder screenshot).
          Every screen in the dashboard lands here, including the payouts
          table, where clicking a RIDER took you to a page whose only
          navigation called them a customer. He reasonably read that as
          the rider having been filed as a customer, and asked whether
          every driver gets a customer account. They do not: drivers and
          customers are separate accounts by design. This page was just
          lying about which list it belongs to.
        */}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Link
            href={user.role === 'driver' ? '/drivers' : '/users'}
            className="inline-flex items-center gap-1 text-sm text-[#3A7BD5] hover:underline"
          >
            <ArrowLeft size={14} />
            {user.role === 'driver' ? 'All drivers' : user.role === 'admin' ? 'All staff' : 'All customers'}
          </Link>
          {/*
            The rider record is a different page with different facts on
            it (KYC, vehicle, acceptance rate), and arriving here from a
            payout meant there was no route to it at all.
          */}
          {driverRecord?.id && (
            <Link
              href={`/drivers/${driverRecord.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] px-2.5 py-1 text-xs font-semibold text-[#0F2B4C] hover:bg-gray-50"
            >
              Open their driver record
            </Link>
          )}
        </div>

        {/* Profile card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 flex items-start gap-6">
          <div className="w-16 h-16 rounded-full bg-[#3A7BD5] flex items-center justify-center text-white text-2xl font-black shrink-0">
            {user.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{user.name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                user.role === 'customer' ? 'bg-blue-100 text-blue-700' :
                user.role === 'driver'   ? 'bg-orange-100 text-orange-700' :
                                           'bg-[#0F2B4C] text-white'
              }`}>{user.role}</span>
              {user.isActive !== false ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Active</span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Banned</span>
              )}
            </div>
            <p className="text-sm text-gray-500">{user.email}</p>
            <p className="text-sm text-gray-500">{user.phone}</p>
            {user.accountId && (
              <p className="text-xs text-gray-500 mt-2 font-mono">
                <span className="text-gray-400">SEIRS ID:</span> {user.accountId}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {user.emailVerified && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} /> Email verified</span>
              )}
              {user.identityVerifiedAt && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={12} /> ID verified ({user.identityDocType ?? 'doc'})
                </span>
              )}
              {(user.failedLoginAttempts ?? 0) > 3 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <AlertTriangle size={12} /> {user.failedLoginAttempts} failed logins
                </span>
              )}
              {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                  <Lock size={12} /> Locked until {fmtDateShort(user.lockedUntil)}
                </span>
              )}
              {(fraudFlags?.length ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                  <AlertTriangle size={12} /> {fraudFlags.length} fraud flag{fraudFlags.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Joined {new Date(user.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={toggleBan}
              disabled={saving}
              className={`text-sm px-4 py-2 rounded-lg font-medium ${
                user.isActive !== false
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {saving ? '...' : user.isActive !== false ? 'Ban User' : 'Unban User'}
            </button>
            {/* The Customer/Driver toggle was removed (founder 2026-08-27:
                "this change to customer or change to driver button i told
                you to delete it").

                It contradicted the account model: one email is one
                account is one SEIRS ID, and customer and driver are
                SEPARATE accounts by design, for fraud, liability and
                financial separation. A button that flips a role in place
                mutates an identity that is supposed to be fixed, and it
                leaves a DRV- prefix on someone the system now calls a
                customer. That is exactly what this screen was showing.

                Someone who wants to drive registers as a driver. */}
            {/* Promote to Admin was removed outright (founder
                2026-08-21): staff become admins through the Admins page
                with a proper invitation, never by escalating a customer
                row in two clicks. */}
            <button
              onClick={sendDocument}
              className="text-sm px-4 py-2 rounded-lg font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
              title="Deliver an official document (contract, letter, statement) into this user's in-app Documents"
            >
              Send document
            </button>
            {canExportNdpr && (
              <button
                onClick={exportData}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                title="NDPR Article 24 - right to data portability"
              >
                Export NDPR data
              </button>
            )}
            {canPurge && user.role !== 'admin' && (
              <button
                onClick={() => setHardDeleteOpen(true)}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                title="NDPR right to erasure. immediate hard-delete"
              >
                NDPR hard-delete
              </button>
            )}
            {!canExportNdpr && !canPurge && (
              <p className="max-w-[11rem] text-xs text-gray-400">
                NDPR export and erasure need a Super Admin, Support Agent or Finance Officer role.
              </p>
            )}
          </div>
        </div>

        {/* Stats.
            Same correction as the driver profile (founder 2026-08-25):
            "Total Deliveries" counted every booking row whatever became
            of it, sat next to a cancelled count, and left the reader to
            assume the difference was completed work. It is not: pending,
            assigned, in transit and failed all live in that gap.

            completedCount is read but not derived. AdminService already
            computes a deliveredCount inside getUserDetail and drops it
            on the floor without returning it, so both names are accepted
            here and whichever one the server starts sending will land. */}
        <div className="grid grid-cols-5 gap-4 mb-2">
          {[
            {
              label: 'Completed',
              value: completedCount ?? deliveredCount ?? <span className="text-base font-semibold text-gray-300">not counted</span>,
              hint:  'Bookings that reached delivered.',
            },
            {
              label: 'Cancelled',
              value: cancelledCount ?? 0,
              hint:  'Bookings that ended cancelled.',
            },
            {
              label: 'Bookings, all outcomes',
              value: deliveryCount,
              hint:  'Every booking this account has ever made, whatever became of it.',
            },
            {
              label: 'Total Spent',
              value: naira(totalSpent),
              hint:  'Sum of the fare on bookings that reached delivered.',
            },
            {
              label: `Rewards (${loyalty?.tier ?? 'Bronze'})`,
              value: (loyalty?.balance ?? 0).toLocaleString(),
              hint:  'Points, not naira. Customers never hold a naira balance.',
            },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center" title={s.hint}>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {completedCount == null && deliveredCount == null && (
          <p className="mb-6 text-xs text-gray-500">
            The completed count is not in the user API response yet, so it is left
            blank. Bookings minus cancelled would count pending, in-transit and
            failed runs as completed, which is worse than saying nothing.
          </p>
        )}

        {/* Profile details */}
        <Section title="Profile">
          <Field label="Full name" value={[user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || user.name} />
          <Field label="Date of birth" value={user.dateOfBirth ? fmtDateShort(user.dateOfBirth) : null} />
          <Field label="Emergency contact" value={user.emergencyContactName ? `${user.emergencyContactName} · ${user.emergencyContactPhone ?? 'no phone'}` : null} />
          <Field label="Home address" value={user.homeAddress ? [user.homeAddress.street, user.homeAddress.city, user.homeAddress.state].filter(Boolean).join(', ') : null} />
        </Section>

        {/* Identity verification - document URLs are PII-redacted in the
            initial response. Reveal is a separate role-gated + audit-logged
            action; see IdentityDocsReveal component below. */}
        {identity && (
          <Section title="Identity verification">
            <Field label="Latest submission" value={identity.status} />
            <Field label="Submitted" value={fmtDate(identity.submittedAt)} />
            <Field label="Reviewed"  value={fmtDate(identity.reviewedAt)} />
            {identity.rejectionReason && <Field label="Rejection reason" value={identity.rejectionReason} />}
            {identity.revokedReason   && <Field label="Revoked reason"   value={identity.revokedReason} />}
            {identity.documentExpiryDate && <Field label="Doc expires"   value={fmtDateShort(identity.documentExpiryDate)} />}
            <div className="col-span-2 mt-3">
              <IdentityDocsReveal userId={id} />
            </div>
          </Section>
        )}

        <SosHistory userId={id} personLabel={user.name ?? 'this account'} alerts={sosAlerts} />

        {/* Financial - bank fields only for drivers. Customers pay via
            Flutterwave Inline (card/USSD), never direct debit, so a bank
            row on a customer is meaningless and leaks unnecessary PII. */}
        <Section title="Financial">
          <Field label="Loyalty balance" value={`${(loyalty?.balance ?? 0).toLocaleString()} pts (${loyalty?.tier ?? 'Bronze'})`} />
          {user.role === 'driver' && (
            <>
              <Field label="Bank" value={user.bankAccountName ? `${user.bankAccountName} · ${user.bankAccountNumber?.slice(-4) ?? '****'} · ${user.bankCode ?? ''}` : null} />
              <Field label="Bank verified" value={user.bankVerifiedAt ? fmtDate(user.bankVerifiedAt) : null} />
            </>
          )}
        </Section>

        {/* Driver record (if this user has one) */}
        {driverRecord && (
          <Section title="Driver record">
            <Field label="Status" value={driverRecord.status} />
            <Field label="Vehicle" value={`${driverRecord.vehicleType ?? '-'} · ${driverRecord.vehiclePlate ?? 'no plate'}`} />
            <Field label="Online" value={driverRecord.isOnline ? 'Yes' : 'No'} />
            <Field label="Rating" value={driverRecord.rating != null ? `${Number(driverRecord.rating).toFixed(1)} ★` : null} />
            {/* Not a delivery count, whatever the column is called.
                DeliveriesService increments drivers.totalDeliveries inside
                rateDelivery, so it only ever moves when a CUSTOMER leaves
                a star. An unrated delivered run never reaches it. Named
                for what it actually counts (founder 2026-08-25). */}
            <Field label="Runs rated by customers" value={driverRecord.totalDeliveries?.toLocaleString?.() ?? '-'} />
            <Field label="Last location update" value={fmtDate(driverRecord.locationUpdatedAt)} />
          </Section>
        )}

        {/* Referrals */}
        <Section title="Referrals">
          <Field label="Their referral code (their SEIRS ID)" value={user.accountId} />
          <Field label="Referred by" value={
            referrer ? `${referrer.name} (${referrer.accountId ?? referrer.email})` :
            user.referredByCode ? `code: ${user.referredByCode} (referrer not found)` : null
          } />
          <div className="col-span-2 mt-2">
            <div className="text-xs font-semibold text-gray-500 mb-1">Users they referred ({referredUsers?.length ?? 0})</div>
            {(referredUsers?.length ?? 0) === 0 ? (
              <div className="text-sm text-gray-400">None yet.</div>
            ) : (
              <div className="space-y-1">
                {referredUsers.map((u: any) => (
                  <a key={u.id} href={`/users/${u.id}`} className="block text-sm text-[#3A7BD5] hover:underline">
                    {u.name} <span className="text-xs text-gray-400">· {u.accountId} · joined {fmtDateShort(u.createdAt)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Cross-account grouping */}
        {(relatedAccounts?.length ?? 0) > 0 && (
          <Section title={`Other accounts (${relatedAccounts.length}) with matching name or phone`}>
            <div className="col-span-2 space-y-1">
              {relatedAccounts.map((a: any) => (
                <a key={a.id} href={`/users/${a.id}`} className="block text-sm hover:bg-gray-50 rounded p-2 -m-2">
                  <span className="font-semibold text-[#0F2B4C]">{a.name}</span>
                  <span className="text-xs text-gray-500 ml-2">· {a.role}</span>
                  <span className="text-xs text-gray-500 ml-2">· {a.accountId ?? 'no SEIRS ID'}</span>
                  <div className="text-xs text-gray-400">{a.email} · {a.phone ?? 'no phone'}</div>
                </a>
              ))}
            </div>
          </Section>
        )}

        {/* Audit log */}
        {(auditLog?.length ?? 0) > 0 && (
          <Section title={`Admin actions on this user (${auditLog.length})`}>
            <div className="col-span-2 space-y-1">
              {auditLog.map((a: any) => (
                <div key={a.id} className="text-xs border-b border-gray-100 py-1.5">
                  <span className="font-semibold text-[#0F2B4C]">{a.action}</span>
                  <span className="text-gray-500 ml-2">by {a.adminName}</span>
                  <span className="text-gray-400 ml-2">· {fmtDate(a.createdAt)}</span>
                  {a.meta && (
                    <div className="text-gray-500 font-mono text-xs mt-0.5">{JSON.stringify(a.meta)}</div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Fraud flags */}
        {(fraudFlags?.length ?? 0) > 0 && (
          <Section title={`Fraud flags (${fraudFlags.length})`}>
            <div className="col-span-2 space-y-1">
              {fraudFlags.map((f: any) => (
                <div key={f.id} className="text-xs border-b border-gray-100 py-1.5">
                  <span className="font-semibold text-red-700">{f.type}</span>
                  <span className="text-gray-500 ml-2">· {f.status}</span>
                  <span className="text-gray-400 ml-2">· {fmtDate(f.createdAt)}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Recent deliveries */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">Recent Deliveries</h2>
          </div>
          {deliveries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No deliveries yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Tracking', 'From → To', 'Status', 'Amount', 'Date'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {deliveries.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.trackingCode}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="text-xs text-gray-700 truncate">{d.pickupAddress}</div>
                      <div className="text-xs text-gray-400 truncate">→ {d.dropoffAddress}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[d.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{naira(d.price)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(d.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {hardDeleteOpen && (
        <HardDeleteModal
          userName={user.name}
          onCancel={() => setHardDeleteOpen(false)}
          onConfirm={async (reason) => {
            setHardDeleteOpen(false);
            await runHardDelete(reason);
          }}
        />
      )}

      {sendDocOpen && (
        <SendDocumentModal
          userName={user.name}
          userId={id}
          onClose={() => setSendDocOpen(false)}
        />
      )}
    </div>
  );
}

// Section, Field, IdThumb, and IdentityDocsReveal moved to
// components/DetailSections.tsx so /drivers/[id] can share them.
