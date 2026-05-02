'use client';
import { useEffect, useRef, useState } from 'react';
import { Map as MapIcon, Radio, AlertTriangle, Truck } from 'lucide-react';
import { adminApi } from '@/lib/api';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';

// ── Lazy Google Maps loader ──────────────────────────────────────────────────
let _mapsPromise: Promise<typeof google> | null = null;
function loadGoogleMaps(key: string): Promise<typeof google> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if ((window as any).google?.maps) return Promise.resolve((window as any).google);
  if (_mapsPromise) return _mapsPromise;

  _mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src    = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=visualization`;
    script.async  = true;
    script.defer  = true;
    script.onload  = () => resolve((window as any).google);
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
  return _mapsPromise;
}

interface DriverPin { id: string; name: string; lat: number; lng: number; isOnline: boolean; lastSeen?: string; }
interface DeliveryPin { id: string; trackingCode: string; pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number; status: string; }

// Lagos centre as default — sensible for a Nigeria-only platform
const DEFAULT_CENTER = { lat: 6.5244, lng: 3.3792 };

export default function OpsMapPage() {
  const mapEl    = useRef<HTMLDivElement>(null);
  const mapRef   = useRef<google.maps.Map | null>(null);
  const markersRef   = useRef<globalThis.Map<string, google.maps.Marker>>(new globalThis.Map());
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const heatmapRef   = useRef<google.maps.visualization.HeatmapLayer | null>(null);

  const [drivers,    setDrivers]    = useState<DriverPin[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryPin[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [loaded,     setLoaded]     = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // ── Init map once ──
  useEffect(() => {
    if (!MAPS_KEY) {
      setError('NEXT_PUBLIC_GOOGLE_MAPS_KEY not set in Vercel env vars.');
      return;
    }
    let cancelled = false;
    loadGoogleMaps(MAPS_KEY)
      .then((g) => {
        if (cancelled || !mapEl.current) return;
        mapRef.current = new g.maps.Map(mapEl.current, {
          center: DEFAULT_CENTER,
          zoom:   11,
          mapTypeControl:   false,
          fullscreenControl: false,
          streetViewControl: false,
          styles: [
            { featureType: 'poi',     elementType: 'labels', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          ],
        });
        // Traffic layer per spec §G4
        new g.maps.TrafficLayer().setMap(mapRef.current);
        setLoaded(true);
      })
      .catch((e) => setError(e?.message ?? 'Failed to load Google Maps'));
    return () => { cancelled = true; };
  }, []);

  // ── Poll for driver + delivery positions every 10s ──
  useEffect(() => {
    if (!loaded) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      try {
        const [d, ds] = await Promise.all([
          adminApi.opsMap.onlineDrivers().catch(() => []),
          adminApi.opsMap.activeDeliveries().catch(() => []),
        ]);
        if (Array.isArray(d))  setDrivers(d as DriverPin[]);
        if (Array.isArray(ds)) setDeliveries(ds as DeliveryPin[]);
      } catch {/* swallow — show stale data */ }
    }
    refresh();
    timer = setInterval(refresh, 10_000);
    return () => { if (timer) clearInterval(timer); };
  }, [loaded]);

  // ── Render driver markers ──
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapRef.current) return;
    const seen = new Set<string>();
    drivers.forEach((d) => {
      seen.add(d.id);
      let m = markersRef.current.get(d.id);
      const pos = { lat: d.lat, lng: d.lng };
      if (m) {
        m.setPosition(pos);
      } else {
        m = new g.maps.Marker({
          position: pos,
          map:      mapRef.current,
          title:    d.name,
          icon: {
            path:        g.maps.SymbolPath.CIRCLE,
            scale:       7,
            fillColor:   d.isOnline ? '#16A34A' : '#9CA3AF',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        });
        markersRef.current.set(d.id, m!);
      }
    });
    // remove markers for drivers no longer in the response
    Array.from(markersRef.current.entries()).forEach(([id, m]) => {
      if (!seen.has(id)) { m.setMap(null); markersRef.current.delete(id); }
    });
  }, [drivers]);

  // ── Render delivery polylines ──
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapRef.current) return;
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = deliveries.map((dv) => new g.maps.Polyline({
      path: [{ lat: dv.pickupLat, lng: dv.pickupLng }, { lat: dv.dropoffLat, lng: dv.dropoffLng }],
      strokeColor:   dv.status === 'in_transit' ? '#3A7BD5' : '#D97706',
      strokeOpacity: 0.7,
      strokeWeight:  3,
      map:           mapRef.current,
    }));
  }, [deliveries]);

  // ── Toggle heatmap ──
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapRef.current) return;
    heatmapRef.current?.setMap(null);
    if (!showHeatmap || drivers.length === 0) { heatmapRef.current = null; return; }
    heatmapRef.current = new g.maps.visualization.HeatmapLayer({
      data:   drivers.map((d) => new g.maps.LatLng(d.lat, d.lng)),
      radius: 30,
      map:    mapRef.current,
    });
  }, [showHeatmap, drivers]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <MapIcon size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Real-Time Ops Map</h1>
            <p className="text-sm text-gray-500">Live driver positions, active deliveries, and zone coverage</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-500">
              <Truck size={12} className="inline mr-1 text-emerald-600" />
              {drivers.filter((d) => d.isOnline).length} online · {deliveries.length} active
            </span>
            <button
              onClick={() => setShowHeatmap((v) => !v)}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${
                showHeatmap
                  ? 'bg-[#0F2B4C] text-white border-[#0F2B4C]'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              Heatmap
            </button>
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
              <Radio
                size={12}
                className={loaded && !error ? 'text-emerald-500 animate-pulse' : 'text-red-500'}
              />
              {error ? 'Map error' : loaded ? 'Live' : 'Loading…'}
            </span>
          </div>
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#FAFAF7]">
            <div className="text-center max-w-md p-8 bg-white rounded-2xl shadow border border-red-100">
              <AlertTriangle size={36} className="text-red-500 mx-auto mb-3" />
              <h2 className="text-base font-bold text-[#0F2B4C] mb-2">Map unavailable</h2>
              <p className="text-sm text-gray-500 leading-relaxed mb-3">{error}</p>
              <p className="text-xs text-gray-400">
                Set <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-[#3A7BD5]">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> in
                Vercel project settings, then redeploy.
                Make sure the key has <strong>Maps JavaScript API</strong> enabled.
              </p>
            </div>
          </div>
        ) : (
          <div ref={mapEl} className="absolute inset-0" />
        )}
      </div>
    </div>
  );
}
