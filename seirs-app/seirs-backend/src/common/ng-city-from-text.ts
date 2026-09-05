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
 * What to call this stop: the town named in the address if we know it,
 * otherwise whatever was stored. Never empty when either input is.
 */
export function stopLabel(city?: string | null, address?: string | null): string | null {
  return cityFromText(address) ?? (city ? String(city) : null);
}
