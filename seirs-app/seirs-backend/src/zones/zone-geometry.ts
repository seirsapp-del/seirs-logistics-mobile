import {
  detectStateFromCoords, getState, getStateZone, NIGERIAN_STATES,
  type StateCode,
} from '../pricing/regions';
import type { Zone, ZoneShape } from './zone.entity';

/**
 * Where a point is, in the only two forms the engine ever has.
 *
 * Coordinates are the preferred form. A state code is the fallback for
 * address-only paths (CSV bulk upload, an integrator that posts a state
 * name and nothing else). Circle and polygon zones need real coords and
 * simply do not resolve without them; state and geozone zones resolve
 * from either. That asymmetry is honest rather than hidden: a drawn
 * circle cannot be evaluated against an address nobody geocoded.
 */
export interface ZonePoint {
  coords?: { latitude: number; longitude: number } | null;
  stateCode?: StateCode | null;
}

/** Straight-line km. Circle membership needs no more than this. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Ray casting on the raw lat/lng ring. Nigeria is far from a pole, so no projection is needed. */
function pointInPolygon(lat: number, lng: number, points: Array<{ lat: number; lng: number }>): boolean {
  if (!Array.isArray(points) || points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const yi = Number(points[i].lat), xi = Number(points[i].lng);
    const yj = Number(points[j].lat), xj = Number(points[j].lng);
    if (!Number.isFinite(yi) || !Number.isFinite(xi) || !Number.isFinite(yj) || !Number.isFinite(xj)) continue;
    const straddles = (yi > lat) !== (yj > lat);
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Resolve the point's state once, from coords if present, from the explicit code otherwise. */
export function stateOf(point: ZonePoint): StateCode | null {
  if (point.stateCode) return point.stateCode;
  if (point.coords && Number.isFinite(point.coords.latitude) && Number.isFinite(point.coords.longitude)) {
    return detectStateFromCoords(point.coords.latitude, point.coords.longitude);
  }
  return null;
}

/** Does this shape contain the point? */
export function shapeContains(shape: ZoneShape, point: ZonePoint): boolean {
  if (!shape || typeof shape !== 'object') return false;
  switch (shape.kind) {
    case 'circle': {
      if (!point.coords) return false;
      const r = Number(shape.radiusKm);
      if (!Number.isFinite(shape.lat) || !Number.isFinite(shape.lng) || !(r > 0)) return false;
      return haversineKm(point.coords.latitude, point.coords.longitude, Number(shape.lat), Number(shape.lng)) <= r;
    }
    case 'polygon': {
      if (!point.coords) return false;
      return pointInPolygon(point.coords.latitude, point.coords.longitude, shape.points ?? []);
    }
    case 'state':
      return !!shape.stateCode && stateOf(point) === shape.stateCode;
    case 'geozone': {
      const st = stateOf(point);
      return !!shape.geozone && !!st && getStateZone(st) === shape.geozone;
    }
    default:
      return false;
  }
}

/**
 * Approximate square km, used ONLY to break priority ties.
 *
 * Ties break to the SMALLEST shape because the tighter shape is the more
 * deliberate call: the existing hotspot code already resolves overlapping
 * circles that way, so this stays familiar to whoever tuned it. Every
 * shape kind has to land on one comparable scale or a circle inside a
 * state could never be told apart from the state itself.
 */
export function shapeAreaKm2(shape: ZoneShape): number {
  if (!shape || typeof shape !== 'object') return Number.MAX_SAFE_INTEGER;
  switch (shape.kind) {
    case 'circle': {
      const r = Number(shape.radiusKm);
      return r > 0 ? Math.PI * r * r : Number.MAX_SAFE_INTEGER;
    }
    case 'polygon':
      return polygonAreaKm2(shape.points ?? []);
    case 'state':
      return bboxAreaKm2(getState(shape.stateCode as string)?.bbox);
    case 'geozone': {
      // A geopolitical zone is the union of its states, so its size is
      // the sum of theirs. That keeps a zone strictly larger than any
      // state inside it, which is what makes the tie-break sane.
      let total = 0;
      for (const s of NIGERIAN_STATES) {
        if (s.zone === shape.geozone) total += bboxAreaKm2(s.bbox);
      }
      return total > 0 ? total : Number.MAX_SAFE_INTEGER;
    }
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

const KM_PER_DEG_LAT = 111.32;

function bboxAreaKm2(bbox?: [number, number, number, number]): number {
  if (!bbox) return Number.MAX_SAFE_INTEGER;
  const [latMin, latMax, lngMin, lngMax] = bbox;
  const midLat = (latMin + latMax) / 2;
  const hKm = (latMax - latMin) * KM_PER_DEG_LAT;
  const wKm = (lngMax - lngMin) * KM_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  return Math.max(0, hKm * wKm);
}

/** Shoelace on an equirectangular projection. Accurate enough to rank two shapes. */
function polygonAreaKm2(points: Array<{ lat: number; lng: number }>): number {
  if (!Array.isArray(points) || points.length < 3) return Number.MAX_SAFE_INTEGER;
  const midLat = points.reduce((s, p) => s + Number(p.lat), 0) / points.length;
  const cos = Math.cos((midLat * Math.PI) / 180);
  let acc = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = Number(points[i].lng) * KM_PER_DEG_LAT * cos;
    const yi = Number(points[i].lat) * KM_PER_DEG_LAT;
    const xj = Number(points[j].lng) * KM_PER_DEG_LAT * cos;
    const yj = Number(points[j].lat) * KM_PER_DEG_LAT;
    acc += xj * yi - xi * yj;
  }
  const area = Math.abs(acc) / 2;
  return area > 0 ? area : Number.MAX_SAFE_INTEGER;
}

/** Sort key used everywhere a single winner has to be picked from an overlap. */
export function zoneOrdering(a: Zone, b: Zone): number {
  const p = Number(b.priority ?? 0) - Number(a.priority ?? 0);
  if (p !== 0) return p;
  return shapeAreaKm2(a.shape) - shapeAreaKm2(b.shape);
}
