'use client';
/**
 * The SOS desk (founder 2026-08-23). Everything an operator needs to
 * act in the first minute: who (full identity: admin always sees
 * everything), where (GPS, one click onto the live ops map), what they
 * were doing (the booking), and one Resolve action when it is handled.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Siren, MapPin, Phone, Package, CheckCircle2, Copy } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';

export default function SosDeskPage() {
  const router  = useRouter();
  const confirm = useConfirm();
  const [alerts,  setAlerts]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState<string | null>(null);

  const load = () =>
    adminApi.sos.active().then((r: any[]) => setAlerts(r ?? [])).catch(() => {});

  useEffect(() => {
    load().finally(() => setLoading(false));
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const resolve = async (a: any) => {
    const ok = await confirm({
      title:        'Resolve this alert?',
      message:      `Confirm that ${a.user?.name ?? 'the user'} is safe or that help has been arranged. Resolving is logged with your admin identity.`,
      confirmLabel: 'Resolved: they are safe',
    });
    if (!ok) return;
    try {
      await adminApi.sos.resolve(a.id);
      load();
    } catch (e: any) { alert(e?.message ?? 'Resolve failed'); }
  };

  const copyCoords = (a: any) => {
    navigator.clipboard.writeText(`${Number(a.lat).toFixed(6)}, ${Number(a.lng).toFixed(6)}`)
      .then(() => { setCopied(a.id); setTimeout(() => setCopied(null), 1500); })
      .catch(() => {});
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-red-600 flex items-center justify-center">
            <Siren size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">SOS Desk</h1>
            <p className="text-xs text-gray-500">
              Live emergency alerts from any SEIRS app · refreshes every 15s
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-24 text-center text-gray-400">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
            <p className="font-semibold text-gray-800">No open alerts</p>
            <p className="text-sm text-gray-500 mt-1">
              When anyone presses SOS in a SEIRS app, it appears here and as a
              red banner on every admin page.
            </p>
          </div>
        ) : (
          alerts.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border-2 border-red-200 p-5 mb-4 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-base font-bold text-gray-900">
                    {a.user?.name ?? 'Unknown user'}
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 align-middle">
                      {String(a.user?.role ?? '').toUpperCase() || 'USER'}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-1">
                    <Phone size={13} className="text-gray-400" />
                    {a.user?.phone ?? 'no phone on file'} · {a.user?.email ?? ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Raised {new Date(a.createdAt).toLocaleString('en-NG')}
                    {a.note ? <> · “{a.note}”</> : null}
                  </p>
                </div>
                <button
                  onClick={() => resolve(a)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Resolve
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {a.lat != null && a.lng != null ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-xs text-gray-700">
                      <MapPin size={12} /> {Number(a.lat).toFixed(5)}, {Number(a.lng).toFixed(5)}
                    </span>
                    <button
                      onClick={() => copyCoords(a)}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                    >
                      {copied === a.id ? 'Copied!' : 'Copy'}
                    </button>
                    <Link
                      href={`/ops-map?lat=${a.lat}&lng=${a.lng}&label=${encodeURIComponent('SOS · ' + (a.user?.name ?? ''))}`}
                      className="rounded-lg bg-[#0F2B4C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#163B66]"
                    >
                      View on ops map
                    </Link>
                  </>
                ) : (
                  <span className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                    No GPS fix came with this alert: call them.
                  </span>
                )}
                {a.delivery?.id && (
                  <button
                    onClick={() => router.push(`/deliveries/${a.delivery.id}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                  >
                    <Package size={12} /> Open their booking
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
