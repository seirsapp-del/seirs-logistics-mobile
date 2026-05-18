/**
 * Nigerian region taxonomy — 36 states + FCT, grouped into 6 geopolitical
 * zones. Used by the rate card to apply per-region pricing overrides,
 * detect state crossings for inter-state surcharges, and centre the map
 * on the user's actual region instead of defaulting to Lagos.
 *
 * State bounding boxes are approximate (±20km at borders) — good enough
 * for state detection at fare-calc time on the customer-app. Backend
 * does the precise polygon check with PostGIS for billing.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type GeopoliticalZone = 'NW' | 'NE' | 'NC' | 'SW' | 'SE' | 'SS';

export type StateCode =
  | 'AB' | 'AD' | 'AK' | 'AN' | 'BA' | 'BY' | 'BE' | 'BO' | 'CR' | 'DE'
  | 'EB' | 'ED' | 'EK' | 'EN' | 'FC' | 'GO' | 'IM' | 'JI' | 'KD' | 'KN'
  | 'KT' | 'KE' | 'KO' | 'KW' | 'LA' | 'NA' | 'NI' | 'OG' | 'ON' | 'OS'
  | 'OY' | 'PL' | 'RI' | 'SO' | 'TA' | 'YO' | 'ZA';

export interface NigerianState {
  code:        StateCode;
  name:        string;
  capital:     string;
  zone:        GeopoliticalZone;
  /** Approximate bbox in WGS84: [latMin, latMax, lngMin, lngMax]. */
  bbox:        [number, number, number, number];
  /** Capital city coords — used to centre the map when the state is known but no GPS. */
  capitalCoords: { latitude: number; longitude: number };
}

// ─── Geopolitical zone metadata ────────────────────────────────────────────

export const GEOPOLITICAL_ZONES: Record<GeopoliticalZone, { name: string; description: string }> = {
  NW: { name: 'North-West',    description: 'Sokoto, Kebbi, Zamfara, Katsina, Jigawa, Kano, Kaduna'         },
  NE: { name: 'North-East',    description: 'Borno, Yobe, Adamawa, Taraba, Gombe, Bauchi'                  },
  NC: { name: 'North-Central', description: 'FCT, Plateau, Nasarawa, Kogi, Kwara, Niger, Benue'            },
  SW: { name: 'South-West',    description: 'Lagos, Ogun, Oyo, Osun, Ekiti, Ondo'                          },
  SE: { name: 'South-East',    description: 'Anambra, Enugu, Imo, Abia, Ebonyi'                            },
  SS: { name: 'South-South',   description: 'Edo, Delta, Bayelsa, Rivers, Akwa Ibom, Cross River'          },
};

// ─── All 37 federating units ───────────────────────────────────────────────

