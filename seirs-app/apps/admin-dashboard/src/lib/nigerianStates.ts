/**
 * Nigerian region taxonomy for admin UI — mirrors the customer-app's
 * constants/regions.ts but without bboxes/adjacency (admin doesn't need
 * runtime state detection; it just renders editors).
 *
 * Keep this in sync with the customer-app file when geopolitical zones
 * or state codes change (rare — these are political boundaries).
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
}

export const GEOPOLITICAL_ZONES: Record<GeopoliticalZone, { name: string; description: string }> = {
  NW: { name: 'North-West',    description: 'Sokoto, Kebbi, Zamfara, Katsina, Jigawa, Kano, Kaduna' },
  NE: { name: 'North-East',    description: 'Borno, Yobe, Adamawa, Taraba, Gombe, Bauchi'           },
  NC: { name: 'North-Central', description: 'FCT, Plateau, Nasarawa, Kogi, Kwara, Niger, Benue'     },
  SW: { name: 'South-West',    description: 'Lagos, Ogun, Oyo, Osun, Ekiti, Ondo'                   },
  SE: { name: 'South-East',    description: 'Anambra, Enugu, Imo, Abia, Ebonyi'                     },
  SS: { name: 'South-South',   description: 'Edo, Delta, Bayelsa, Rivers, Akwa Ibom, Cross River'   },
};

export const NIGERIAN_STATES: readonly NigerianState[] = [
  // South-West
  { code: 'LA', name: 'Lagos',       capital: 'Ikeja',        zone: 'SW' },
  { code: 'OG', name: 'Ogun',        capital: 'Abeokuta',     zone: 'SW' },
  { code: 'OY', name: 'Oyo',         capital: 'Ibadan',       zone: 'SW' },
  { code: 'OS', name: 'Osun',        capital: 'Osogbo',       zone: 'SW' },
  { code: 'EK', name: 'Ekiti',       capital: 'Ado-Ekiti',    zone: 'SW' },
  { code: 'ON', name: 'Ondo',        capital: 'Akure',        zone: 'SW' },
  // South-East
  { code: 'AN', name: 'Anambra',     capital: 'Awka',         zone: 'SE' },
  { code: 'EN', name: 'Enugu',       capital: 'Enugu',        zone: 'SE' },
  { code: 'IM', name: 'Imo',         capital: 'Owerri',       zone: 'SE' },
  { code: 'AB', name: 'Abia',        capital: 'Umuahia',      zone: 'SE' },
  { code: 'EB', name: 'Ebonyi',      capital: 'Abakaliki',    zone: 'SE' },
  // South-South
  { code: 'ED', name: 'Edo',         capital: 'Benin City',   zone: 'SS' },
  { code: 'DE', name: 'Delta',       capital: 'Asaba',        zone: 'SS' },
  { code: 'BY', name: 'Bayelsa',     capital: 'Yenagoa',      zone: 'SS' },
  { code: 'RI', name: 'Rivers',      capital: 'Port Harcourt',zone: 'SS' },
  { code: 'AK', name: 'Akwa Ibom',   capital: 'Uyo',          zone: 'SS' },
  { code: 'CR', name: 'Cross River', capital: 'Calabar',      zone: 'SS' },
  // North-Central
  { code: 'FC', name: 'FCT',         capital: 'Abuja',        zone: 'NC' },
  { code: 'NA', name: 'Nasarawa',    capital: 'Lafia',        zone: 'NC' },
  { code: 'KO', name: 'Kogi',        capital: 'Lokoja',       zone: 'NC' },
  { code: 'KW', name: 'Kwara',       capital: 'Ilorin',       zone: 'NC' },
  { code: 'NI', name: 'Niger',       capital: 'Minna',        zone: 'NC' },
  { code: 'PL', name: 'Plateau',     capital: 'Jos',          zone: 'NC' },
  { code: 'BE', name: 'Benue',       capital: 'Makurdi',      zone: 'NC' },
  // North-West
  { code: 'KD', name: 'Kaduna',      capital: 'Kaduna',       zone: 'NW' },
  { code: 'KN', name: 'Kano',        capital: 'Kano',         zone: 'NW' },
  { code: 'KT', name: 'Katsina',     capital: 'Katsina',      zone: 'NW' },
  { code: 'JI', name: 'Jigawa',      capital: 'Dutse',        zone: 'NW' },
  { code: 'KE', name: 'Kebbi',       capital: 'Birnin Kebbi', zone: 'NW' },
  { code: 'SO', name: 'Sokoto',      capital: 'Sokoto',       zone: 'NW' },
  { code: 'ZA', name: 'Zamfara',     capital: 'Gusau',        zone: 'NW' },
  // North-East
  { code: 'BO', name: 'Borno',       capital: 'Maiduguri',    zone: 'NE' },
  { code: 'YO', name: 'Yobe',        capital: 'Damaturu',     zone: 'NE' },
  { code: 'AD', name: 'Adamawa',     capital: 'Yola',         zone: 'NE' },
  { code: 'TA', name: 'Taraba',      capital: 'Jalingo',      zone: 'NE' },
  { code: 'GO', name: 'Gombe',       capital: 'Gombe',        zone: 'NE' },
  { code: 'BA', name: 'Bauchi',      capital: 'Bauchi',       zone: 'NE' },
] as const;

export function getState(code: string): NigerianState | undefined {
  return NIGERIAN_STATES.find(s => s.code === code);
}

export function statesInZone(zone: GeopoliticalZone): NigerianState[] {
  return NIGERIAN_STATES.filter(s => s.zone === zone);
}

/** Stable id generator for client-side sub-zone rows. Backend assigns real ids on save. */
export function newSubZoneId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
