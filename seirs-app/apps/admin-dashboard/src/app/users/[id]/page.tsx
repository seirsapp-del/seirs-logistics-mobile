'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';
import { Section, Field, IdentityDocsReveal } from '@/components/DetailSections';
import { HardDeleteModal } from '@/components/HardDeleteModal';
import { AlertTriangle, CheckCircle2, Lock } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  delivered:  'bg-green-100 text-green-700',
  assigned:   'bg-blue-100 text-blue-700',
  in_transit: 'bg-cyan-100 text-cyan-700',
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
  if (!data)   return <div className="min-h-screen flex items-center justify-center text-gray-400">User not found</div>;

  const {
    user, deliveries, deliveryCount, totalSpent, cancelledCount,
    loyalty, identity, referrer, referredUsers, relatedAccounts,
    auditLog, driverRecord, fraudFlags,
  } = data;

  const fmtDate = (d: any) => d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const fmtDateShort = (d: any) => d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

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
                className="text-sm px-4 py-2 rounded-lg font-medium bg-[#0F2B4C]/10 text-[#0F2B4C] hover:bg-[#0F2B4C]/20"
              >
                Promote to Admin
              </button>
            )}
            <button
              onClick={sendDocument}
              className="text-sm px-4 py-2 rounded-lg font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
              title="Deliver an official document (contract, letter, statement) into this user's in-app Documents"
            >
              Send document
            </button>
            <button
              onClick={exportData}
              className="text-sm px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
              title="NDPR Article 24 - right to data portability"
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
            <Field label="Total deliveries" value={driverRecord.totalDeliveries?.toLocaleString?.() ?? '-'} />
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

// Deliver an official document into the user's in-app Documents screen.
// Either pasted text (rendered in-app) or an uploaded file: the file
// goes to SEIRS's own R2 storage under /documents and the app opens
// the resulting URL. Users get an in-app notification automatically.
function SendDocumentModal({
  userName,
  userId,
  onClose,
}: {
  userName: string;
  userId: string;
  onClose: () => void;
}) {
  const [title,    setTitle]    = useState('');
  const [category, setCategory] = useState('letter');
  const [body,     setBody]     = useState('');
  const [file,     setFile]     = useState<File | null>(null);
  const [busy,     setBusy]     = useState(false);

  const canSend = title.trim().length >= 3 && (body.trim().length > 0 || !!file);

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      let fileUrl: string | undefined;
      if (file) {
        const up = await adminApi.upload.image(file, 'documents');
        fileUrl = up.url;
      }
      await adminApi.documents.send(userId, {
        title:    title.trim(),
        category,
        body:     body.trim() || undefined,
        fileUrl,
      });
      alert(`Document delivered to ${userName}. They see it in Documents and got a notification.`);
      onClose();
    } catch (e: any) {
      alert(e?.message ?? 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">Send document to {userName}</h2>
        <p className="mt-1 text-xs text-gray-500">
          Paste the document text, or attach a PDF/image (stored in SEIRS cloud storage; the user's app opens it).
        </p>

        <label className="mt-4 block text-xs font-semibold text-gray-600">Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder='e.g. "Partner Store Agreement 2026"'
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />

        <label className="mt-3 block text-xs font-semibold text-gray-600">Category</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
        >
          <option value="contract">Contract</option>
          <option value="letter">Letter</option>
          <option value="statement">Statement</option>
          <option value="policy">Policy</option>
          <option value="other">Other</option>
        </select>

        <label className="mt-3 block text-xs font-semibold text-gray-600">Document text (rendered in-app)</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={5}
          placeholder="Paste the document text here, or leave empty and attach a file below."
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />

        <label className="mt-3 block text-xs font-semibold text-gray-600">Or attach a file (PDF, JPEG, PNG)</label>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 w-full text-sm"
        />
        {file && <p className="mt-1 text-xs text-gray-500">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={!canSend || busy}
            className="rounded-lg bg-[#3A7BD5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send document'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Section, Field, IdThumb, and IdentityDocsReveal moved to
// components/DetailSections.tsx so /drivers/[id] can share them.