export const NIGERIAN_STATES: readonly NigerianState[] = [
  // South-West
  { code: 'LA', name: 'Lagos',        capital: 'Ikeja',        zone: 'SW', bbox: [ 6.30,  6.85,  2.70,  4.40], capitalCoords: { latitude:  6.6018, longitude:  3.3515 } },
  { code: 'OG', name: 'Ogun',         capital: 'Abeokuta',     zone: 'SW', bbox: [ 6.40,  7.90,  2.60,  4.55], capitalCoords: { latitude:  7.1475, longitude:  3.3619 } },
  { code: 'OY', name: 'Oyo',          capital: 'Ibadan',       zone: 'SW', bbox: [ 7.30,  9.10,  2.60,  4.60], capitalCoords: { latitude:  7.3776, longitude:  3.9470 } },
  { code: 'OS', name: 'Osun',         capital: 'Osogbo',       zone: 'SW', bbox: [ 7.00,  8.10,  4.20,  5.30], capitalCoords: { latitude:  7.7714, longitude:  4.5567 } },
  { code: 'EK', name: 'Ekiti',        capital: 'Ado-Ekiti',    zone: 'SW', bbox: [ 7.40,  8.10,  4.80,  5.70], capitalCoords: { latitude:  7.6213, longitude:  5.2210 } },
  { code: 'ON', name: 'Ondo',         capital: 'Akure',        zone: 'SW', bbox: [ 5.70,  7.70,  4.40,  6.30], capitalCoords: { latitude:  7.2526, longitude:  5.1931 } },

  // South-East
  { code: 'AN', name: 'Anambra',      capital: 'Awka',         zone: 'SE', bbox: [ 5.70,  6.90,  6.60,  7.40], capitalCoords: { latitude:  6.2107, longitude:  7.0747 } },
  { code: 'EN', name: 'Enugu',        capital: 'Enugu',        zone: 'SE', bbox: [ 6.00,  7.10,  7.00,  8.00], capitalCoords: { latitude:  6.5244, longitude:  7.5106 } },
  { code: 'IM', name: 'Imo',          capital: 'Owerri',       zone: 'SE', bbox: [ 5.20,  6.00,  6.60,  7.70], capitalCoords: { latitude:  5.4840, longitude:  7.0351 } },
  { code: 'AB', name: 'Abia',         capital: 'Umuahia',      zone: 'SE', bbox: [ 4.90,  6.10,  7.30,  8.00], capitalCoords: { latitude:  5.5320, longitude:  7.4860 } },
  { code: 'EB', name: 'Ebonyi',       capital: 'Abakaliki',    zone: 'SE', bbox: [ 5.80,  6.80,  7.40,  8.50], capitalCoords: { latitude:  6.3249, longitude:  8.1137 } },

  // South-South
  { code: 'ED', name: 'Edo',          capital: 'Benin City',   zone: 'SS', bbox: [ 5.60,  7.60,  5.00,  6.70], capitalCoords: { latitude:  6.3350, longitude:  5.6037 } },
  { code: 'DE', name: 'Delta',        capital: 'Asaba',        zone: 'SS', bbox: [ 5.00,  6.80,  5.00,  6.80], capitalCoords: { latitude:  6.1980, longitude:  6.7333 } },
  { code: 'BY', name: 'Bayelsa',      capital: 'Yenagoa',      zone: 'SS', bbox: [ 4.30,  5.50,  5.30,  6.50], capitalCoords: { latitude:  4.9267, longitude:  6.2676 } },
  { code: 'RI', name: 'Rivers',       capital: 'Port Harcourt',zone: 'SS', bbox: [ 4.40,  5.70,  6.30,  7.60], capitalCoords: { latitude:  4.8156, longitude:  7.0498 } },
  { code: 'AK', name: 'Akwa Ibom',    capital: 'Uyo',          zone: 'SS', bbox: [ 4.50,  5.60,  7.40,  8.40], capitalCoords: { latitude:  5.0378, longitude:  7.9091 } },
  { code: 'CR', name: 'Cross River',  capital: 'Calabar',      zone: 'SS', bbox: [ 5.00,  7.00,  7.90,  9.60], capitalCoords: { latitude:  4.9589, longitude:  8.3269 } },

  // North-Central
  { code: 'FC', name: 'FCT',          capital: 'Abuja',        zone: 'NC', bbox: [ 8.40,  9.40,  6.70,  7.90], capitalCoords: { latitude:  9.0765, longitude:  7.3986 } },
  { code: 'NA', name: 'Nasarawa',     capital: 'Lafia',        zone: 'NC', bbox: [ 7.40,  9.50,  7.00,  9.50], capitalCoords: { latitude:  8.4933, longitude:  8.5161 } },
  { code: 'KO', name: 'Kogi',         capital: 'Lokoja',       zone: 'NC', bbox: [ 6.60,  8.70,  5.00,  7.80], capitalCoords: { latitude:  7.8023, longitude:  6.7398 } },
  { code: 'KW', name: 'Kwara',        capital: 'Ilorin',       zone: 'NC', bbox: [ 7.70,  9.70,  2.70,  6.20], capitalCoords: { latitude:  8.4799, longitude:  4.5418 } },
  { code: 'NI', name: 'Niger',        capital: 'Minna',        zone: 'NC', bbox: [ 8.60, 12.00,  3.00,  7.00], capitalCoords: { latitude:  9.6157, longitude:  6.5569 } },
  { code: 'PL', name: 'Plateau',      capital: 'Jos',          zone: 'NC', bbox: [ 8.00, 10.40,  8.00, 10.00], capitalCoords: { latitude:  9.8965, longitude:  8.8583 } },
  { code: 'BE', name: 'Benue',        capital: 'Makurdi',      zone: 'NC', bbox: [ 6.50,  8.50,  7.50, 10.00], capitalCoords: { latitude:  7.7322, longitude:  8.5391 } },

  // North-West
  { code: 'KD', name: 'Kaduna',       capital: 'Kaduna',       zone: 'NW', bbox: [ 9.00, 11.50,  6.30,  9.00], capitalCoords: { latitude: 10.5222, longitude:  7.4383 } },
  { code: 'KN', name: 'Kano',         capital: 'Kano',         zone: 'NW', bbox: [11.00, 12.70,  8.00, 10.50], capitalCoords: { latitude: 12.0022, longitude:  8.5919 } },
  { code: 'KT', name: 'Katsina',      capital: 'Katsina',      zone: 'NW', bbox: [11.00, 13.50,  6.50,  9.50], capitalCoords: { latitude: 12.9908, longitude:  7.6018 } },
  { code: 'JI', name: 'Jigawa',       capital: 'Dutse',        zone: 'NW', bbox: [11.50, 13.00,  8.00, 11.00], capitalCoords: { latitude: 11.7560, longitude:  9.3389 } },
  { code: 'KE', name: 'Kebbi',        capital: 'Birnin Kebbi', zone: 'NW', bbox: [10.00, 13.00,  3.00,  7.00], capitalCoords: { latitude: 12.4504, longitude:  4.1972 } },
  { code: 'SO', name: 'Sokoto',       capital: 'Sokoto',       zone: 'NW', bbox: [12.00, 13.90,  4.00,  7.00], capitalCoords: { latitude: 13.0059, longitude:  5.2476 } },
  { code: 'ZA', name: 'Zamfara',      capital: 'Gusau',        zone: 'NW', bbox: [11.00, 13.50,  4.00,  7.50], capitalCoords: { latitude: 12.1707, longitude:  6.6606 } },

  // North-East
  { code: 'BO', name: 'Borno',        capital: 'Maiduguri',    zone: 'NE', bbox: [10.00, 14.00, 11.00, 14.50], capitalCoords: { latitude: 11.8333, longitude: 13.1500 } },
  { code: 'YO', name: 'Yobe',         capital: 'Damaturu',     zone: 'NE', bbox: [11.00, 13.50,  9.00, 13.00], capitalCoords: { latitude: 11.7479, longitude: 11.9608 } },
  { code: 'AD', name: 'Adamawa',      capital: 'Yola',         zone: 'NE', bbox: [ 7.80, 11.00, 11.00, 14.00], capitalCoords: { latitude:  9.2035, longitude: 12.4954 } },
  { code: 'TA', name: 'Taraba',       capital: 'Jalingo',      zone: 'NE', bbox: [ 6.40,  9.50,  9.00, 12.00], capitalCoords: { latitude:  8.8911, longitude: 11.3777 } },
  { code: 'GO', name: 'Gombe',        capital: 'Gombe',        zone: 'NE', bbox: [ 9.50, 11.40,  9.70, 12.00], capitalCoords: { latitude: 10.2897, longitude: 11.1671 } },
  { code: 'BA', name: 'Bauchi',       capital: 'Bauchi',       zone: 'NE', bbox: [ 9.40, 12.40,  8.50, 11.20], capitalCoords: { latitude: 10.3158, longitude:  9.8442 } },
] as const;

