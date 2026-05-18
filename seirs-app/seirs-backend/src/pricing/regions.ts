/**
 * Nigerian region taxonomy for the backend — mirrors the customer-app's
 * constants/regions.ts and admin-dashboard's lib/nigerianStates.ts.
 *
 * Used by PricingService.computePrice to detect state crossings from
 * pickup/dropoff coords and apply the right zone-surcharge tier.
 *
 * Bounding boxes are approximate (±20km at borders). When the backend
 * eventually adds a PostGIS state-polygon table, swap detectStateFromCoords
 * for a real ST_Contains query — interface stays the same.
 */

export type GeopoliticalZone = 'NW' | 'NE' | 'NC' | 'SW' | 'SE' | 'SS';

export type StateCode =
  | 'AB' | 'AD' | 'AK' | 'AN' | 'BA' | 'BY' | 'BE' | 'BO' | 'CR' | 'DE'
  | 'EB' | 'ED' | 'EK' | 'EN' | 'FC' | 'GO' | 'IM' | 'JI' | 'KD' | 'KN'
  | 'KT' | 'KE' | 'KO' | 'KW' | 'LA' | 'NA' | 'NI' | 'OG' | 'ON' | 'OS'
  | 'OY' | 'PL' | 'RI' | 'SO' | 'TA' | 'YO' | 'ZA';

export interface NigerianState {
  code:    StateCode;
  name:    string;
  capital: string;
  zone:    GeopoliticalZone;
  bbox:    [number, number, number, number];   // [latMin, latMax, lngMin, lngMax]
}

