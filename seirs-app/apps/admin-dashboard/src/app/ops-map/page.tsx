'use client';
import { Map, Radio } from 'lucide-react';

export default function OpsMapPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <Map size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Real-Time Ops Map</h1>
            <p className="text-sm text-gray-500">Live driver positions, active deliveries, and zone coverage</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
              <Radio size={12} className="text-red-500 animate-pulse" />
              Live feed paused — map not configured
            </span>
          </div>
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        <div className="absolute inset-0 bg-[#E8EDF2] flex flex-col items-center justify-center gap-4">
          {/* Faux map grid */}
          <div className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'linear-gradient(#3A7BD5 1px, transparent 1px), linear-gradient(90deg, #3A7BD5 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <div className="relative z-10 text-center bg-white rounded-2xl shadow-lg px-8 py-8 max-w-md border border-gray-200">
            <div className="w-14 h-14 rounded-full bg-[#0F2B4C]/10 flex items-center justify-center mx-auto mb-4">
              <Map size={28} className="text-[#0F2B4C]" />
            </div>
            <h2 className="text-base font-bold text-[#0F2B4C] mb-2">Google Maps API Key Required</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Configure <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono text-[#3A7BD5]">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> in your environment variables to enable the real-time operations map.
            </p>
            <div className="mt-4 pt-4 border-t border-gray-100 text-left space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Once configured, this view will show:</p>
              <ul className="text-xs text-gray-500 space-y-1">
                <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#3A7BD5] shrink-0" />Active driver positions (live GPS)</li>
                <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />In-transit delivery routes</li>
                <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />Zone heatmaps and demand clusters</li>
                <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />Flagged incidents and SLA breaches</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
