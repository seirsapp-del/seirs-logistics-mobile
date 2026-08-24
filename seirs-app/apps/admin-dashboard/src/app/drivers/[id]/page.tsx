'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bike, Car, Truck, FileText, Star, MapPin, IdCard, CheckCircle2, AlertTriangle, Copy, Download, XCircle, ArrowLeft } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { naira } from "@/lib/money";
import { useConfirm } from '@/components/ConfirmDialog';
import { Section, Field, IdentityDocsReveal } from '@/components/DetailSections';
import { HardDeleteModal } from '@/components/HardDeleteModal';
import { SendDocumentModal } from '@/components/SendDocumentModal';
import { canExportNdprData, canHardDeleteAccount } from '@/lib/rbac';
import { getUser } from '@/lib/auth';


const VEHICLE_LUCIDE: Record<string, typeof Bike> = {
  bicycle:    Bike,
  motorcycle: Bike,
  tricycle:   Bike,
  car:        Car,
  van:        Truck,
};

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800',
  approved:  'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
  rejected:  'bg-gray-100 text-gray-600',
};

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  delivered:  'bg-green-100 text-green-700',
  assigned:   'bg-blue-100 text-blue-700',
  in_transit: 'bg-cyan-100 text-cyan-700',
  cancelled:  'bg-gray-100 text-gray-500',
  failed:     'bg-red-100 text-red-700',
};

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const confirm               = useConfirm();

  // Same gate as /users/[id]: the backend refuses NDPR export and
  // erasure to roles outside its allow-lists, so do not render a live
  // button that only fails after the confirmation is typed.
  const sessionUser   = getUser();
  const canExportNdpr = canExportNdprData(sessionUser);
  const canPurge      = canHardDeleteAccount(sessionUser);

  const reload = () => adminApi.driver(id).then((d) => { setData(d); setError(null); })
    .catch((e: any) => setError(e?.message ?? 'Could not load this driver'));

  // Universal account actions. A driver profile wraps a user account,
  // so documents and NDPR rights work exactly as they do on /users/[id].
  const [sendDocOpen,   setSendDocOpen]   = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [coordsCopied,  setCoordsCopied]  = useState(false);
  // Until now the only outcomes were Approve and Suspend, so a pending
  // applicant with a forged licence could be approved or left in the
  // queue forever. adminApi.rejectDriver existed with zero callers.
  const [rejectOpen,    setRejectOpen]    = useState(false);
  const accountUserId = data?.driver?.user?.id as string | undefined;

  // Value level 1-10 (two-person rule). Caps come from the Fee
  // Catalogue; the pending change renders with decide buttons and the
  // server enforces that the requester never decides their own move.
  const [levelCaps,     setLevelCaps]     = useState<number[]>([]);
  const [levelChanges,  setLevelChanges]  = useState<any[]>([]);
  const reloadLevels = () => {
    adminApi.driverLevels.config().then((r) => setLevelCaps(r.caps ?? [])).catch(() => {});
    adminApi.driverLevels.list(undefined, id).then(setLevelChanges).catch(() => {});
  };
  useEffect(() => { reloadLevels(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const requestLevel = async () => {
    const toRaw = prompt('Move this driver to which level? (1-10)\n\nLevel caps:\n' +
      levelCaps.map((c, i) => `L${i + 1}: ${naira(c)}`).join('\n'));
    if (!toRaw) return;
    const toLevel = Number(toRaw);
    if (!Number.isInteger(toLevel) || toLevel < 1 || toLevel > 10) { alert('Level must be 1-10.'); return; }
    const reason = prompt('Reason (required, audited). Why does this driver belong at that level?');
    if (!reason || reason.trim().length < 10) { alert('A real reason is required (at least 10 characters).'); return; }
    try {
      await adminApi.driverLevels.request(id, toLevel, reason.trim());
      alert('Requested. A different manager has to approve it before it takes effect.');
      reloadLevels();
    } catch (e: any) { alert(e?.message ?? 'Request failed'); }
  };

  const decideLevel = async (changeId: string, approve: boolean) => {
    const note = prompt(approve ? 'Approval note (optional):' : 'Rejection note (optional):') ?? undefined;
    try {
      await adminApi.driverLevels[approve ? 'approve' : 'reject'](changeId, note);
      reloadLevels();
      reload();
    } catch (e: any) { alert(e?.message ?? 'Decision failed'); }
  };

  const exportData = async () => {
    if (!accountUserId) return;
    try {
      const bundle = await adminApi.ndpr.exportUser(accountUserId);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seirs-export-${accountUserId}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { alert(e?.message ?? 'Export failed'); }
  };

  const runHardDelete = async (reason: string) => {
    if (!accountUserId) return;
    try {
      const r = await adminApi.ndpr.hardDeleteUser(accountUserId, reason.trim());
      alert(`Account purged. Archived at ${r.archivedAt}.`);
      router.push('/drivers');
    } catch (e: any) { alert(e?.message ?? 'Hard-delete failed'); }
  };

  const copyCoords = () => {
    const d = data?.driver;
    if (!d?.lastLat || !d?.lastLng) return;
    navigator.clipboard.writeText(`${Number(d.lastLat).toFixed(6)}, ${Number(d.lastLng).toFixed(6)}`)
      .then(() => { setCoordsCopied(true); setTimeout(() => setCoordsCopied(false), 1500); })
      .catch(() => alert('Copy failed'));
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [id]);

  const approve = async () => {
    setSaving(true);
    await adminApi.approveDriver(id);
    await reload();
    setSaving(false);
  };

  const reject = async (reason: string) => {
    setSaving(true);
    try {
      await adminApi.rejectDriver(id, reason.trim());
      setRejectOpen(false);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'Reject failed');
    } finally { setSaving(false); }
  };

  const suspend = async () => {
    const ok = await confirm({
      title:        'Suspend this driver?',
      message:      'They will stop receiving new dispatch offers immediately. Any active in-progress trip continues to completion. Reactivate anytime from this page.',
      confirmLabel: 'Suspend',
      danger:       true,
    });
    if (!ok) return;
    setSaving(true);
    await adminApi.suspendDriver(id);
    await reload();
    setSaving(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  // A failed fetch used to read "Driver not found", which is a different
  // fact entirely. Say which one it is and offer the retry.
  if (!data) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-sm">
        <p className="text-gray-500">{error ?? 'Driver not found'}</p>
        {error && (
          <button onClick={() => { setLoading(true); reload().finally(() => setLoading(false)); }}
            className="mt-3 text-sm font-semibold text-[#3A7BD5] underline hover:no-underline">
            Retry
          </button>
        )}
      </div>
    </div>
  );

  const {
    driver, deliveries, deliveryCount, totalEarned, cancelledCount,
    loyalty, identity, referrer, referredUsers, relatedAccounts,
    auditLog, fraudFlags,
  } = data;

  const fmtDate = (d: any) => d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  const fmtDateShort = (d: any) => d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-8 max-w-4xl mx-auto">
        {/* Back to the list. This page had no route out at all: an admin
            who opened a driver from Drivers, the dashboard KYC card, the
            interstate table or global search could only leave via the
            sidebar or the browser button (founder 2026-08-24: "why can't
            i click back here and it will take me back to the previous
            screen"). Same affordance as the delivery detail page. */}
        <Link href="/drivers" className="inline-flex items-center gap-1 text-sm text-[#3A7BD5] hover:underline mb-4">
          <ArrowLeft size={14} /> All drivers
        </Link>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => reload()} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
          </div>
        )}

        {/* Profile card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-start gap-6 mb-4">
            <div className="w-16 h-16 rounded-full bg-[#0F2B4C] flex items-center justify-center shrink-0">
              {(() => {
                const Icon = VEHICLE_LUCIDE[driver.vehicleType] ?? Car;
                return <Icon size={28} color="#fff" strokeWidth={1.75} />;
              })()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{driver.user?.name}</h1>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[driver.status] ?? ''}`}>
                  {driver.status}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${driver.isOnline ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${driver.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {driver.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="text-sm text-gray-500">{driver.user?.email}</p>
              <p className="text-sm text-gray-500">{driver.user?.phone}</p>
              {driver.user?.accountId && (
                <p className="text-xs text-gray-500 mt-2 font-mono">
                  <span className="text-gray-400">SEIRS ID:</span> {driver.user.accountId}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {driver.user?.emailVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} /> Email verified</span>
                )}
                {driver.user?.identityVerifiedAt && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 size={12} /> ID verified ({driver.user.identityDocType ?? 'doc'})
                  </span>
                )}
                {(fraudFlags?.length ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                    <AlertTriangle size={12} /> {fraudFlags.length} fraud flag{fraudFlags.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {driver.vehicleType} {driver.vehiclePlate ? `· ${driver.vehiclePlate}` : ''} ·
                Joined {new Date(driver.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {driver.status === 'pending' && (
                <>
                  <button onClick={approve} disabled={saving}
                    className="text-sm bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 font-medium">
                    {saving ? '...' : 'Approve KYC'}
                  </button>
                  <button onClick={() => setRejectOpen(true)} disabled={saving}
                    title="Turn this application down. The reason is stored on the driver record."
                    className="text-sm bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 font-medium flex items-center gap-1.5 justify-center">
                    <XCircle size={14} /> Reject KYC
                  </button>
                </>
              )}
              {driver.status === 'approved' && (
                <button onClick={suspend} disabled={saving}
                  className="text-sm bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 font-medium">
                  {saving ? '...' : 'Suspend'}
                </button>
              )}
              {driver.status === 'suspended' && (
                <button onClick={approve} disabled={saving}
                  className="text-sm bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 font-medium">
                  {saving ? '...' : 'Reinstate'}
                </button>
              )}
              {driver.user?.id && (
                <>
                  <button onClick={() => setSendDocOpen(true)}
                    className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5 justify-center">
                    <FileText size={14} /> Send document
                  </button>
                  {canExportNdpr && (
                    <button onClick={exportData}
                      title="NDPR data portability: download everything SEIRS holds on this account as JSON"
                      className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5 justify-center">
                      <Download size={14} /> Export NDPR data
                    </button>
                  )}
                  {canPurge && (
                    <button onClick={() => setHardDeleteOpen(true)}
                      title="NDPR erasure: permanently purge this account and its personal data"
                      className="text-sm bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 font-medium">
                      NDPR hard-delete
                    </button>
                  )}
                  {!canExportNdpr && !canPurge && (
                    <p className="max-w-[11rem] text-xs text-gray-400">
                      NDPR export and erasure need a Super Admin, Support Agent or Finance Officer role.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Vehicle KYC docs kept inline (driver-specific business docs,
              not customer PII). Identity docs go through the PII reveal
              flow in the Identity section below. */}
          <div className="border-t border-gray-50 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Vehicle KYC</h3>
            <div className="flex gap-4">
              {driver.vehicleDocumentUrl ? (
                <a href={driver.vehicleDocumentUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline bg-blue-50 px-3 py-2 rounded-lg">
                  <FileText size={14} /> Vehicle Document
                </a>
              ) : (
                <span className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 px-3 py-2 rounded-lg"><FileText size={14} /> Vehicle doc - not uploaded</span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Deliveries',    value: deliveryCount },
            { label: 'Total Earned',  value: naira(totalEarned) },
            { label: 'Rating',        value: <span className="inline-flex items-center justify-center gap-1"><Star size={16} className="fill-amber-400 text-amber-400" /> {Number(driver.rating).toFixed(1)}</span> },
            { label: 'Wallet Balance',value: naira(driver.walletBalance) },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
              <div className="text-xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Profile details from the underlying user account */}
        {driver.user && (
          <Section title="Owner profile">
            <Field label="Full name" value={[driver.user.firstName, driver.user.middleName, driver.user.lastName].filter(Boolean).join(' ') || driver.user.name} />
            <Field label="Date of birth" value={driver.user.dateOfBirth ? fmtDateShort(driver.user.dateOfBirth) : null} />
            <Field label="Emergency contact" value={driver.user.emergencyContactName ? `${driver.user.emergencyContactName} · ${driver.user.emergencyContactPhone ?? 'no phone'}` : null} />
            <Field label="Home address" value={driver.user.homeAddress ? [driver.user.homeAddress.street, driver.user.homeAddress.city, driver.user.homeAddress.state].filter(Boolean).join(', ') : null} />
          </Section>
        )}

        {/* Identity verification - PII-gated reveal flow */}
        {identity && (
          <Section title="Identity verification">
            <Field label="Latest submission" value={identity.status} />
            <Field label="Submitted" value={fmtDate(identity.submittedAt)} />
            <Field label="Reviewed"  value={fmtDate(identity.reviewedAt)} />
            {identity.rejectionReason && <Field label="Rejection reason" value={identity.rejectionReason} />}
            {identity.revokedReason   && <Field label="Revoked reason"   value={identity.revokedReason} />}
            {identity.documentExpiryDate && <Field label="Doc expires" value={fmtDateShort(identity.documentExpiryDate)} />}
            {driver.user?.id && (
              <div className="col-span-2 mt-3">
                <IdentityDocsReveal userId={driver.user.id} />
              </div>
            )}
          </Section>
        )}

        {/* Financial. Driver payout bank details visible here since drivers
            actually use direct debit for withdrawals. */}
        <Section title="Financial">
          <Field label="Loyalty balance" value={`${(loyalty?.balance ?? 0).toLocaleString()} pts (${loyalty?.tier ?? 'Bronze'})`} />
          <Field label="Wallet balance" value={naira(driver.walletBalance ?? 0)} />
          <Field label="Bank" value={driver.user?.bankAccountName ? `${driver.user.bankAccountName} · ${driver.user.bankAccountNumber?.slice(-4) ?? '****'} · ${driver.user.bankCode ?? ''}` : null} />
          <Field label="Bank verified" value={driver.user?.bankVerifiedAt ? fmtDate(driver.user.bankVerifiedAt) : null} />
        </Section>

        {/* Referrals */}
        <Section title="Referrals">
          <Field label="Their referral code (SEIRS ID)" value={driver.user?.accountId} />
          <Field label="Referred by" value={
            referrer ? `${referrer.name} (${referrer.accountId ?? referrer.email})` :
            driver.user?.referredByCode ? `code: ${driver.user.referredByCode} (referrer not found)` : null
          } />
          <div className="col-span-2 mt-2">
            <div className="text-xs font-semibold text-gray-500 mb-1">Users they referred ({referredUsers?.length ?? 0})</div>
            {(referredUsers?.length ?? 0) === 0 ? (
              <div className="text-sm text-gray-400">None yet.</div>
            ) : (
              <div className="space-y-1">
                {referredUsers.map((u: any) => (
                  <Link key={u.id} href={`/users/${u.id}`} className="block text-sm text-[#3A7BD5] hover:underline">
                    {u.name} <span className="text-xs text-gray-400">· {u.accountId} · joined {fmtDateShort(u.createdAt)}</span>
                  </Link>
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
                <Link key={a.id} href={`/users/${a.id}`} className="block text-sm hover:bg-gray-50 rounded p-2 -m-2">
                  <span className="font-semibold text-[#0F2B4C]">{a.name}</span>
                  <span className="text-xs text-gray-500 ml-2">· {a.role}</span>
                  <span className="text-xs text-gray-500 ml-2">· {a.accountId ?? 'no SEIRS ID'}</span>
                  <div className="text-xs text-gray-400">{a.email} · {a.phone ?? 'no phone'}</div>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* Audit log */}
        {(auditLog?.length ?? 0) > 0 && (
          <Section title={`Admin actions on this driver (${auditLog.length})`}>
            <div className="col-span-2 space-y-1">
              {auditLog.map((a: any) => (
                <div key={a.id} className="text-xs border-b border-gray-100 py-1.5">
                  <span className="font-semibold text-[#0F2B4C]">{a.action}</span>
                  <span className="text-gray-500 ml-2">by {a.adminName}</span>
                  <span className="text-gray-400 ml-2">· {fmtDate(a.createdAt)}</span>
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

        {/* Cancelled deliveries stat */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6 text-center">
          <div className="text-2xl font-bold text-gray-900">{cancelledCount ?? 0}</div>
          <div className="text-xs text-gray-500 mt-1">Cancelled deliveries</div>
        </div>

        {/* Last known location */}
        {driver.lastLat && driver.lastLng && (
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6 flex items-center gap-3 flex-wrap">
            <MapPin size={20} className="text-gray-700" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">Last Known Location</p>
              <p className="text-xs text-gray-500 font-mono">{Number(driver.lastLat).toFixed(5)}, {Number(driver.lastLng).toFixed(5)}</p>
            </div>
            <button onClick={copyCoords}
              title="Copy coordinates"
              className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-medium flex items-center gap-1.5">
              <Copy size={12} /> {coordsCopied ? 'Copied!' : 'Copy'}
            </button>
            <Link
              href={`/ops-map?lat=${Number(driver.lastLat)}&lng=${Number(driver.lastLng)}&label=${encodeURIComponent((driver.user?.name ?? 'Driver') + ' · last known')}`}
              className="text-xs bg-[#0F2B4C] text-white px-3 py-1.5 rounded-lg hover:bg-[#163B66] font-medium flex items-center gap-1.5">
              <MapPin size={12} /> View on ops map
            </Link>
          </div>
        )}

        {/* Vehicle: what passengers and senders are shown (founder
            2026-08-23: condition must be reviewable with pictures). */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-800">Vehicle</p>
            <button
              onClick={async () => {
                try {
                  await adminApi.documents.send(driver.user?.id, {
                    title: 'Please update your vehicle photo',
                    category: 'letter',
                    body: `Hello ${driver.user?.name ?? ''},\n\nPlease upload a current, clear photo of your ${driver.vehicleType ?? 'vehicle'} (plate visible) from the driver app: Profile, KYC Verification, Vehicle photo. Passengers and senders see this photo before you arrive, so it needs to match your vehicle today.\n\nThank you,\nSEIRS Operations`,
                  });
                  alert('Request sent: the driver sees it in Documents with a notification.');
                } catch (e: any) { alert(e?.message ?? 'Send failed'); }
              }}
              className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-medium"
            >
              Request new photo
            </button>
          </div>
          <div className="flex gap-4 flex-wrap items-start">
            {driver.vehiclePhotoUrl ? (
              <a href={driver.vehiclePhotoUrl} target="_blank" rel="noreferrer">
                <img src={driver.vehiclePhotoUrl} alt="Registered vehicle"
                     className="h-32 w-48 rounded-lg object-cover border border-gray-200" />
              </a>
            ) : (
              <div className="h-32 w-48 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400">
                No vehicle photo on file
              </div>
            )}
            <div className="text-sm text-gray-700 space-y-1">
              <p><span className="text-gray-400">Class:</span> {driver.vehicleType ?? '-'}</p>
              <p><span className="text-gray-400">Plate:</span> <span className="font-mono">{driver.vehiclePlate ?? '-'}</span></p>
              <p className="text-xs text-gray-400 max-w-xs">
                This exact photo + plate show on the passenger's trust card and
                the sender's tracking page.
              </p>
            </div>
          </div>
        </div>

        {/* Value level: how valuable a package this driver may carry. */}
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-full bg-[#0F2B4C] flex items-center justify-center text-white font-bold">
              L{driver.valueLevel ?? 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">Value Level {driver.valueLevel ?? 1} of 10</p>
              <p className="text-xs text-gray-500">
                May carry declared values up to{' '}
                <b>{naira(levelCaps[(Math.min(Math.max(driver.valueLevel ?? 1, 1), 10)) - 1] ?? 0)}</b>
                {' '}· climbs with clean deliveries, or by a manager-approved move
              </p>
            </div>
            <button onClick={requestLevel}
              className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-medium">
              Change level…
            </button>
          </div>
          {levelChanges.filter((c) => c.status === 'pending').map((c) => (
            <div key={c.id} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Pending: level {c.fromLevel} → {c.toLevel}</p>
              <p className="mt-0.5">{c.reason}</p>
              <p className="mt-0.5 text-amber-700/70">Two-person rule: a manager other than the requester must decide.</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => decideLevel(c.id, true)}
                  className="bg-emerald-600 text-white px-3 py-1 rounded font-semibold hover:bg-emerald-700">Approve</button>
                <button onClick={() => decideLevel(c.id, false)}
                  className="bg-white border border-amber-300 text-amber-800 px-3 py-1 rounded font-semibold hover:bg-amber-100">Reject</button>
              </div>
            </div>
          ))}
        </div>

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
                  {['Tracking', 'Route', 'Status', 'Earnings', 'Date'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* Whole row navigates: the founder could not click a
                    driver's delivery to reach its data (2026-08-21). */}
                {deliveries.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/deliveries/${d.id}`)}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{d.trackingCode}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="text-xs text-gray-700 truncate">{d.pickupAddress}</div>
                      <div className="text-xs text-gray-400 truncate">→ {d.dropoffAddress}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${DELIVERY_STATUS_COLORS[d.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-700">{naira(d.driverEarnings)}</td>
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

      {sendDocOpen && driver.user?.id && (
        <SendDocumentModal
          userName={driver.user?.name ?? 'this driver'}
          userId={driver.user.id}
          onClose={() => setSendDocOpen(false)}
        />
      )}
      {rejectOpen && (
        <RejectDriverModal
          driverName={driver.user?.name ?? 'this applicant'}
          saving={saving}
          onCancel={() => setRejectOpen(false)}
          onConfirm={reject}
        />
      )}
      {hardDeleteOpen && (
        <HardDeleteModal
          userName={driver.user?.name ?? 'this driver'}
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

/**
 * Rejection needs a reason: it is written to the driver record and is the
 * only thing anyone reviewing the decision later will have. A browser
 * prompt() was avoided deliberately (see users/[id]): some browser
 * configurations block it outright.
 */
function RejectDriverModal({
  driverName, saving, onCancel, onConfirm,
}: {
  driverName: string;
  saving:     boolean;
  onCancel:   () => void;
  onConfirm:  (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="font-bold text-[#0F2B4C]">Reject {driverName}?</h2>
          <p className="mt-1 text-xs text-gray-500">
            The application is turned down and the driver cannot accept trips. They can re-apply with corrected documents.
          </p>
        </div>
        <div className="p-5">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Reason (required)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="e.g. Licence number does not match the NDLEA record, and the plate on the vehicle photo is illegible."
            className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#3A7BD5] focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            At least 10 characters. Stored on the driver record and shown to whoever reviews this decision.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button onClick={onCancel} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!ok || saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? 'Rejecting…' : 'Reject application'}
          </button>
        </div>
      </div>
    </div>
  );
}