export const NIGERIAN_STATES: readonly NigerianState[] = [
  // South-West
  { code: 'LA', name: 'Lagos',       capital: 'Ikeja',        zone: 'SW', bbox: [ 6.30,  6.85,  2.70,  4.40] },
  { code: 'OG', name: 'Ogun',        capital: 'Abeokuta',     zone: 'SW', bbox: [ 6.40,  7.90,  2.60,  4.55] },
  { code: 'OY', name: 'Oyo',         capital: 'Ibadan',       zone: 'SW', bbox: [ 7.30,  9.10,  2.60,  4.60] },
  { code: 'OS', name: 'Osun',        capital: 'Osogbo',       zone: 'SW', bbox: [ 7.00,  8.10,  4.20,  5.30] },
  { code: 'EK', name: 'Ekiti',       capital: 'Ado-Ekiti',    zone: 'SW', bbox: [ 7.40,  8.10,  4.80,  5.70] },
  { code: 'ON', name: 'Ondo',        capital: 'Akure',        zone: 'SW', bbox: [ 5.70,  7.70,  4.40,  6.30] },
  // South-East
  { code: 'AN', name: 'Anambra',     capital: 'Awka',         zone: 'SE', bbox: [ 5.70,  6.90,  6.60,  7.40] },
  { code: 'EN', name: 'Enugu',       capital: 'Enugu',        zone: 'SE', bbox: [ 6.00,  7.10,  7.00,  8.00] },
  { code: 'IM', name: 'Imo',         capital: 'Owerri',       zone: 'SE', bbox: [ 5.20,  6.00,  6.60,  7.70] },
  { code: 'AB', name: 'Abia',        capital: 'Umuahia',      zone: 'SE', bbox: [ 4.90,  6.10,  7.30,  8.00] },
  { code: 'EB', name: 'Ebonyi',      capital: 'Abakaliki',    zone: 'SE', bbox: [ 5.80,  6.80,  7.40,  8.50] },
  // South-South
  { code: 'ED', name: 'Edo',         capital: 'Benin City',   zone: 'SS', bbox: [ 5.60,  7.60,  5.00,  6.70] },
  { code: 'DE', name: 'Delta',       capital: 'Asaba',        zone: 'SS', bbox: [ 5.00,  6.80,  5.00,  6.80] },
  { code: 'BY', name: 'Bayelsa',     capital: 'Yenagoa',      zone: 'SS', bbox: [ 4.30,  5.50,  5.30,  6.50] },
  { code: 'RI', name: 'Rivers',      capital: 'Port Harcourt',zone: 'SS', bbox: [ 4.40,  5.70,  6.30,  7.60] },
  { code: 'AK', name: 'Akwa Ibom',   capital: 'Uyo',          zone: 'SS', bbox: [ 4.50,  5.60,  7.40,  8.40] },
  { code: 'CR', name: 'Cross River', capital: 'Calabar',      zone: 'SS', bbox: [ 5.00,  7.00,  7.90,  9.60] },
  // North-Central
  { code: 'FC', name: 'FCT',         capital: 'Abuja',        zone: 'NC', bbox: [ 8.40,  9.40,  6.70,  7.90] },
  { code: 'NA', name: 'Nasarawa',    capital: 'Lafia',        zone: 'NC', bbox: [ 7.40,  9.50,  7.00,  9.50] },
  { code: 'KO', name: 'Kogi',        capital: 'Lokoja',       zone: 'NC', bbox: [ 6.60,  8.70,  5.00,  7.80] },
  { code: 'KW', name: 'Kwara',       capital: 'Ilorin',       zone: 'NC', bbox: [ 7.70,  9.70,  2.70,  6.20] },
  { code: 'NI', name: 'Niger',       capital: 'Minna',        zone: 'NC', bbox: [ 8.60, 12.00,  3.00,  7.00] },
  { code: 'PL', name: 'Plateau',     capital: 'Jos',          zone: 'NC', bbox: [ 8.00, 10.40,  8.00, 10.00] },
  { code: 'BE', name: 'Benue',       capital: 'Makurdi',      zone: 'NC', bbox: [ 6.50,  8.50,  7.50, 10.00] },
  // North-West
  { code: 'KD', name: 'Kaduna',      capital: 'Kaduna',       zone: 'NW', bbox: [ 9.00, 11.50,  6.30,  9.00] },
  { code: 'KN', name: 'Kano',        capital: 'Kano',         zone: 'NW', bbox: [11.00, 12.70,  8.00, 10.50] },
  { code: 'KT', name: 'Katsina',     capital: 'Katsina',      zone: 'NW', bbox: [11.00, 13.50,  6.50,  9.50] },
  { code: 'JI', name: 'Jigawa',      capital: 'Dutse',        zone: 'NW', bbox: [11.50, 13.00,  8.00, 11.00] },
  { code: 'KE', name: 'Kebbi',       capital: 'Birnin Kebbi', zone: 'NW', bbox: [10.00, 13.00,  3.00,  7.00] },
  { code: 'SO', name: 'Sokoto',      capital: 'Sokoto',       zone: 'NW', bbox: [12.00, 13.90,  4.00,  7.00] },
  { code: 'ZA', name: 'Zamfara',     capital: 'Gusau',        zone: 'NW', bbox: [11.00, 13.50,  4.00,  7.50] },
  // North-East
  { code: 'BO', name: 'Borno',       capital: 'Maiduguri',    zone: 'NE', bbox: [10.00, 14.00, 11.00, 14.50] },
  { code: 'YO', name: 'Yobe',        capital: 'Damaturu',     zone: 'NE', bbox: [11.00, 13.50,  9.00, 13.00] },
  { code: 'AD', name: 'Adamawa',     capital: 'Yola',         zone: 'NE', bbox: [ 7.80, 11.00, 11.00, 14.00] },
  { code: 'TA', name: 'Taraba',      capital: 'Jalingo',      zone: 'NE', bbox: [ 6.40,  9.50,  9.00, 12.00] },
  { code: 'GO', name: 'Gombe',       capital: 'Gombe',        zone: 'NE', bbox: [ 9.50, 11.40,  9.70, 12.00] },
  { code: 'BA', name: 'Bauchi',      capital: 'Bauchi',       zone: 'NE', bbox: [ 9.40, 12.40,  8.50, 11.20] },
];

