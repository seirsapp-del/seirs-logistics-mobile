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
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  lat:    number;
  lng:    number;
  label:  string;
  kind:   'pickup' | 'stop' | 'driver' | 'store';
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
  // A partner counter, for the pin on a store's profile (2026-09-03).
  // Navy rather than the pickup blue: on a store page it is the only
  // pin on the map and should not read as one leg of a route.
  store:  '#0F2B4C',
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
  /**
   * The viewport is fitted once and then left alone.
   *
   * While a run is live this redraws every 15 seconds as the driver
   * moves, and re-fitting on each of those would snatch the map back
   * from anyone who had panned or zoomed to look at something. Markers
   * still move; the camera stays where the human put it.
   */
  const fittedRef = useRef(false);
  /** Last known extent of the run, so "Fit route" always has a target. */
  const boundsRef = useRef<L.LatLngBounds | null>(null);

  // Create once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: true,
      attributionControl: true,
      /**
       * The map sits in the middle of a scrolling page, and Leaflet
       * grabs the wheel for zoom by default, so scrolling the order page
       * with the pointer over the map zoomed the map instead of moving
       * the page. Use the +/- controls to zoom; dragging to pan still
       * works (device check 2026-08-19).
       */
      scrollWheelZoom: false,
    });
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
    if (all.length > 1) boundsRef.current = L.latLngBounds(all as any);

    if (fittedRef.current) return;
    if (all.length === 1) { map.setView(all[0] as any, 14); fittedRef.current = true; }
    else if (all.length > 1) {
      map.fitBounds(boundsRef.current!, { padding: [36, 36] });
      fittedRef.current = true;
    }
  }, [points, trail]);

  const fitRoute = () => {
    const map = mapRef.current;
    if (!map) return;
    if (boundsRef.current) map.fitBounds(boundsRef.current, { padding: [36, 36] });
    else {
      const one = points.find(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      if (one) map.setView([one.lat, one.lng], 14);
    }
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div ref={elRef} style={{ height, width: '100%', borderRadius: 10, overflow: 'hidden' }} />
        <button
          type="button"
          onClick={fitRoute}
          title="Bring the whole run back into view"
          style={{
            position: 'absolute', right: 10, top: 10, zIndex: 500,
            background: '#fff', border: '1px solid #C7CDD4', borderRadius: 6,
            padding: '4px 9px', fontSize: 11, fontWeight: 600,
            color: '#0F2B4C', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }}
        >
          Fit route
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[#0F2B4C]/50">
        <span><span style={{ color: COLOR.pickup }}>&#9679;</span> Pickup</span>
        <span><span style={{ color: COLOR.stop }}>&#9679;</span> Stops, numbered in order</span>
        <span><span style={{ color: COLOR.driver }}>&#9679;</span> Driver now, solid line is where they have been</span>
        <span className="ml-auto">Tiles: OpenStreetMap. No Google billing on this map.</span>
      </div>
    </div>
  );
}
