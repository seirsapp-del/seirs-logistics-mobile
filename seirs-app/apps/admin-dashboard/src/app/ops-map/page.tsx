'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Map as MapIcon, Radio, AlertTriangle, Truck, CircleDot, Store, Flame, Route,
} from 'lucide-react';
import { adminApi } from '@/lib/api';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';

// ── Lazy Google Maps loader ──────────────────────────────────────────────────
let _mapsPromise: Promise<any> | null = null;
function loadGoogleMaps(key: string): Promise<any> {
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

interface DriverPin   { id: string; name: string; lat: number; lng: number; isOnline: boolean; lastSeen?: string; }
interface DeliveryPin { id: string; trackingCode: string; pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number; status: string; }
interface StorePin    { id: string; storeName: string; storeAddress: string; lat: number; lng: number; acceptingNew: boolean; }
interface PendingPin  { id: string; trackingCode: string; lat: number; lng: number; ageMinutes: number; }

const DEFAULT_CENTER = { lat: 6.5244, lng: 3.3792 };

// Layer registry: which overlays are on. Persisted per-admin in
// localStorage so the ops person's preferred view survives reloads.
type LayerKey = 'online' | 'offline' | 'requests' | 'stores' | 'routes' | 'heat';
const LAYER_STORAGE = 'seirs_opsmap_layers';
const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  online: true, offline: false, requests: true, stores: true, routes: true, heat: false,
};