const STATE_BY_CODE = NIGERIAN_STATES.reduce<Record<string, NigerianState>>((acc, s) => {
  acc[s.code] = s;
  return acc;
}, {});

const STATE_ADJACENCY: Record<StateCode, readonly StateCode[]> = {
  LA: ['OG'], OG: ['LA', 'OY', 'ON'], OY: ['OG', 'OS', 'KW'],
  OS: ['OY', 'EK', 'ON', 'KW', 'ED'], EK: ['KW', 'OS', 'ON', 'KO'],
  ON: ['OG', 'OY', 'OS', 'EK', 'KO', 'ED'],
  AN: ['KO', 'EN', 'IM', 'AB', 'DE'], EN: ['KO', 'BE', 'EB', 'AB', 'IM', 'AN'],
  IM: ['EN', 'AN', 'AB', 'RI'], AB: ['EN', 'EB', 'IM', 'RI', 'AK', 'CR'],
  EB: ['BE', 'EN', 'AB', 'CR'],
  ED: ['KO', 'ON', 'OS', 'DE'], DE: ['AN', 'ED', 'BY', 'RI'],
  BY: ['DE', 'RI'], RI: ['IM', 'AB', 'BY', 'AK', 'DE'],
  AK: ['AB', 'CR', 'RI'], CR: ['BE', 'EB', 'AB', 'AK'],
  FC: ['NI', 'KD', 'NA', 'KO'], NA: ['KD', 'FC', 'KO', 'BE', 'PL', 'TA'],
  KO: ['NI', 'KW', 'FC', 'NA', 'BE', 'EK', 'ON', 'ED', 'EN', 'AN'],
  KW: ['NI', 'KO', 'OY', 'EK', 'ON'],
  NI: ['KE', 'ZA', 'KD', 'FC', 'KW', 'KO'], PL: ['KD', 'BA', 'TA', 'NA'],
  BE: ['NA', 'TA', 'KO', 'EN', 'EB', 'CR'],
  KD: ['ZA', 'KT', 'KN', 'BA', 'PL', 'NA', 'NI', 'FC', 'KO'],
  KN: ['KT', 'JI', 'BA', 'KD'], KT: ['ZA', 'JI', 'KN', 'KD'],
  JI: ['KT', 'KN', 'BA', 'YO'], KE: ['SO', 'ZA', 'NI'],
  SO: ['KE', 'ZA'], ZA: ['SO', 'KE', 'KT', 'KD', 'NI'],
  BO: ['YO', 'GO', 'AD'], YO: ['JI', 'BA', 'GO', 'BO'],
  AD: ['BO', 'GO', 'TA'], TA: ['GO', 'BA', 'PL', 'NA', 'BE', 'AD'],
  GO: ['YO', 'BA', 'AD', 'TA'], BA: ['JI', 'KN', 'KD', 'PL', 'GO', 'TA', 'YO'],
};

export function getState(code: string): NigerianState | undefined {
  return STATE_BY_CODE[code];
}

export function getStateZone(code: StateCode | null): GeopoliticalZone | null {
  if (!code) return null;
  return STATE_BY_CODE[code]?.zone ?? null;
}

/** Bounding-box state detection. Prefers the smaller bbox on overlap. */
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
  matches.sort((a, b) => {
    const aArea = (a.bbox[1] - a.bbox[0]) * (a.bbox[3] - a.bbox[2]);
    const bArea = (b.bbox[1] - b.bbox[0]) * (b.bbox[3] - b.bbox[2]);
    return aArea - bArea;
  });
  return matches[0].code;
}

export function areStatesAdjacent(a: StateCode | null, b: StateCode | null): boolean {
  if (!a || !b || a === b) return false;
  return STATE_ADJACENCY[a]?.includes(b) ?? false;
}
