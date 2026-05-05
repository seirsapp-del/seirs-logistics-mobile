'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Bike, Car, Truck, FileText, Star, MapPin, IdCard } from 'lucide-react';
import { adminApi } from '@/lib/api';

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
  in_transit: 'bg-purple-100 text-purple-700',
  cancelled:  'bg-gray-100 text-gray-500',
  failed:     'bg-red-100 text-red-700',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const reload = () => adminApi.driver(id).then(setData).catch(() => {});

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [id]);

  const approve = async () => {
    setSaving(true);
    await adminApi.approveDriver(id);
    await reload();
    setSaving(false);
  };

  const suspend = async () => {
    if (!confirm('Suspend this driver?')) return;
    setSaving(true);
    await adminApi.suspendDriver(id);
    await reload();
    setSaving(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (!data)   return <div className="min-h-screen flex items-center justify-center text-gray-400">Driver not found</div>;

  const { driver, deliveries, deliveryCount, totalEarned } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-8 max-w-4xl mx-auto">
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
              <p className="text-xs text-gray-400 mt-1">
                {driver.vehicleType} {driver.vehiclePlate ? `· ${driver.vehiclePlate}` : ''} ·
                Joined {new Date(driver.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {driver.status === 'pending' && (
                <button onClick={approve} disabled={saving}
                  className="text-sm bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 font-medium">
                  {saving ? '...' : 'Approve KYC'}
                </button>
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
            </div>
          </div>

          {/* KYC Documents */}
          <div className="border-t border-gray-50 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">KYC Documents</h3>
            <div className="flex gap-4">
              {driver.idDocumentUrl ? (
                <a href={driver.idDocumentUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline bg-blue-50 px-3 py-2 rounded-lg">
                  🪪 ID Document
                </a>
              ) : (
                <span className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 px-3 py-2 rounded-lg"><IdCard size={14} /> ID — not uploaded</span>
              )}
              {driver.vehicleDocumentUrl ? (
                <a href={driver.vehicleDocumentUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline bg-blue-50 px-3 py-2 rounded-lg">
                  <FileText size={14} /> Vehicle Document
                </a>
              ) : (
                <span className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 px-3 py-2 rounded-lg"><FileText size={14} /> Vehicle doc — not uploaded</span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Deliveries',    value: deliveryCount },
            { label: 'Total Earned',  value: fmt(totalEarned) },
            { label: 'Rating',        value: <span className="inline-flex items-center justify-center gap-1"><Star size={16} className="fill-amber-400 text-amber-400" /> {Number(driver.rating).toFixed(1)}</span> },
            { label: 'Wallet Balance',value: fmt(Number(driver.walletBalance)) },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
              <div className="text-xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Last known location */}
        {driver.lastLat && driver.lastLng && (
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-6 flex items-center gap-3">
            <MapPin size={20} className="text-gray-700" />
            <div>
              <p className="text-sm font-semibold text-gray-800">Last Known Location</p>
              <p className="text-xs text-gray-500">{Number(driver.lastLat).toFixed(5)}, {Number(driver.lastLng).toFixed(5)}</p>
            </div>
          </div>
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
                  {['Tracking', 'Route', 'Status', 'Earnings', 'Date'].map((h) => (
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
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${DELIVERY_STATUS_COLORS[d.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-700">₦{d.driverEarnings?.toLocaleString()}</td>
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
    </div>
  );
}
