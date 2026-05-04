'use client';
import { Truck, MapPin, ArrowRight, AlertCircle } from 'lucide-react';

// Spec V8 §3.12 — interstate trip board. Surfaces driver-declared
// intercity trips so ops can match orphaned long-haul packages or
// override allocations. Backend declared-trip entity ships in a
// follow-up; this page establishes the UI so the schema has a
// concrete consumer to design against.

const PLACEHOLDER_TRIPS: any[] = []; // populated once driver_trips entity ships

export default function InterstateTripBoard() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Truck size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Interstate Trip Board</h1>
          <p className="text-sm text-gray-500">
            Drivers declare planned intercity routes; ops can match orphaned long-haul packages here.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <span>
          Backend driver_trips entity ships next batch. The UI is ready — once drivers start declaring trips via the new <code className="bg-yellow-100 px-1 rounded">/(driver)/interstate</code> screen, they&apos;ll populate here.
        </span>
      </div>

      {PLACEHOLDER_TRIPS.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#E5E7EB] text-gray-400">
          <Truck size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No declared intercity trips</p>
          <p className="text-xs mt-1">Trips appear here as drivers declare them in the driver app.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
          {PLACEHOLDER_TRIPS.map(t => (
            <div key={t.id} className="p-4 flex items-center gap-4">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <MapPin size={14} className="text-[#16A34A]" />
                <span className="font-semibold text-[#0F2B4C]">{t.from}</span>
                <ArrowRight size={14} className="text-gray-400" />
                <span className="font-semibold text-[#0F2B4C]">{t.to}</span>
              </div>
              <span className="text-xs text-gray-500">{t.driverName}</span>
              <span className="text-xs font-bold uppercase text-[#3A7BD5] bg-[#3A7BD5]/10 px-2 py-1 rounded">
                {t.spareKg} kg free
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Common routes reference */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/70 mb-3">Popular intercity corridors</h2>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            { from: 'Lagos',  to: 'Ibadan', km: 145 },
            { from: 'Lagos',  to: 'Abuja',  km: 760 },
            { from: 'Ibadan', to: 'Abuja',  km: 605 },
            { from: 'Lagos',  to: 'Benin',  km: 320 },
            { from: 'Abuja',  to: 'Kano',   km: 350 },
            { from: 'Lagos',  to: 'Port Harcourt', km: 620 },
          ].map(r => (
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
