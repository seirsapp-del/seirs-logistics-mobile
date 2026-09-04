/**
 * The cities both sides of the marketplace are allowed to say.
 *
 * Travel Buddy matched a driver's declared stops against whatever the
 * passenger typed, and the two sides were speaking different languages.
 * A driver declaring Obafemi Awolowo University had the trip filed under
 * "Kajola", the local government area, because that is the component the
 * geocoder returned. A passenger searching the only name anybody uses for
 * that place, Ife, found nothing, and a real declared trip was invisible
 * to the exact person it was declared for (found on the device
 * 2026-09-04).
 *
 * A shared list fixes the passenger's half: they pick a canonical name
 * instead of inventing one, so "ibadan", "Ibadan " and "IBADAN" all become
 * the same query. It does not fix the driver's half, which is a geocoding
 * problem in the backend, and it is not a whitelist: anything typed still
 * searches, because a list of Nigerian towns that claims to be complete
 * is a list that is wrong.
 *
 * `aliases` carries the names people actually use out loud, including the
 * LGA names the geocoder is fond of, so searching either finds the city.
 */

import { isLga, stateOfLga, findState } from './nigeria';

export interface NgCity {
  /** Canonical name, and what gets sent to the search. */
  name:     string;
  /** State, shown beside the name because Nigeria repeats town names. */
  state:    string;
  /** Other names for the same place: shortenings, spellings, the LGA. */
  aliases?: string[];
}

/**
 * Ordered roughly by how much intercity traffic each place actually
 * carries, so the first suggestions on a short query are the ones most
 * people mean.
 */
export const NG_CITIES: NgCity[] = [
  { name: 'Lagos',         state: 'Lagos',       aliases: ['eko', 'lasgidi'] },
  { name: 'Ikeja',         state: 'Lagos' },
  { name: 'Lekki',         state: 'Lagos' },
  { name: 'Ikorodu',       state: 'Lagos' },
  { name: 'Badagry',       state: 'Lagos' },
  { name: 'Epe',           state: 'Lagos' },
  { name: 'Abuja',         state: 'FCT',         aliases: ['fct', 'federal capital territory'] },
  { name: 'Gwagwalada',    state: 'FCT' },
  { name: 'Ibadan',        state: 'Oyo' },
  { name: 'Ogbomoso',      state: 'Oyo' },
  { name: 'Oyo',           state: 'Oyo' },
  { name: 'Iseyin',        state: 'Oyo' },
  { name: 'Ile-Ife',       state: 'Osun',        aliases: ['ife', 'ile ife', 'oau'] },
  { name: 'Osogbo',        state: 'Osun',        aliases: ['oshogbo'] },
  { name: 'Ilesa',         state: 'Osun',        aliases: ['ilesha'] },
  { name: 'Abeokuta',      state: 'Ogun' },
  { name: 'Sagamu',        state: 'Ogun',        aliases: ['shagamu'] },
  { name: 'Ijebu-Ode',     state: 'Ogun',        aliases: ['ijebu ode', 'ijebu'] },
  { name: 'Ota',           state: 'Ogun',        aliases: ['sango ota', 'sango'] },
  { name: 'Akure',         state: 'Ondo' },
  { name: 'Ondo',          state: 'Ondo' },
  { name: 'Owo',           state: 'Ondo' },
  { name: 'Ado-Ekiti',     state: 'Ekiti',       aliases: ['ado ekiti', 'ado'] },
  { name: 'Ilorin',        state: 'Kwara' },
  { name: 'Offa',          state: 'Kwara' },
  { name: 'Lokoja',        state: 'Kogi' },
  { name: 'Okene',         state: 'Kogi' },
  { name: 'Benin City',    state: 'Edo',         aliases: ['benin'] },
  { name: 'Auchi',         state: 'Edo' },
  { name: 'Ekpoma',        state: 'Edo' },
  { name: 'Asaba',         state: 'Delta' },
  { name: 'Warri',         state: 'Delta' },
  { name: 'Sapele',        state: 'Delta' },
  { name: 'Ughelli',       state: 'Delta' },
  { name: 'Onitsha',       state: 'Anambra' },
  { name: 'Awka',          state: 'Anambra' },
  { name: 'Nnewi',         state: 'Anambra' },
  { name: 'Enugu',         state: 'Enugu' },
  { name: 'Nsukka',        state: 'Enugu' },
  { name: 'Owerri',        state: 'Imo' },
  { name: 'Orlu',          state: 'Imo' },
  { name: 'Aba',           state: 'Abia' },
  { name: 'Umuahia',       state: 'Abia' },
  { name: 'Port Harcourt', state: 'Rivers',      aliases: ['ph', 'phc', 'port-harcourt'] },
  { name: 'Bonny',         state: 'Rivers' },
  { name: 'Uyo',           state: 'Akwa Ibom' },
  { name: 'Eket',          state: 'Akwa Ibom' },
  { name: 'Calabar',       state: 'Cross River' },
  { name: 'Ogoja',         state: 'Cross River' },
  { name: 'Yenagoa',       state: 'Bayelsa' },
  { name: 'Abakaliki',     state: 'Ebonyi' },
  { name: 'Makurdi',       state: 'Benue' },
  { name: 'Gboko',         state: 'Benue' },
  { name: 'Otukpo',        state: 'Benue' },
  { name: 'Jos',           state: 'Plateau' },
  { name: 'Lafia',         state: 'Nasarawa' },
  { name: 'Keffi',         state: 'Nasarawa' },
  { name: 'Minna',         state: 'Niger' },
  { name: 'Suleja',        state: 'Niger' },
  { name: 'Bida',          state: 'Niger' },
  { name: 'Kaduna',        state: 'Kaduna' },
  { name: 'Zaria',         state: 'Kaduna' },
  { name: 'Kafanchan',     state: 'Kaduna' },
  { name: 'Kano',          state: 'Kano' },
  { name: 'Katsina',       state: 'Katsina' },
  { name: 'Funtua',        state: 'Katsina' },
  { name: 'Sokoto',        state: 'Sokoto' },
  { name: 'Birnin Kebbi',  state: 'Kebbi' },
  { name: 'Gusau',         state: 'Zamfara' },
  { name: 'Bauchi',        state: 'Bauchi' },
  { name: 'Azare',         state: 'Bauchi' },
  { name: 'Gombe',         state: 'Gombe' },
  { name: 'Jalingo',       state: 'Taraba' },
  { name: 'Yola',          state: 'Adamawa' },
  { name: 'Mubi',          state: 'Adamawa' },
  { name: 'Maiduguri',     state: 'Borno' },
  { name: 'Damaturu',      state: 'Yobe' },
  { name: 'Dutse',         state: 'Jigawa' },
];

