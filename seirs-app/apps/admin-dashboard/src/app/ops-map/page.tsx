'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Map as MapIcon, Radio, AlertTriangle, Truck, CircleDot, Store, Flame, Route,
  Search, Ruler, X,
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
    script.src    = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=visualization,places,geometry&v=quarterly`;
    script.async  = true;
    script.defer  = true;
    script.onload  = () => resolve((window as any).google);
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
  return _mapsPromise;
}

interface DriverPin   { id: string; name: string; lat: number; lng: number; isOnline: boolean; lastSeen?: string; }
interface DeliveryPin { id: string; trackingCode: string; pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number; status: string; kind?: string; }
interface StorePin    { id: string; storeName: string; storeAddress: string; lat: number; lng: number; acceptingNew: boolean; }
interface PendingPin  { id: string; trackingCode: string; lat: number; lng: number; ageMinutes: number; }

const DEFAULT_CENTER = { lat: 6.5244, lng: 3.3792 };

// Google Maps parses InfoWindow content as HTML, so every value
// interpolated into these strings is an injection point. A driver who
// sets their name to an <img onerror=...> payload would have run script
// in the dashboard origin, where the admin session token lives, the
// moment ops clicked their pin. `label` is worse still: it arrives
// straight off the ?label= query param, so the attack needed no account
// at all, just a link. Escape at the boundary, every time.
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  const searchInputRef  = useRef<HTMLInputElement>(null);
  const searchMarkerRef = useRef<any>(null);   // the temporary "found it" pin
  const measureOnRef    = useRef(false);       // read inside the map click listener
  const measureRef      = useRef<{ points: any[]; markers: any[]; line: any; route: any }>({
    points: [], markers: [], line: null, route: null,
  });

  const [drivers,    setDrivers]    = useState<DriverPin[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryPin[]>([]);
  const [stores,     setStores]     = useState<StorePin[]>([]);
  const [pending,    setPending]    = useState<PendingPin[]>([]);
  const [heatPts,    setHeatPts]    = useState<Array<{ lat: number; lng: number }>>([]);
  const [sosAlerts,  setSosAlerts]  = useState<any[]>([]);
  const [missingCoords, setMissingCoords] = useState(0);
  const [error,      setError]      = useState<string | null>(null);
  const [loaded,     setLoaded]     = useState(false);
  const [layers,     setLayers]     = useState<Record<LayerKey, boolean>>(DEFAULT_LAYERS);
  const [measureOn,  setMeasureOn]  = useState(false);
  const [measure,    setMeasure]    = useState<{
    straightKm: number; roadKm: number | null; roadMin: number | null; pending: boolean;
  } | null>(null);

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

        // Deep link: /ops-map?lat=..&lng=..&label=.. centers the map and
        // drops a labeled pin (driver pages link their last-known fix here).
        try {
          const q = new URLSearchParams(window.location.search);
          const qlat = parseFloat(q.get('lat') ?? '');
          const qlng = parseFloat(q.get('lng') ?? '');
          if (Number.isFinite(qlat) && Number.isFinite(qlng)) {
            const pos = { lat: qlat, lng: qlng };
            mapRef.current.setCenter(pos);
            mapRef.current.setZoom(15);
            dropSearchPin(g, pos, q.get('label') ?? `${qlat.toFixed(5)}, ${qlng.toFixed(5)}`);
          }
        } catch { /* bad params just load the normal map */ }

        // Measure tool: clicks land here; the ref dodges the stale-closure
        // trap (this listener is registered once, state changes later).
        mapRef.current.addListener('click', (e: any) => {
          if (!measureOnRef.current || !e?.latLng) return;
          addMeasurePoint(g, e.latLng);
        });

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
        const [d, ds, st, dm, sos] = await Promise.all([
          adminApi.opsMap.onlineDrivers().catch(() => []),
          adminApi.opsMap.activeDeliveries().catch(() => []),
          adminApi.opsMap.stores().catch(() => null),
          adminApi.opsMap.demand().catch(() => null),
          adminApi.sos.active().catch(() => [] as any[]),
        ]);
        if (Array.isArray(d))  setDrivers(d as DriverPin[]);
        if (Array.isArray(ds)) setDeliveries(ds as DeliveryPin[]);
        if (st) { setStores(st.stores ?? []); setMissingCoords(st.missingCoords ?? 0); }
        if (dm) { setPending(dm.pending ?? []); setHeatPts(dm.heat ?? []); }
        if (Array.isArray(sos)) setSosAlerts(sos.filter((a: any) => a.lat != null));
      } catch { /* stale data beats a blank map */ }
    }
    refresh();
    timer = setInterval(refresh, 10_000);
    return () => { if (timer) clearInterval(timer); };
  }, [loaded]);

  // ── Unified marker render (drivers + requests + stores) ──
  useEffect(() => {
    try {
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
        `<div style="font:13px system-ui"><b>${esc(d.name)}</b><br/>` +
        (d.isOnline
          ? '<span style="color:#16A34A">● Online now</span>'
          : `<span style="color:#6B7280">○ Offline</span><br/><small>Last seen: ${esc(lastSeen)}</small>`) +
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
          `<div style="font:13px system-ui"><b>Unassigned request</b><br/>${esc(p.trackingCode)}<br/>` +
          `<small>Waiting ${esc(p.ageMinutes)} min${urgent ? ' · <b style="color:#DC2626">needs attention</b>' : ''}</small></div>`,
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
          `<div style="font:13px system-ui"><b>${esc(s.storeName)}</b><br/><small>${esc(s.storeAddress)}</small><br/>` +
          (s.acceptingNew
            ? '<span style="color:#16A34A">Accepting drop-offs</span>'
            : '<span style="color:#D97706">Paused</span>') +
          `</div>`,
        );
      });
    }

    // SOS flares (founder 2026-08-23): an open alert burns red on the
    // live map, always on: no layer chip can hide an emergency.
    sosAlerts.forEach((a) => {
      upsert(
        `sos:${a.id}`,
        { lat: Number(a.lat), lng: Number(a.lng) },
        {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 13,
          fillColor: '#DC2626',
          fillOpacity: 0.95,
          strokeColor: '#fff',
          strokeWeight: 3,
        },
        'SOS',
        `<div style="font:13px system-ui"><b style="color:#DC2626">🚨 SOS · ${esc(a.user?.name ?? 'Unknown')}</b><br/>` +
        `<small>${esc(a.user?.phone ?? '')} · raised ${esc(new Date(a.createdAt).toLocaleTimeString())}</small><br/>` +
        `<a href="/sos">Open the SOS desk</a></div>`,
      );
    });

    // Remove markers whose layer is now off or whose entity vanished
    Array.from(markersRef.current.entries()).forEach(([id, m]) => {
      if (!seen.has(id)) { m.setMap(null); markersRef.current.delete(id); }
    });
    } catch { /* a bad pin must not kill the page */ }
  }, [drivers, pending, stores, layers, sosAlerts]);

  // ── Delivery route polylines ──
  useEffect(() => {
    try {
    const g = (window as any).google;
    if (!g || !mapRef.current) return;
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = !layers.routes ? [] : deliveries.map((dv) => new g.maps.Polyline({
      path: [{ lat: dv.pickupLat, lng: dv.pickupLng }, { lat: dv.dropoffLat, lng: dv.dropoffLng }],
      strokeColor:   dv.kind === 'ride' ? '#6366F1' : dv.status === 'in_transit' ? '#3A7BD5' : '#D97706',
      strokeOpacity: 0.7,
      strokeWeight:  3,
      map:           mapRef.current,
    }));
    } catch { /* routes are decoration too */ }
  }, [deliveries, layers.routes]);

  // ── DEMAND heat (24h pickup density - real demand, not driver blur) ──
  // HeatmapLayer was deprecated and then removed from newer Maps JS
  // channels; when it is absent the demand layer degrades to translucent
  // circles instead of killing the page (this exact throw is what sent
  // the whole ops map to the error boundary, 2026-08-22).
  useEffect(() => {
    try {
      const g = (window as any).google;
      if (!g || !mapRef.current) return;
      if (Array.isArray(heatmapRef.current)) {
        heatmapRef.current.forEach((c: any) => c.setMap(null));
      } else {
        heatmapRef.current?.setMap(null);
      }
      heatmapRef.current = null;
      if (!layers.heat || heatPts.length === 0) return;
      const Heat = g.maps.visualization?.HeatmapLayer;
      if (Heat) {
        heatmapRef.current = new Heat({
          data:   heatPts.map((p) => new g.maps.LatLng(p.lat, p.lng)),
          radius: 34,
          map:    mapRef.current,
        });
      } else {
        heatmapRef.current = heatPts.map((p) => new g.maps.Circle({
          center: { lat: p.lat, lng: p.lng },
          radius: 450,
          map: mapRef.current,
          fillColor: '#DC2626', fillOpacity: 0.12,
          strokeColor: '#DC2626', strokeOpacity: 0.25, strokeWeight: 1,
          clickable: false,
        }));
      }
    } catch { /* demand layer is decoration; the map must survive it */ }
  }, [layers.heat, heatPts]);

  // ── Search: address autocomplete + raw "lat, lng" jump ──
  function dropSearchPin(g: any, pos: { lat: number; lng: number }, label: string) {
    searchMarkerRef.current?.setMap(null);
    const m = new g.maps.Marker({
      position: pos, map: mapRef.current, title: label, zIndex: 999,
      icon: {
        path: 'M 0 -22 C -7 -22 -11 -17 -11 -11 C -11 -4 0 6 0 6 C 0 6 11 -4 11 -11 C 11 -17 7 -22 0 -22 Z',
        scale: 1, fillColor: '#7C3AED', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
      },
    });
    m.addListener('click', () => {
      infoRef.current?.setContent(
        `<div style="font:13px system-ui"><b>${esc(label)}</b><br/><small>${esc(pos.lat.toFixed(6))}, ${esc(pos.lng.toFixed(6))}</small></div>`,
      );
      infoRef.current?.open({ map: mapRef.current, anchor: m });
    });
    searchMarkerRef.current = m;
  }

  function clearSearchPin() {
    searchMarkerRef.current?.setMap(null);
    searchMarkerRef.current = null;
    if (searchInputRef.current) searchInputRef.current.value = '';
  }

  // Bind Places autocomplete once the map is up. A pasted "6.45, 3.39"
  // never reaches Places: the Enter handler catches coordinates first.
  useEffect(() => {
    const g = (window as any).google;
    if (!loaded || !g?.maps?.places || !searchInputRef.current) return;
    const ac = new g.maps.places.Autocomplete(searchInputRef.current, {
      fields: ['geometry', 'name', 'formatted_address'],
      componentRestrictions: { country: 'ng' },
    });
    ac.bindTo('bounds', mapRef.current);
    ac.addListener('place_changed', () => {
      const p = ac.getPlace();
      const loc = p?.geometry?.location;
      if (!loc) return;
      const pos = { lat: loc.lat(), lng: loc.lng() };
      mapRef.current.setCenter(pos);
      mapRef.current.setZoom(15);
      dropSearchPin(g, pos, p.name || p.formatted_address || 'Search result');
    });
    return () => g.maps.event.clearInstanceListeners(ac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const onSearchEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const g = (window as any).google;
    const raw = (searchInputRef.current?.value ?? '').trim();
    const coord = raw.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (coord && g && mapRef.current) {
      e.preventDefault();
      const pos = { lat: parseFloat(coord[1]), lng: parseFloat(coord[2]) };
      if (Math.abs(pos.lat) <= 90 && Math.abs(pos.lng) <= 180) {
        mapRef.current.setCenter(pos);
        mapRef.current.setZoom(15);
        dropSearchPin(g, pos, `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
      }
    }
    // A non-coordinate Enter falls through to Places autocomplete.
  };

  // ── Measure: 2 clicks -> straight line + the actual road distance ──
  function clearMeasure() {
    const st = measureRef.current;
    st.markers.forEach((m) => m.setMap(null));
    st.line?.setMap(null);
    st.route?.setMap(null);
    measureRef.current = { points: [], markers: [], line: null, route: null };
    setMeasure(null);
  }

  function addMeasurePoint(g: any, latLng: any) {
    if (measureRef.current.points.length >= 2) clearMeasure();
    const st = measureRef.current;
    const label = st.points.length === 0 ? 'A' : 'B';
    st.points.push(latLng);
    st.markers.push(new g.maps.Marker({
      position: latLng, map: mapRef.current, zIndex: 998,
      label: { text: label, color: '#fff', fontSize: '11px', fontWeight: '700' },
      icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#0F2B4C', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
    }));
    if (st.points.length < 2) return;

    const [a, b] = st.points;
    const straightKm = g.maps.geometry.spherical.computeDistanceBetween(a, b) / 1000;
    st.line = new g.maps.Polyline({
      path: [a, b], map: mapRef.current, strokeOpacity: 0,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#7C3AED', scale: 3 }, offset: '0', repeat: '14px' }],
    });
    setMeasure({ straightKm, roadKm: null, roadMin: null, pending: true });

    // Road distance: same Directions engine the pricing quote uses, so
    // what the admin measures matches what the customer was charged for.
    new g.maps.DirectionsService().route(
      { origin: a, destination: b, travelMode: g.maps.TravelMode.DRIVING },
      (res: any, status: string) => {
        if (status === 'OK' && res?.routes?.[0]?.legs?.[0]) {
          const leg = res.routes[0].legs[0];
          measureRef.current.route = new g.maps.Polyline({
            path: res.routes[0].overview_path, map: mapRef.current,
            strokeColor: '#0F2B4C', strokeOpacity: 0.85, strokeWeight: 4, zIndex: 5,
          });
          setMeasure({
            straightKm,
            roadKm:  (leg.distance?.value ?? 0) / 1000,
            roadMin: Math.round((leg.duration?.value ?? 0) / 60),
            pending: false,
          });
        } else {
          setMeasure({ straightKm, roadKm: null, roadMin: null, pending: false });
        }
      },
    );
  }

  const toggleMeasure = () => {
    const next = !measureOn;
    setMeasureOn(next);
    measureOnRef.current = next;
    if (!next) clearMeasure();
    if (mapRef.current) mapRef.current.setOptions({ draggableCursor: next ? 'crosshair' : null });
  };

  const onlineCount  = drivers.filter((d) => d.isOnline).length;
  const offlineCount = drivers.length - onlineCount;

  const CHIPS: Array<{ key: LayerKey; label: string; count?: number; color: string; Icon: any; title: string }> = [
    { key: 'online',   label: 'Online',   count: onlineCount,   color: '#16A34A', Icon: Truck,     title: 'Live driver positions' },
    { key: 'offline',  label: 'Offline',  count: offlineCount,  color: '#9CA3AF', Icon: CircleDot, title: 'Last-known positions of offline drivers' },
    { key: 'requests', label: 'Requests', count: pending.length, color: '#F59E0B', Icon: AlertTriangle, title: 'Unassigned pickups waiting for a driver (red = waiting 15+ min)' },
    { key: 'stores',   label: 'Stores',   count: stores.length,  color: '#0F2B4C', Icon: Store,     title: 'Partner store locations' },
    { key: 'routes',   label: 'Routes',   count: deliveries.length, color: '#3A7BD5', Icon: Route,  title: 'Active routes: blue/amber = packages, indigo = rides' },
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

        {/* Search + measure + layer chips */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              onKeyDown={onSearchEnter}
              placeholder='Search address, or paste "6.45231, 3.39187"'
              className="w-72 rounded-full border border-gray-200 bg-white pl-8 pr-7 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]/30"
              title="Type an address (autocomplete) or paste raw lat, lng coordinates and press Enter"
            />
            <button
              onClick={clearSearchPin}
              title="Clear search pin"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
            >
              <X size={12} />
            </button>
          </div>
          <button
            onClick={toggleMeasure}
            title="Measure a distance: click two points on the map to get the straight-line AND road distance"
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              measureOn ? 'bg-[#7C3AED] text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Ruler size={12} />
            Measure
          </button>
          <span className="h-5 w-px bg-gray-200" />
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
          <>
            <div ref={mapEl} className="absolute inset-0" />
            {measureOn && (
              <div className="absolute bottom-4 left-4 z-10 rounded-xl bg-white shadow-lg border border-gray-200 px-4 py-3 max-w-xs">
                {!measure ? (
                  <p className="text-xs text-gray-500">
                    <b className="text-[#7C3AED]">Measure mode.</b> Click point A, then point B on the map.
                  </p>
                ) : (
                  <div className="text-xs text-gray-700 space-y-1">
                    <div className="flex justify-between gap-6">
                      <span className="text-gray-500">Straight line</span>
                      <b>{measure.straightKm.toFixed(2)} km</b>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span className="text-gray-500">By road</span>
                      <b>
                        {measure.pending
                          ? 'calculating…'
                          : measure.roadKm != null
                            ? `${measure.roadKm.toFixed(2)} km · ~${measure.roadMin} min drive`
                            : 'no road route found'}
                      </b>
                    </div>
                    <button onClick={clearMeasure} className="mt-1 text-[11px] font-semibold text-[#3A7BD5] hover:underline">
                      Measure another
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