export default function OpsMapPage() {
  const mapEl        = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const markersRef   = useRef<globalThis.Map<string, any>>(new globalThis.Map());
  const polylinesRef = useRef<any[]>([]);
  const heatmapRef   = useRef<any>(null);
  const infoRef      = useRef<any>(null); // singleton InfoWindow

  const [drivers,    setDrivers]    = useState<DriverPin[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryPin[]>([]);
  const [stores,     setStores]     = useState<StorePin[]>([]);
  const [pending,    setPending]    = useState<PendingPin[]>([]);
  const [heatPts,    setHeatPts]    = useState<Array<{ lat: number; lng: number }>>([]);
  const [missingCoords, setMissingCoords] = useState(0);
  const [error,      setError]      = useState<string | null>(null);
  const [loaded,     setLoaded]     = useState(false);
  const [layers,     setLayers]     = useState<Record<LayerKey, boolean>>(DEFAULT_LAYERS);

  // Restore layer prefs
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYER_STORAGE);
      if (saved) setLayers({ ...DEFAULT_LAYERS, ...JSON.parse(saved) });
    } catch { /* defaults */ }
  }, []);
  const toggleLayer = (k: LayerKey) => {
    setLayers(prev => {
      const next = { ...prev, [k]: !prev[k] };
      try { localStorage.setItem(LAYER_STORAGE, JSON.stringify(next)); } catch {}
      return next;
    });
  };

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
        new g.maps.TrafficLayer().setMap(mapRef.current);
        infoRef.current = new g.maps.InfoWindow();
        setLoaded(true);
      })
      .catch((e) => setError(e?.message ?? 'Failed to load Google Maps'));
    return () => { cancelled = true; };
  }, []);

  // ── Poll every 10s ──
  useEffect(() => {
    if (!loaded) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
      try {
        const [d, ds, st, dm] = await Promise.all([
          adminApi.opsMap.onlineDrivers().catch(() => []),
          adminApi.opsMap.activeDeliveries().catch(() => []),
          adminApi.opsMap.stores().catch(() => null),
          adminApi.opsMap.demand().catch(() => null),
        ]);
        if (Array.isArray(d))  setDrivers(d as DriverPin[]);
        if (Array.isArray(ds)) setDeliveries(ds as DeliveryPin[]);
        if (st) { setStores(st.stores ?? []); setMissingCoords(st.missingCoords ?? 0); }
        if (dm) { setPending(dm.pending ?? []); setHeatPts(dm.heat ?? []); }
      } catch { /* stale data beats a blank map */ }
    }
    refresh();
    timer = setInterval(refresh, 10_000);
    return () => { if (timer) clearInterval(timer); };
  }, [loaded]);

  // ── Unified marker render (drivers + requests + stores) ──
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapRef.current) return;
    const seen = new Set<string>();

    const upsert = (
      id: string, pos: { lat: number; lng: number }, icon: any, title: string, html: string,
    ) => {
      seen.add(id);
      let m = markersRef.current.get(id);
      if (m) {
        m.setPosition(pos);
        m.setIcon(icon);
        m.__html = html;
      } else {
        m = new g.maps.Marker({ position: pos, map: mapRef.current, title, icon });
        m.__html = html;
        m.addListener('click', () => {
          infoRef.current?.setContent(m.__html);
          infoRef.current?.open({ map: mapRef.current, anchor: m });
        });
        markersRef.current.set(id, m);
      }
    };

    // Drivers - green online / gray offline (last-known position)
    drivers.forEach((d) => {
      const show = d.isOnline ? layers.online : layers.offline;
      if (!show) return;
      const lastSeen = d.lastSeen ? new Date(d.lastSeen).toLocaleString() : 'unknown';
      upsert(
        `drv:${d.id}`,
        { lat: d.lat, lng: d.lng },
        {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: d.isOnline ? '#16A34A' : '#9CA3AF',
          fillOpacity: d.isOnline ? 1 : 0.75,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
        d.name,
        `<div style="font:13px system-ui"><b>${d.name}</b><br/>` +
        (d.isOnline
          ? '<span style="color:#16A34A">● Online now</span>'
          : `<span style="color:#6B7280">○ Offline</span><br/><small>Last seen: ${lastSeen}</small>`) +
        `</div>`,
      );
    });

    // Pending requests - orange, sized/red-shifted by age
    if (layers.requests) {
      pending.forEach((p) => {
        const urgent = p.ageMinutes >= 15;
        upsert(
          `req:${p.id}`,
          { lat: p.lat, lng: p.lng },
          {
            path: g.maps.SymbolPath.CIRCLE,
            scale: urgent ? 9 : 7,
            fillColor: urgent ? '#DC2626' : '#F59E0B',
            fillOpacity: 0.95,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
          p.trackingCode,
          `<div style="font:13px system-ui"><b>Unassigned request</b><br/>${p.trackingCode}<br/>` +
          `<small>Waiting ${p.ageMinutes} min${urgent ? ' · <b style="color:#DC2626">needs attention</b>' : ''}</small></div>`,
        );
      });
    }

    // Partner stores - navy squares
    if (layers.stores) {
      stores.forEach((s) => {
        upsert(
          `store:${s.id}`,
          { lat: s.lat, lng: s.lng },
          {
            path: 'M -6 -6 L 6 -6 L 6 6 L -6 6 Z',
            scale: 1,
            fillColor: s.acceptingNew ? '#0F2B4C' : '#94A3B8',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 1.5,
          },
          s.storeName,
          `<div style="font:13px system-ui"><b>${s.storeName}</b><br/><small>${s.storeAddress}</small><br/>` +
          (s.acceptingNew
            ? '<span style="color:#16A34A">Accepting drop-offs</span>'
            : '<span style="color:#D97706">Paused</span>') +
          `</div>`,
        );
      });
    }

    // Remove markers whose layer is now off or whose entity vanished
    Array.from(markersRef.current.entries()).forEach(([id, m]) => {
      if (!seen.has(id)) { m.setMap(null); markersRef.current.delete(id); }
    });
  }, [drivers, pending, stores, layers]);

  // ── Delivery route polylines ──
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapRef.current) return;
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = !layers.routes ? [] : deliveries.map((dv) => new g.maps.Polyline({
      path: [{ lat: dv.pickupLat, lng: dv.pickupLng }, { lat: dv.dropoffLat, lng: dv.dropoffLng }],
      strokeColor:   dv.status === 'in_transit' ? '#3A7BD5' : '#D97706',
      strokeOpacity: 0.7,
      strokeWeight:  3,
      map:           mapRef.current,
    }));
  }, [deliveries, layers.routes]);

  // ── DEMAND heat (24h pickup density - real demand, not driver blur) ──
  useEffect(() => {
    const g = (window as any).google;
    if (!g || !mapRef.current) return;
    heatmapRef.current?.setMap(null);
    if (!layers.heat || heatPts.length === 0) { heatmapRef.current = null; return; }
    heatmapRef.current = new g.maps.visualization.HeatmapLayer({
      data:   heatPts.map((p) => new g.maps.LatLng(p.lat, p.lng)),
      radius: 34,
      map:    mapRef.current,
    });
  }, [layers.heat, heatPts]);

  const onlineCount  = drivers.filter((d) => d.isOnline).length;
  const offlineCount = drivers.length - onlineCount;

  const CHIPS: Array<{ key: LayerKey; label: string; count?: number; color: string; Icon: any; title: string }> = [
    { key: 'online',   label: 'Online',   count: onlineCount,   color: '#16A34A', Icon: Truck,     title: 'Live driver positions' },
    { key: 'offline',  label: 'Offline',  count: offlineCount,  color: '#9CA3AF', Icon: CircleDot, title: 'Last-known positions of offline drivers' },
    { key: 'requests', label: 'Requests', count: pending.length, color: '#F59E0B', Icon: AlertTriangle, title: 'Unassigned pickups waiting for a driver (red = waiting 15+ min)' },
    { key: 'stores',   label: 'Stores',   count: stores.length,  color: '#0F2B4C', Icon: Store,     title: 'Partner store locations' },
    { key: 'routes',   label: 'Routes',   count: deliveries.length, color: '#3A7BD5', Icon: Route,  title: 'Active delivery routes' },
    { key: 'heat',     label: 'Demand',                          color: '#DC2626', Icon: Flame,     title: 'Pickup density over the last 24h - where the volume is' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <MapIcon size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Real-Time Ops Map</h1>
            <p className="text-xs text-gray-500">Click a chip to toggle its layer · click any pin for details</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {missingCoords > 0 && (
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full"
                title="Stores without coordinates cannot appear on the map. New partner applications capture coords automatically.">
                {missingCoords} store{missingCoords === 1 ? '' : 's'} missing coords
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
              <Radio size={12} className={loaded && !error ? 'text-emerald-500 animate-pulse' : 'text-red-500'} />
              {error ? 'Map error' : loaded ? 'Live' : 'Loading…'}
            </span>
          </div>
        </div>

        {/* Layer chips */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {CHIPS.map(({ key, label, count, color, Icon, title }) => {
            const active = layers[key];
            return (
              <button
                key={key}
                onClick={() => toggleLayer(key)}
                title={title}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
                style={active ? { backgroundColor: color } : undefined}
              >
                <Icon size={12} />
                {label}
                {count != null && (
                  <span className={`rounded-full px-1.5 text-[10px] font-bold ${active ? 'bg-white/25' : 'bg-gray-100'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
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
