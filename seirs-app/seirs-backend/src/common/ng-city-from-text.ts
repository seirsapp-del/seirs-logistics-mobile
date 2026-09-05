/**
 * The town a place is actually in, read out of its address.
 *
 * MIRRORS the city list in shared/models/cities.ts, deliberately and
 * unhappily, for the same reason common/vehicle-labels.ts does: nothing
 * else in the backend imports from @seirs/shared, and one import would
 * drag the whole workspace build in behind it.
 *
 * WHY THIS EXISTS. A trip stop stores whatever the geocoder called the
 * administrative area, and for Nigeria that is frequently the STATE or an
 * LGA nobody would ever say out loud. Obafemi Awolowo University saved as
 * "Kajola". The University of Ibadan first gate saved as "Oyo". So a
 * passenger searching Ile-Ife to Ibadan was shown a card reading
 * "Ile-Ife to Lagos, via Oyo", which is three labels and not one of them
 * is the town they asked about (founder, 2026-09-05: "the stops in
 * between, this is important for a customer to know, no surprises").
 *
 * The address text almost always contains the real town, because that is
 * how people write addresses. So the address wins over the stored city
 * whenever it names a place we recognise.
 *
 * Applied on READ, so it corrects the trips already in the database
 * rather than only the ones declared from now on.
 */

/** Cities and towns people actually name when they say where they are. */
const CITIES = [
  // The big ones first: a longer name must win over a shorter one it contains.
  'Port Harcourt', 'Benin City', 'Ado Ekiti', 'Ikot Ekpene', 'Birnin Kebbi',
  'Ijebu Ode', 'Ile-Ife', 'Ile Ife', 'Warri', 'Abeokuta', 'Maiduguri',
  'Ogbomoso', 'Abakaliki', 'Kontagora', 'Umuahia', 'Yenagoa', 'Damaturu',
  'Makurdi', 'Jalingo', 'Lokoja', 'Sokoto', 'Katsina', 'Bauchi', 'Gombe',
  'Calabar', 'Owerri', 'Onitsha', 'Enugu', 'Nsukka', 'Awka', 'Nnewi',
  'Ibadan', 'Lagos', 'Ikorodu', 'Badagry', 'Sagamu', 'Iseyin', 'Epe',
  'Abuja', 'Suleja', 'Minna', 'Kaduna', 'Zaria', 'Kano', 'Gusau', 'Dutse',
  'Ilorin', 'Offa', 'Osogbo', 'Oshogbo', 'Akure', 'Asaba', 'Sapele',
  'Ughelli', 'Effurun', 'Eket', 'Uyo', 'Ogoja', 'Obudu', 'Wukari', 'Okene',
  'Idah', 'Lafia', 'Yola', 'Jos', 'Aba', 'Oyo', 'Ihiala',
].sort((a, b) => b.length - a.length);

