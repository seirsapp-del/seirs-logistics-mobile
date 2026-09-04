/**
 * The city derivation, checked against addresses that actually occur.
 *
 * jest is not installed in this repo, so this is a plain script:
 *
 *   cd seirs-app
 *   npx tsc scripts/check-geography.ts --outDir <tmp> --module commonjs  *     --target es2019 --skipLibCheck --lib es2020 && node <tmp>/check-geography.js
 *
 * Every case here is either a failure found on a real device or a trap a
 * naive text scan falls into. Add to it rather than trusting the list.
 */
import { derivePlace, cityFromAddressText } from '../shared/models/cities';
import { verifyGeography, NG_LGAS, stateOfLga } from '../shared/models/nigeria';

const problems = verifyGeography();
console.log(problems.length
  ? 'GEOGRAPHY PROBLEMS:\n  ' + problems.join('\n  ')
  : `geography: 37 states, ${NG_LGAS.length} local governments, verified`);
console.log('');

const C = (type: string, name: string) => ({ types: [type], long_name: name });

type Case = { label: string; want: string; addr: string; comps?: any[] };

const cases: Case[] = [
  // The two the founder found on the device.
  { label: 'OAU, the Kajola bug', want: 'Ile-Ife',
    addr: 'Obafemi Awolowo University, Ile, Ife, Nigeria',
    comps: [C('locality', 'Kajola'), C('administrative_area_level_2', 'Kajola'),
            C('administrative_area_level_1', 'Osun State')] },
  { label: 'Olorunda Aba Market, the Aba bug', want: 'Ibadan',
    addr: 'Olorunda Aba Market, Ibadan, Oyo, Nigeria',
    comps: [C('locality', 'Aba'), C('administrative_area_level_1', 'Oyo State')] },

  // Places from the trip we actually declared.
  { label: 'University of Ibadan', want: 'Ibadan',
    addr: 'University of Ibadan First Gate, Ibadan, Nigeria',
    comps: [C('locality', 'Ibadan')] },
  { label: 'UNILAG', want: 'Lagos',
    addr: 'University of Lagos, Akoka, Yaba, Lagos, Nigeria',
    comps: [C('locality', 'Lagos')] },

  // Substring traps.
  { label: 'A real Aba address stays Aba', want: 'Aba',
    addr: '15 Faulks Road, Aba, Abia, Nigeria',
    comps: [C('locality', 'Aba')] },
  { label: 'Aba must not match in Abakaliki', want: 'Abakaliki',
    addr: 'Water Works Road, Abakaliki, Ebonyi, Nigeria',
    comps: [C('locality', 'Abakaliki')] },
  { label: 'Ife must not match in Life Camp', want: 'Abuja',
    addr: 'Life Camp, Abuja, FCT, Nigeria',
    comps: [C('locality', 'Abuja')] },
  { label: 'Port Harcourt beats a stray Port', want: 'Port Harcourt',
    addr: 'Aba Road, Port Harcourt, Rivers, Nigeria',
    comps: [C('locality', 'Port Harcourt')] },
  { label: 'Ilorin must not match in Ilorin East LGA text', want: 'Ilorin',
    addr: 'Tanke Road, Ilorin, Kwara, Nigeria',
    comps: [C('administrative_area_level_2', 'Ilorin East')] },

  // Real Lagos and Abuja addresses, where the locality is a district.
  { label: 'Bodija, a district of Ibadan', want: 'Ibadan',
    addr: 'Bodija Market, Ibadan, Oyo State, Nigeria',
    comps: [C('sublocality', 'Bodija'), C('locality', 'Ibadan')] },
  { label: 'Ojota, a district of Lagos', want: 'Lagos',
    addr: 'Ojota Motor Park, Ojota, Lagos, Nigeria',
    comps: [C('sublocality', 'Ojota'), C('locality', 'Lagos')] },
  { label: 'Wuse is Abuja', want: 'Abuja',
    addr: 'Wuse Market, Wuse, Abuja, Federal Capital Territory, Nigeria',
    comps: [C('locality', 'Abuja')] },

  // Offline: no components at all, only the description.
  { label: 'Offline, description only', want: 'Ibadan',
    addr: 'Bodija Market, Ibadan, Oyo State, Nigeria' },
  { label: 'Offline, Benin City', want: 'Benin City',
    addr: 'Ring Road, Benin City, Edo State, Nigeria' },

  // A town we do NOT list. It must not invent a wrong city, and it must
  // not return an LGA as though it were a town.
  { label: 'Unlisted town keeps its own name', want: 'Ilaro',
    addr: 'Federal Polytechnic, Ilaro, Ogun State, Nigeria',
    comps: [C('locality', 'Ilaro'), C('administrative_area_level_1', 'Ogun State')] },
];

let pass = 0;
for (const c of cases) {
  const got = derivePlace({ components: c.comps ?? null, formattedAddress: c.addr });
  const ok  = got.city === c.want;
  if (ok) pass += 1;
  console.log(
    (ok ? 'PASS  ' : 'FAIL  ') +
    c.label.padEnd(42) +
    ' got ' + (got.city || '(none)').padEnd(16) +
    ' want ' + c.want.padEnd(16) +
    '[' + got.source + (got.confident ? '' : ', unconfident') + ']',
  );
}

// The Kajola rule itself, stated directly.
console.log('');
console.log('Kajola is a local government in : ' + stateOfLga('Kajola'));
console.log('Olorunda is a local government in: ' + stateOfLga('Olorunda'));
console.log('"Ibadan" recognised as a city   : ' + !!cityFromAddressText('Ibadan'));
console.log('');
console.log(`${pass}/${cases.length} passed`);
