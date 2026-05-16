'use client';
import { useEffect, useState } from 'react';
import { Truck, MapPin, ArrowRight, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { adminApi } from '@/lib/api';

// Spec V8 §3.12 — interstate trip board. Surfaces driver-declared
// intercity trips so ops can match orphaned long-haul packages or
// override allocations.
interface InterstateTrip {
  id:              string;
  fromCity:        string;
  toCity:          string;
  departAt:        string;
  spareCapacityKg: number;
  status:          'active' | 'completed' | 'cancelled';
  createdAt:       string;
  driver?: {
    id:           string;
    vehicleType?: string;
    user?: { id: string; name: string; phone?: string };
  };
}

const POPULAR = [
  { from: 'Lagos',  to: 'Ibadan', km: 145 },
  { from: 'Lagos',  to: 'Abuja',  km: 760 },
  { from: 'Ibadan', to: 'Abuja',  km: 605 },
  { from: 'Lagos',  to: 'Benin',  km: 320 },
  { from: 'Abuja',  to: 'Kano',   km: 350 },
  { from: 'Lagos',  to: 'Port Harcourt', km: 620 },
];

export default function InterstateTripBoard() {
  const [trips,   setTrips]   = useState<InterstateTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.interstateTrips.list('active')
      .then((data: any) => setTrips(Array.isArray(data) ? data : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load trips'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Truck size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#0F2B4C]">Interstate Trip Board</h1>
          <p className="text-sm text-gray-500">
            Drivers declare planned intercity routes; ops can match orphaned long-haul packages here.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading active trips…
        </div>
      ) : trips.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#E5E7EB] text-gray-400">
          <Truck size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No declared intercity trips</p>
          <p className="text-xs mt-1">Trips appear here as drivers declare them in the driver app.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
          {trips.map(t => {
            const depart = new Date(t.departAt);
            return (
              <div key={t.id} className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <MapPin size={14} className="text-[#16A34A]" />
                  <span className="font-semibold text-[#0F2B4C]">{t.fromCity}</span>
                  <ArrowRight size={14} className="text-gray-400" />
                  <span className="font-semibold text-[#0F2B4C]">{t.toCity}</span>
                </div>
                <span className="text-xs text-gray-600">
                  {t.driver?.user?.name ?? 'Unknown driver'}
                  {t.driver?.vehicleType ? ` · ${t.driver.vehicleType}` : ''}
                </span>
                <span className="text-xs text-gray-500">
                  {depart.toLocaleString('en-NG', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                <span className="text-xs font-bold uppercase text-[#3A7BD5] bg-[#3A7BD5]/10 px-2 py-1 rounded">
                  {Number(t.spareCapacityKg).toFixed(0)} kg free
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Common routes reference */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/70 mb-3">Popular intercity corridors</h2>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {POPULAR.map(r => (
            <div key={`${r.from}-${r.to}`} className="bg-gray-50 rounded-lg p-3">
              <p className="font-semibold text-[#0F2B4C]">{r.from} → {r.to}</p>
              <p className="text-xs text-gray-500 mt-1">~{r.km} km</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
