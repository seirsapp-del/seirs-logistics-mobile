'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';
import { AlertTriangle } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  delivered:  'bg-green-100 text-green-700',
  assigned:   'bg-blue-100 text-blue-700',
  in_transit: 'bg-purple-100 text-purple-700',
  cancelled:  'bg-gray-100 text-gray-500',
  failed:     'bg-red-100 text-red-700',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const confirm               = useConfirm();

  useEffect(() => {
    adminApi.user(id).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

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

  const promoteToAdmin = async () => {
    const ok = await confirm({
      title:        `Promote ${data.user.name} to admin?`,
      message:      'They will gain full platform access, including the ability to ban users, change pricing, and access financial reports. This action is irreversible without another admin demoting them.',
      confirmLabel: 'Promote to Admin',
      danger:       true,
    });
    if (!ok) return;
    setSaving(true);
    await adminApi.changeRole(id, 'admin');
    setData(await adminApi.user(id));
    setSaving(false);
  };

  // Change role between customer and driver. Admin promotion still lives
  // in the dedicated promoteToAdmin flow above so the extra warning shows.
  const changeRole = async (newRole: 'customer' | 'driver') => {
    if (data.user.role === newRole) return;
    const ok = await confirm({
      title:        `Change role from ${data.user.role} to ${newRole}?`,
      message:      newRole === 'driver'
        ? `${data.user.name} will be treated as a driver. They still need driver KYC (licence, vehicle photos) approved before they can accept trips. The SEIRS ID prefix stays at ${data.user.accountId?.split('-')[0] ?? 'original'} for compliance tracking.`
        : `${data.user.name} will be treated as a customer. Any driver dispatch privileges are removed immediately. The SEIRS ID prefix stays at ${data.user.accountId?.split('-')[0] ?? 'original'} for compliance tracking.`,
      confirmLabel: `Change to ${newRole}`,
      danger:       true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await adminApi.changeRole(id, newRole);
      setData(await adminApi.user(id));
    } catch (e: any) { alert(e?.message ?? 'Role change failed'); }
    finally { setSaving(false); }
  };

  // Spec V8 §3.13 — NDPR admin tools (A32 + A33)
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
  if (!data)   return <div className="min-h-screen flex items-center justify-center text-gray-400">User not found</div>;

  const {
    user, deliveries, deliveryCount, totalSpent, cancelledCount,
    loyalty, identity, referrer, referredUsers, relatedAccounts,
    auditLog, driverRecord, fraudFlags,
  } = data;

  const fmtDate = (d: any) => d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDateShort = (d: any) => d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-8 max-w-4xl mx-auto">
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
                                           'bg-purple-100 text-purple-700'
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
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Email verified</span>
              )}
              {user.identityVerifiedAt && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ✓ ID verified ({user.identityDocType ?? 'doc'})
                </span>
              )}
              {(user.failedLoginAttempts ?? 0) > 3 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  ⚠ {user.failedLoginAttempts} failed logins
                </span>
              )}
              {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                  🔒 Locked until {fmtDateShort(user.lockedUntil)}
                </span>
              )}
              {(fraudFlags?.length ?? 0) > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                  ⚠ {fraudFlags.length} fraud flag{fraudFlags.length === 1 ? '' : 's'}
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
            {/* Customer ↔ Driver toggle. Explicit demote/promote buttons so
                admin knows exactly which transition they are triggering. */}
            {user.role !== 'admin' && (
              <button
                onClick={() => changeRole(user.role === 'driver' ? 'customer' : 'driver')}
                disabled={saving}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-blue-100 text-blue-700 hover:bg-blue-200"
              >
                {user.role === 'driver' ? 'Change to Customer' : 'Change to Driver'}
              </button>
            )}
            {user.role === 'customer' && (
              <button
                onClick={promoteToAdmin}
                disabled={saving}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-purple-100 text-purple-700 hover:bg-purple-200"
              >
                Promote to Admin
              </button>
            )}
            <button
              onClick={exportData}
              className="text-sm px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
              title="NDPR Article 24 — right to data portability"
            >
              Export NDPR data
            </button>
            {user.role !== 'admin' && (
              <button
                onClick={() => setHardDeleteOpen(true)}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                title="NDPR right to erasure. immediate hard-delete"
              >
                NDPR hard-delete
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Deliveries',   value: deliveryCount },
            { label: 'Total Spent',        value: fmt(totalSpent) },
            { label: 'Cancelled',          value: cancelledCount ?? 0 },
            { label: `Rewards (${loyalty?.tier ?? 'Bronze'})`, value: (loyalty?.balance ?? 0).toLocaleString() },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Profile details */}
        <Section title="Profile">
          <Field label="Full name" value={[user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || user.name} />
          <Field label="Date of birth" value={user.dateOfBirth ? fmtDateShort(user.dateOfBirth) : null} />
          <Field label="Emergency contact" value={user.emergencyContactName ? `${user.emergencyContactName} · ${user.emergencyContactPhone ?? 'no phone'}` : null} />
          <Field label="Home address" value={user.homeAddress ? [user.homeAddress.street, user.homeAddress.city, user.homeAddress.state].filter(Boolean).join(', ') : null} />
        </Section>

        {/* Identity verification */}
        {identity && (
          <Section title="Identity verification">
            <Field label="Latest submission" value={identity.status} />
            <Field label="Submitted" value={fmtDate(identity.submittedAt)} />
            <Field label="Reviewed"  value={fmtDate(identity.reviewedAt)} />
            {identity.rejectionReason && <Field label="Rejection reason" value={identity.rejectionReason} />}
            {identity.revokedReason   && <Field label="Revoked reason"   value={identity.revokedReason} />}
            {identity.documentExpiryDate && <Field label="Doc expires"   value={fmtDateShort(identity.documentExpiryDate)} />}
            {(identity.documentPhotoUrl || identity.documentBackPhotoUrl || identity.selfiePhotoUrl) && (
              <div className="col-span-2 flex gap-3 mt-3">
                {identity.documentPhotoUrl     && <IdThumb src={identity.documentPhotoUrl}     label="Front" />}
                {identity.documentBackPhotoUrl && <IdThumb src={identity.documentBackPhotoUrl} label="Back" />}
                {identity.selfiePhotoUrl       && <IdThumb src={identity.selfiePhotoUrl}       label="Selfie" />}
              </div>
            )}
          </Section>
        )}

        {/* Financial — bank fields only for drivers. Customers pay via
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
            <Field label="Vehicle" value={`${driverRecord.vehicleType ?? '—'} · ${driverRecord.vehiclePlate ?? 'no plate'}`} />
            <Field label="Online" value={driverRecord.isOnline ? 'Yes' : 'No'} />
            <Field label="Rating" value={driverRecord.rating != null ? `${Number(driverRecord.rating).toFixed(1)} ★` : null} />
            <Field label="Total deliveries" value={driverRecord.totalDeliveries?.toLocaleString?.() ?? '—'} />
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
                    <td className="px-4 py-3 font-semibold text-gray-800">₦{d.price?.toLocaleString()}</td>
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
    </div>
  );
}

// Sectioned detail row: a labeled card with a two-column key/value grid.
// Used across the user detail page to keep the visual rhythm consistent.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
      <h3 className="text-sm font-bold text-[#0F2B4C] mb-3">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {children}
      </div>
    </div>
  );
}

// Key/value field. Renders "—" when value is null/undefined/empty string so
// missing data reads as intentional rather than broken.
function Field({ label, value }: { label: string; value: any }) {
  const display = value === null || value === undefined || value === '' ? '—' : String(value);
  const isEmpty = display === '—';
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-sm ${isEmpty ? 'text-gray-300' : 'text-[#0F2B4C]'}`}>{display}</div>
    </div>
  );
}

// Thumbnail preview for uploaded identity documents. Opens the full image
// in a new tab on click for admin review.
function IdThumb({ src, label }: { src: string; label: string }) {
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <img src={src} alt={label} className="w-24 h-32 object-cover rounded border border-gray-200 hover:border-[#3A7BD5] transition-colors" />
    </a>
  );
}

// Two-stage NDPR hard-delete confirmation. Stage 1 collects the reason
// (min 6 chars, required for the legal audit log). Stage 2 is a final
// "type the name to confirm" check to prevent muscle-memory purges.
function HardDeleteModal({
  userName,
  onCancel,
  onConfirm,
}: {
  userName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [stage,        setStage]        = useState<'reason' | 'confirm'>('reason');
  const [reason,       setReason]       = useState('');
  const [typedName,    setTypedName]    = useState('');
  const reasonOk = reason.trim().length >= 6;
  const nameOk   = typedName.trim() === userName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={22} className="shrink-0 mt-0.5 text-red-500" />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#0F2B4C] mb-1">
              NDPR hard-delete: {userName}
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              This bypasses the 30-day grace window. The account is archived (PII reduced) and
              purged from the live users table immediately. Cannot be undone.
            </p>
          </div>
        </div>

        {stage === 'reason' ? (
          <>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Reason for the legal audit log
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. NDPR erasure request received 2026-08-08 via support ticket #4821"
              className="w-full text-sm p-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#3A7BD5] min-h-[90px]"
              autoFocus
            />
            <p className={`text-xs mt-1 ${reasonOk ? 'text-gray-400' : 'text-red-500'}`}>
              {reasonOk ? `${reason.trim().length} characters` : `Minimum 6 characters (${reason.trim().length}/6)`}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#0F2B4C]/60 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                disabled={!reasonOk}
                onClick={() => setStage('confirm')}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Type <span className="font-mono text-red-600">{userName}</span> to confirm
            </label>
            <input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={userName}
              className="w-full text-sm p-3 border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 font-mono"
              autoFocus
            />
            <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 leading-relaxed">
              <span className="font-semibold text-gray-700">Reason logged:</span> {reason.trim()}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setStage('reason')}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#0F2B4C]/60 hover:bg-gray-100"
              >
                Back
              </button>
              <button
                disabled={!nameOk}
                onClick={() => onConfirm(reason)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
              >
                Purge account
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
