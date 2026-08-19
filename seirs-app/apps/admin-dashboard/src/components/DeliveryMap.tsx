'use client';
/**
 * The route for one delivery, on a map, with the driver on it live.
 *
 * Route used to be two lines of text, so answering "where is my package"
 * meant reading coordinates to somebody (founder 2026-08-19).
 *
 * Deliberately NOT Google. The ops-map page loads the Google Maps JS API,
 * which bills per map load, and the founder asked to avoid paying Google
 * more than necessary. Tiles here come from OpenStreetMap and cost
 * nothing, which matters because an ops team opens this page all day.
 *
 * Nothing here calls a routing API either. The line between stops is
 * drawn straight, and the driver's actual path is drawn from the GPS
 * trail SEIRS already collects. Directions and Distance Matrix are the
 * expensive calls and neither is needed to answer where something is.
 *
 * The driver marker updates from our own socket, so following a driver
 * live costs nothing per refresh. That is why this follows automatically
 * while a delivery is active rather than making someone press a button:
 * a manual refresh only makes sense when each look costs money.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapPoint {
  lat:    number;
  lng:    number;
  label:  string;
  kind:   'pickup' | 'stop' | 'driver';
  detail?: string;
}

interface Props {
  points:  MapPoint[];
  /** Breadcrumb of where the driver has actually been, oldest first. */
  trail?:  Array<{ lat: number; lng: number }>;
  height?: number;
}

const COLOR = {
  pickup: '#3A7BD5',
  stop:   '#15803D',
  driver: '#D97706',
};

/** Small coloured pin, drawn rather than fetched, so there is no image request. */
function pin(kind: MapPoint['kind'], index?: number) {
  const bg = COLOR[kind];
  const inner = kind === 'driver' ? '&#9679;' : (index != null ? String(index) : '');
  return L.divIcon({
    className: '',
    html: `<div style="
      width:26px;height:26px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);background:${bg};
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);color:#fff;font:700 11px/1 system-ui">${inner}</span>
      </div>`,
    iconSize:   [26, 26],
    iconAnchor: [13, 26],
  });
}

export default function DeliveryMap({ points, trail = [], height = 320 }: Props) {
  const elRef  = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Create once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    // Lagos, so an empty map is not the middle of the Atlantic.
    map.setView([6.5244, 3.3792], 11);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Redraw whenever the points or the trail change.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const valid = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (!valid.length) return;

    let stopNo = 0;
    for (const p of valid) {
      const idx = p.kind === 'stop' ? ++stopNo : undefined;
      L.marker([p.lat, p.lng], { icon: pin(p.kind, idx) })
        .bindPopup(`<b>${p.label}</b>${p.detail ? `<br/>${p.detail}` : ''}`)
        .addTo(layer);
    }

    // Planned order: pickup then each stop, straight lines.
    const ordered = valid.filter(p => p.kind !== 'driver').map(p => [p.lat, p.lng] as [number, number]);
    if (ordered.length > 1) {
      L.polyline(ordered, { color: COLOR.pickup, weight: 3, opacity: 0.55, dashArray: '6 6' }).addTo(layer);
    }

    // Where the driver actually went.
    if (trail.length > 1) {
      L.polyline(trail.map(t => [t.lat, t.lng] as [number, number]),
        { color: COLOR.driver, weight: 4, opacity: 0.85 }).addTo(layer);
    }

    const all = [...ordered, ...trail.map(t => [t.lat, t.lng] as [number, number])];
    if (all.length === 1) map.setView(all[0] as any, 14);
    else if (all.length > 1) map.fitBounds(L.latLngBounds(all as any), { padding: [36, 36] });
  }, [points, trail]);

  return (
    <div>
      <div ref={elRef} style={{ height, width: '100%', borderRadius: 10, overflow: 'hidden' }} />
      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[#0F2B4C]/50">
        <span><span style={{ color: COLOR.pickup }}>&#9679;</span> Pickup</span>
        <span><span style={{ color: COLOR.stop }}>&#9679;</span> Stops, numbered in order</span>
        <span><span style={{ color: COLOR.driver }}>&#9679;</span> Driver now, solid line is where they have been</span>
        <span className="ml-auto">Tiles: OpenStreetMap. No Google billing on this map.</span>
      </div>
    </div>
  );
}