const norm = (v: string) =>
  String(v ?? '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The first recognised town named anywhere in the text, longest match
 * first so "Port Harcourt" is never read as nothing and "Ile-Ife" is
 * never read as "Ife".
 *
 * Word boundaries matter: without them "Aba" matches inside "Abakaliki"
 * and a trader in Abakaliki is told the lorry stops in Aba, 400 km away.
 */
export function cityFromText(text?: string | null): string | null {
  const hay = norm(text ?? '');
  if (!hay) return null;
  for (const city of CITIES) {
    const needle = norm(city);
    const re = new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
    if (re.test(hay)) return city;
  }
  return null;
}


/**
 * Where the towns are, roughly.
 *
 * Text matching cannot save every stop. Obafemi Awolowo University
 * Central Mosque names no town anywhere in its address, and Google hands
 * back the LGA, Kajola, so that stop reads "Kajola" however carefully the
 * text is searched (founder, 2026-09-05: "the google map read it as
 * kajola").
 *
 * But every stop carries coordinates, and a town centre is enough to say
 * which town a point is in when the nearest one is a few kilometres away
 * and the next is fifty. Centres are approximate on purpose: this answers
 * "which town is this" and nothing finer.
 */
const CITY_POINTS: Array<[string, number, number]> = [
  ['Lagos', 6.5244, 3.3792], ['Ikorodu', 6.6194, 3.5105], ['Badagry', 6.4150, 2.8817],
  ['Epe', 6.5844, 3.9836], ['Abeokuta', 7.1557, 3.3451], ['Sagamu', 6.8300, 3.6400],
  ['Ijebu Ode', 6.8200, 3.9200], ['Ibadan', 7.3775, 3.9470], ['Oyo', 7.8526, 3.9313],
  ['Ogbomoso', 8.1333, 4.2500], ['Iseyin', 7.9667, 3.6000], ['Ile-Ife', 7.4824, 4.5601],
  ['Osogbo', 7.7827, 4.5418], ['Akure', 7.2571, 5.2058], ['Ado Ekiti', 7.6211, 5.2214],
  ['Ilorin', 8.4966, 4.5421], ['Offa', 8.1490, 4.7200], ['Benin City', 6.3350, 5.6037],
  ['Warri', 5.5167, 5.7500], ['Sapele', 5.8941, 5.6767], ['Ughelli', 5.4833, 5.9833],
  ['Asaba', 6.1980, 6.7280], ['Onitsha', 6.1667, 6.7833], ['Awka', 6.2100, 7.0700],
  ['Nnewi', 6.0167, 6.9167], ['Enugu', 6.4584, 7.5464], ['Nsukka', 6.8567, 7.3958],
  ['Abakaliki', 6.3249, 8.1137], ['Owerri', 5.4836, 7.0333], ['Aba', 5.1066, 7.3667],
  ['Umuahia', 5.5250, 7.4950], ['Port Harcourt', 4.8156, 7.0498], ['Yenagoa', 4.9267, 6.2676],
  ['Uyo', 5.0378, 7.9128], ['Eket', 4.6500, 7.9333], ['Calabar', 4.9757, 8.3417],
  ['Abuja', 9.0765, 7.3986], ['Suleja', 9.1800, 7.1800], ['Minna', 9.6139, 6.5569],
  ['Kontagora', 10.4000, 5.4667], ['Lokoja', 7.8023, 6.7333], ['Okene', 7.5500, 6.2333],
  ['Makurdi', 7.7322, 8.5391], ['Lafia', 8.4939, 8.5157], ['Jos', 9.8965, 8.8583],
  ['Kaduna', 10.5222, 7.4383], ['Zaria', 11.0855, 7.7199], ['Kano', 12.0022, 8.5920],
  ['Katsina', 12.9908, 7.6018], ['Sokoto', 13.0059, 5.2476], ['Birnin Kebbi', 12.4539, 4.1975],
  ['Gusau', 12.1628, 6.6614], ['Dutse', 11.7566, 9.3386], ['Bauchi', 10.3158, 9.8442],
  ['Gombe', 10.2897, 11.1673], ['Yola', 9.2035, 12.4954], ['Jalingo', 8.8833, 11.3667],
  ['Maiduguri', 11.8311, 13.1510], ['Damaturu', 11.7470, 11.9608],
];

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/**
 * The nearest town centre, when it is near enough to be the answer.
 *
 * 40 km is deliberate. Ibadan to Oyo town is about 50, so a point cannot
 * be claimed by both, and a stop on open road between towns returns
 * nothing rather than guessing the wrong one.
 */
export function nearestCity(lat?: number | null, lng?: number | null, maxKm = 40): string | null {
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || (a === 0 && b === 0)) return null;
  let best: string | null = null;
  let bestKm = Infinity;
  for (const [name, cLat, cLng] of CITY_POINTS) {
    const km = haversineKm(a, b, cLat, cLng);
    if (km < bestKm) { bestKm = km; best = name; }
  }
  return bestKm <= maxKm ? best : null;
}


/**
 * What to call this stop: the town named in the address if we know it,
 * otherwise whatever was stored. Never empty when either input is.
 */
export function stopLabel(
  city?: string | null,
  address?: string | null,
  lat?: number | null,
  lng?: number | null,
): string | null {
  /*
   * In order of how much each source actually knows.
   *
   * The address text first: somebody typed it and named the place. Then
   * the coordinates, which catch the addresses that name a landmark and
   * no town, which is the Kajola case. The stored city last, because it
   * is whatever the geocoder called the administrative area and is the
   * thing that was wrong to begin with.
   */
  return cityFromText(address)
    ?? nearestCity(lat, lng)
    ?? (city ? String(city) : null);
}