// Lookup index for O(1) state-by-code access.
const STATE_BY_CODE = NIGERIAN_STATES.reduce<Record<string, NigerianState>>((acc, s) => {
  acc[s.code] = s;
  return acc;
}, {});

// ─── State adjacency (shared border) — used for inter-state surcharge tier ──

/**
 * Each state lists its land-border neighbours. Adjacency is symmetric — if
 * KN: [KT, JI, BA, KD] then KT: [...KN, ...] etc.
 *
 * Source: Nigerian Federal Government state border maps. International
 * borders (Cameroon, Benin, Niger, Chad) are not included since trips
 * crossing them are out of scope for the customer-app.
 */
const STATE_ADJACENCY: Record<StateCode, readonly StateCode[]> = {
  // South-West
  LA: ['OG'],
  OG: ['LA', 'OY', 'ON'],
  OY: ['OG', 'OS', 'KW'],
  OS: ['OY', 'EK', 'ON', 'KW', 'ED'],
  EK: ['KW', 'OS', 'ON', 'KO'],
  ON: ['OG', 'OY', 'OS', 'EK', 'KO', 'ED'],

  // South-East
  AN: ['KO', 'EN', 'IM', 'AB', 'DE'],
  EN: ['KO', 'BE', 'EB', 'AB', 'IM', 'AN'],
  IM: ['EN', 'AN', 'AB', 'RI'],
  AB: ['EN', 'EB', 'IM', 'RI', 'AK', 'CR'],
  EB: ['BE', 'EN', 'AB', 'CR'],

  // South-South
  ED: ['KO', 'ON', 'OS', 'DE'],
  DE: ['AN', 'ED', 'BY', 'RI'],
  BY: ['DE', 'RI'],
  RI: ['IM', 'AB', 'BY', 'AK', 'DE'],
  AK: ['AB', 'CR', 'RI'],
  CR: ['BE', 'EB', 'AB', 'AK'],

  // North-Central
  FC: ['NI', 'KD', 'NA', 'KO'],
  NA: ['KD', 'FC', 'KO', 'BE', 'PL', 'TA'],
  KO: ['NI', 'KW', 'FC', 'NA', 'BE', 'EK', 'ON', 'ED', 'EN', 'AN'],
  KW: ['NI', 'KO', 'OY', 'EK', 'ON'],
  NI: ['KE', 'ZA', 'KD', 'FC', 'KW', 'KO'],
  PL: ['KD', 'BA', 'TA', 'NA'],
  BE: ['NA', 'TA', 'KO', 'EN', 'EB', 'CR'],

  // North-West
  KD: ['ZA', 'KT', 'KN', 'BA', 'PL', 'NA', 'NI', 'FC', 'KO'],
  KN: ['KT', 'JI', 'BA', 'KD'],
  KT: ['ZA', 'JI', 'KN', 'KD'],
  JI: ['KT', 'KN', 'BA', 'YO'],
  KE: ['SO', 'ZA', 'NI'],
  SO: ['KE', 'ZA'],
  ZA: ['SO', 'KE', 'KT', 'KD', 'NI'],

  // North-East
  BO: ['YO', 'GO', 'AD'],
  YO: ['JI', 'BA', 'GO', 'BO'],
  AD: ['BO', 'GO', 'TA'],
  TA: ['GO', 'BA', 'PL', 'NA', 'BE', 'AD'],
  GO: ['YO', 'BA', 'AD', 'TA'],
  BA: ['JI', 'KN', 'KD', 'PL', 'GO', 'TA', 'YO'],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Look up a state by ISO 3166-2 code. */
export function getState(code: StateCode | string): NigerianState | undefined {
  return STATE_BY_CODE[code as StateCode];
}

/** All states in a given geopolitical zone. */
export function statesInZone(zone: GeopoliticalZone): NigerianState[] {
  return NIGERIAN_STATES.filter(s => s.zone === zone);
}

/**
 * Detect the Nigerian state containing the given coordinates by bounding-
 * box check. Returns null if outside Nigeria or no bbox matches. When
 * multiple bboxes overlap (border regions), returns the smallest matching
 * one — typically the more specific state.
 *
 * Accuracy: ±20 km at state borders. Good enough for inter-state surcharge
 * tiering. For billing-grade accuracy, ask backend (which uses PostGIS).
 */
export function detectStateFromCoords(latitude: number, longitude: number): StateCode | null {
  const matches: NigerianState[] = [];
  for (const s of NIGERIAN_STATES) {
    const [latMin, latMax, lngMin, lngMax] = s.bbox;
    if (latitude >= latMin && latitude <= latMax && longitude >= lngMin && longitude <= lngMax) {
      matches.push(s);
    }
  }
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].code;
  // Multiple overlap — prefer the smaller bbox (more specific).
  matches.sort((a, b) => {
    const aArea = (a.bbox[1] - a.bbox[0]) * (a.bbox[3] - a.bbox[2]);
    const bArea = (b.bbox[1] - b.bbox[0]) * (b.bbox[3] - b.bbox[2]);
    return aArea - bArea;
  });
  return matches[0].code;
}