/**
 * Suggestions for what has been typed so far.
 *
 * Names that START with the query come first, because someone typing
 * "ib" means Ibadan and should not have to read past four towns that
 * merely contain those letters. Alias hits are folded in at the same
 * rank as their city so "ife" leads with Ile-Ife and "ph" with Port
 * Harcourt.
 */
export function searchCities(query: string, limit = 6): NgCity[] {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return [];

  const starts: NgCity[] = [];
  const contains: NgCity[] = [];

  for (const c of NG_CITIES) {
    const name = c.name.toLowerCase();
    const names = [name, ...(c.aliases ?? [])];
    if (names.some(n => n.startsWith(q)))      { starts.push(c);   continue; }
    if (names.some(n => n.includes(q)))        { contains.push(c); }
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * The city named inside a full address, if we know it.
 *
 * Google's address components are not a reliable answer to "what city is
 * this" in Nigeria. Obafemi Awolowo University came back as Kajola, an
 * LGA nobody uses for it, and Olorunda Aba Market in Ibadan came back as
 * Aba, a city four hundred kilometres away in Abia state (founder, both
 * found on the device 2026-09-04). In both cases the correct name was
 * sitting in the formatted address the whole time.
 *
 * So this reads the address as text and looks for a name we recognise.
 * Comma-separated parts are checked first, because "Ibadan" as its own
 * part is a much stronger signal than the same letters appearing inside
 * a street name. Whole-string matching is a fallback and is bounded to
 * word edges, so "Aba" cannot match inside "Abakaliki" and "Ife" cannot
 * match inside "Life Camp".
 *
 * Returns null rather than guessing. A wrong city is worse than none:
 * the city is what trip discovery matches on, so a bad one hides the
 * trip from the people it was declared for.
 */
export function cityFromAddressText(text: string): NgCity | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;

  const norm = (v: string) => v.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

  // Anything a match could legitimately be: the canonical name, or one of
  // the names people actually say.
  const candidates: Array<{ city: NgCity; token: string }> = [];
  for (const c of NG_CITIES) {
    candidates.push({ city: c, token: norm(c.name) });
    for (const a of c.aliases ?? []) candidates.push({ city: c, token: norm(a) });
  }
  // Longest first, so "Port Harcourt" wins over a stray "Port" and
  // "Ile Ife" over "Ife".
  candidates.sort((a, b) => b.token.length - a.token.length);

  const parts = raw.split(',').map(p => norm(p)).filter(Boolean);

  // 1. A whole comma-separated part that IS a city we know.
  for (const cand of candidates) {
    if (parts.some(p => p === cand.token)) return cand.city;
  }

  // 2. A city name sitting inside one of those parts, on word boundaries.
  for (const cand of candidates) {
    const re = new RegExp(`(^|\\s)${cand.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
    if (parts.some(p => re.test(p))) return cand.city;
  }

  return null;
}

/**
 * The one place the whole platform decides what city an address is in.
 *
 * This replaced four identical copies of the same wrong logic, one in
 * each app's StreetAutocomplete and one in the driver's trip builder.
 * All four read Google's components in the order
 * `locality -> administrative_area_level_2 -> sublocality`, and all four
 * produced the same two failures on the device:
 *
 *   Obafemi Awolowo University   -> "Kajola", an Oyo LGA, for a town in Osun
 *   Olorunda Aba Market, Ibadan  -> "Aba",    a city in Abia, 400km away
 *
 * The order of preference below is the fix, and the order matters more
 * than any single rule in it:
 *
 *   1. A known city standing as its OWN comma-part of the address. This
 *      outranks everything Google labelled, because "Ibadan" sitting
 *      alone in the address is a far stronger claim than "Aba" appearing
 *      inside the name of a market.
 *   2. A labelled component that is itself a city we know.
 *   3. A known city name inside a part, on word boundaries.
 *   4. The locality, provided it is not a local government name.
 *   5. Whatever is left, marked unconfident so callers can say so.
 *
 * `confident` is not decoration. Trip discovery matches on this value,
 * so a screen that gets `false` should let the user correct it rather
 * than quietly filing a trip under a name nobody will search for.
 */
export interface DerivedPlace {
  city:      string;
  state:     string | null;
  confident: boolean;
  /** Which rule answered, so a bad city can be traced to its cause. */
  source:    'address-part' | 'component-city' | 'address-word'
           | 'locality'     | 'lga'            | 'fallback' | 'none';
}

export function derivePlace(input: {
  components?:       Array<{ types?: string[]; long_name?: string }> | null;
  formattedAddress?: string | null;
  description?:      string | null;
}): DerivedPlace {
  const text  = String(input.formattedAddress ?? input.description ?? '').trim();
  const parts = (input.components ?? []).filter(Boolean);

  const pick = (type: string): string => {
    const hit = parts.find(c => Array.isArray(c?.types) && c.types.includes(type));
    return String(hit?.long_name ?? '').trim();
  };

  const stateRaw = pick('administrative_area_level_1');
  const state    = stateRaw ? stateRaw.replace(/\s+state$/i, '').trim() : null;

  // 1. A city standing as its own part of the address.
  const byPart = cityFromAddressText(text);
  if (byPart) {
    return { city: byPart.name, state: state || byPart.state, confident: true, source: 'address-part' };
  }

  // 2. A labelled component that is a city we already know.
  for (const type of ['locality', 'sublocality', 'administrative_area_level_2']) {
    const value = pick(type);
    if (!value) continue;
    const known = NG_CITIES.find(c =>
      c.name.toLowerCase() === value.toLowerCase() ||
      (c.aliases ?? []).includes(value.toLowerCase()));
    if (known) {
      return { city: known.name, state: state || known.state, confident: true, source: 'component-city' };
    }
  }

  // 3. A city name inside one of the parts. cityFromAddressText already
  //    tried this against the formatted address; try the components too,
  //    because a place picked from autocomplete sometimes carries a
  //    fuller locality than the formatted string does.
  for (const type of ['locality', 'sublocality']) {
    const value = pick(type);
    if (!value) continue;
    const inside = cityFromAddressText(value);
    if (inside) {
      return { city: inside.name, state: state || inside.state, confident: true, source: 'address-word' };
    }
  }

  // 4. The locality, unless it is a local government wearing a town's
  //    clothes. This is the Kajola rule.
  const locality = pick('locality') || pick('sublocality');
  if (locality && !isLga(locality)) {
    return { city: locality, state, confident: false, source: 'locality' };
  }

  // 5. An LGA is better than nothing, and its own state is more reliable
  //    than whatever admin_area_1 said, but the caller must be told.
  const lga = locality || pick('administrative_area_level_2');
  if (lga) {
    return { city: lga, state: stateOfLga(lga) ?? state, confident: false, source: 'lga' };
  }

  // 6. No components at all: offline, or a refused key. Read the text.
  const written = text
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .filter(p => !/^nigeria$/i.test(p))
    .filter(p => !findState(p));
  if (written.length) {
    return { city: written[written.length - 1], state, confident: false, source: 'fallback' };
  }

  return { city: '', state, confident: false, source: 'none' };
}

/**
 * Whether what the user typed is already one of the names we know, so a
 * screen can tell a picked city from a hand-typed one without keeping a
 * second piece of state.
 */
export function isKnownCity(value: string): boolean {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return false;
  return NG_CITIES.some(c =>
    c.name.toLowerCase() === v || (c.aliases ?? []).includes(v),
  );
}