/**
 * Whether two states share a land border. Symmetric — order doesn't matter.
 * Same-state check returns false (use === for that).
 */
export function areStatesAdjacent(a: StateCode | null, b: StateCode | null): boolean {
  if (!a || !b || a === b) return false;
  return STATE_ADJACENCY[a]?.includes(b) ?? false;
}

/** Get the geopolitical zone for a state. */
export function getStateZone(code: StateCode | null): GeopoliticalZone | null {
  if (!code) return null;
  return STATE_BY_CODE[code]?.zone ?? null;
}

/**
 * "Same metro" check — two coords are within ~5 km of each other AND in
 * the same state. Used to decide whether a trip qualifies for intra-city
 * (no surcharge) vs intra-state-long-haul (small surcharge).
 */
export function isSameMetro(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): boolean {
  const distKm = haversineKm(lat1, lng1, lat2, lng2);
  if (distKm > 5) return false;
  return detectStateFromCoords(lat1, lng1) === detectStateFromCoords(lat2, lng2);
}

/** Haversine distance in km — accurate enough for our zone checks. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Country-centre fallback when we have no user coords and no state hint. */
export const NIGERIA_CENTRE = { latitude: 9.0820, longitude: 8.6753 };

/** Map region span that nicely fits a single state, used as a default zoom. */
export const STATE_REGION_DELTA = { latitudeDelta: 0.5, longitudeDelta: 0.5 };
