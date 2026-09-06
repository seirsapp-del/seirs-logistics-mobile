import { Calendar as RNCalendar } from 'react-native-calendars';
import { PlacePicker, type PickedPlace } from '@seirs/shared/components/PlacePicker';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, MapPin, Truck, Plus, Trash2,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi, configApi, mapsApi, feesApi } from '@/services/api';
import { derivePlace } from '@seirs/shared/models/cities';
import { naira } from '@/utils/money';
import { alertDialog } from '@/components/SeirsDialog';
import { vehicleLabel } from '@seirs/shared/models/vehicles';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

// Spec V8 §2.18: driver declares an upcoming intercity trip
// (Lagos → Ibadan, etc.). System surfaces matching packages along
// that corridor. Customer chose at booking whether to drop at
// destination address or destination partner store.

/**
 * Departure times a rider can actually leave at. All of them.
 *
 * This ran 04:00 to 22:00, on the reasoning that "anything outside that is a
 * night run nobody is declaring in advance". That assumption is wrong for the
 * country this runs in. Overnight interstate travel is ordinary here: people
 * leave at 23:00 or midnight to miss the heat and the traffic, and a rider
 * doing Lagos to Abuja overnight could not declare their trip AT ALL.
 *
 * The founder hit it on the device at 22:00 trying to declare a trip for that
 * night: "the time is not there, it ends at 22:00". No setting could help,
 * because the list itself did not contain the hours.
 *
 * It is the same mistake as the working-hours bug fixed earlier the same day,
 * where a shop trading 18:00 to 02:00 computed as shut all night. Both came
 * from treating the working day as ending in the evening.
 */
const DEPART_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
})();

const TODAY_ISO = new Date().toISOString().slice(0, 10);

/** "2026-08-27" + "05:30" formatted the way a rider reads it back. */
function prettyDepart(dateISO: string, time: string): string {
  if (!dateISO || !time) return '';
  const d = new Date(`${dateISO}T${time}:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }) + `, ${time}`;
}

const POPULAR_ROUTES = [
  { from: 'Lagos',   to: 'Ibadan' },
  { from: 'Lagos',   to: 'Abuja' },
  { from: 'Ibadan',  to: 'Abuja' },
  { from: 'Lagos',   to: 'Benin' },
  { from: 'Abuja',   to: 'Kano' },
  { from: 'Lagos',   to: tx9('auto.interstate.portHarcourt', 'Port Harcourt') },
];

/**
 * Mirrors PricingService.SEAT_CAPS. The server hard-rejects a passenger
 * declaration above the vehicle's cap, and rejects outright for a class
 * that is missing from the table (bicycle, truck_small, truck_large all
 * resolve to 0).
 *
 * Held client-side because the driver only learned any of this AFTER
 * filling the whole form and tapping Declare: an okada rider typing 3
 * seats got "A motorcycle sells at most 1 seat" on the round trip, and
 * a truck driver got "cannot carry marketplace passengers" having
 * already entered a pickup point and a route distance. There is no
 * endpoint that publishes the caps, so this table is the only way to
 * fail before the driver does the work (2026-08-25 interstate walk).
 */
const SEAT_CAPS: Record<string, number> = {
  motorcycle: 1, tricycle: 3, car: 4, van: 14,
};

/**
 * Straight line to road distance. Mirrors the server's default for the
 * admin-tunable pricing_road_factor, which is what drivers.service uses
 * when it measures the declared stops and writes kmFromOrigin.
 *
 * Held at the same value on purpose: this screen quotes the rider an
 * earnings estimate off its own arithmetic, and if the two factors
 * disagree the rider is shown a number the passenger is never charged.
 * The server's stored figure is still the one that prices a seat.
 */
const ROAD_FACTOR = 1.3;

/**
 * How many places one declared run may name.
 *
 * Not a database limit: a rider has to actually stop at every one of
 * these, and a trip advertising a dozen boarding points is a trip
 * nobody can hold them to.
 */
const MAX_STOPS = 8;

/** Nigerian states come back from Google as "Oyo State". Riders say "Oyo". */
const STATE_SUFFIX = /\s+state$/i;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Last resort when the reverse geocode cannot be reached.
 *
 * Reads the city off the formatted address by dropping the country and
 * the state, which is right for a street address ("Iwo Road, Ibadan,
 * Nigeria") and can land on the state for a bare city pick. It is
 * flagged to the rider when it fires, because a guessed city is exactly
 * the drift the derived field exists to prevent.
 *
 * LAST RESORT ONLY since 2026-09-05. derivePlace runs first and reads
 * the address against the 774-LGA geography, which is what catches the
 * cases this function gets wrong: it would have answered "Oyo", the
 * state, for "Olorunda Aba Market, Ibadan, Oyo, Nigeria", because a bare
 * state name does not match the "X State" pattern it strips. Kept
 * because a rider with no network and no recognised town still needs
 * something in the box.
 */
function cityFromDescription(description: string): string {
  const parts = String(description ?? '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .filter(p => !/^nigeria$/i.test(p))
    .filter(p => !STATE_SUFFIX.test(p));
  return parts.length ? parts[parts.length - 1] : '';
}

/**
 * The city a picked address actually sits in.
 *
 * WHY this is derived and never typed. Two free-text boxes drift: one
 * rider files an Ibadan address under a Lagos label and the trip
 * advertises a route it does not drive. The city is what the browse
 * list shows and what matching reads, so it has to agree with the
 * coordinates underneath it.
 *
 * Google labels the Nigerian town as locality, falling back to the LGA
 * when a place has no locality of its own. Same order the customer and
 * business address pickers already use, so all three apps name a place
 * the same way.
 */
async function deriveCity(place: PickedPlace): Promise<{ city: string; guessed: boolean }> {
  try {
    const json: any = await mapsApi.geocode({ latlng: `${place.lat},${place.lng}` });
    const top = json?.results?.[0];
    const derived = derivePlace({
      components:       top?.address_components ?? null,
      formattedAddress: top?.formatted_address ?? place.description ?? null,
    });
    if (derived.city) {
      return { city: derived.city, guessed: !derived.confident };
    }
  } catch {
    // Offline or a refused key. Read the description instead of leaving
    // the rider with an empty city and no way forward.
  }
  const written = derivePlace({ components: null, formattedAddress: place.description ?? null });
  return { city: written.city || cityFromDescription(place.description), guessed: true };
}

/**
 * One point on the declared route, as the form holds it.
 *
 * Index 0 is the origin and the last is the destination, which is the
 * same ordering the server stores as TripStop.sequence.
 */
type StopDraft = {
  key:         string;
  /** What is typed in the address box, picked or not. */
  query:       string;
  /** Set only once a suggestion is tapped, so it carries coordinates. */
  place:       PickedPlace | null;
  /** Derived from place, never typed. */
  city:        string;
  cityLoading: boolean;
  cityGuessed: boolean;
  /** The rider's own words: "the filling station before the toll gate". */
  description: string;
};

let stopKeySeq = 0;
const blankStop = (): StopDraft => ({
  key: `stop-${stopKeySeq++}`,
  query: '',
  place: null,
  city: '',
  cityLoading: false,
  cityGuessed: false,
  description: '',
});

export default function InterstateScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  /**
   * The whole route, declared before departure.
   *
   * A trip used to be two city names plus one free-text pickup note.
   * That measured every distance city centre to city centre, so a
   * passenger boarding 20km outside Ibadan paid from the middle of
   * Ibadan. And "pick up along my route" told them nothing about where
   * to stand, which the founder called out directly: a rider can wait
   * somewhere else and blame the passenger, and nobody can settle it
   * because no exact place was ever agreed.
   *
   * Every stop is set BEFORE the run, deliberately. Most people book
   * days ahead, and a rider who only names the next pickup after each
   * drop cannot plan the trip they are selling.
   */
  const [stops, setStops] = useState<StopDraft[]>(() => [blankStop(), blankStop()]);

  const [departAt,    setDepartAt]    = useState('');
  // Split so the rider picks a day and a time, never types either.
  const [departDate,  setDepartDate]  = useState('');
  const [departTime,  setDepartTime]  = useState('');
  const [pickerOpen,  setPickerOpen]  = useState(false);

  /**
   * How much notice a trip needs, in minutes.
   *
   * The server refuses a departure inside this window, so the picker must
   * not offer one: a rider who taps a time and is then told no learns that
   * the screen lies to them. 180 is the shipped default and the fallback if
   * the value cannot be fetched, which matches the server's own fallback.
   */
  const [minLeadMins, setMinLeadMins] = useState(180);
  /** And the far end: how many days ahead a trip may be declared. */
  const [maxLeadDays, setMaxLeadDays] = useState(30);
  useEffect(() => {
    let alive = true;
    feesApi.get('corridor_min_lead_minutes')
      .then(r => {
        const v = Number(r?.value);
        if (alive && Number.isFinite(v) && v >= 0) setMinLeadMins(v);
      })
      .catch(() => {});   // keep the default; never block the screen on config
    feesApi.get('corridor_max_lead_days')
      .then(r => {
        const v = Number(r?.value);
        if (alive && Number.isFinite(v) && v > 0) setMaxLeadDays(v);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  /** The last day the calendar will let a rider pick. */
  const maxDateISO = new Date(Date.now() + maxLeadDays * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const origin      = stops[0];
  const destination = stops[stops.length - 1];
  const from        = origin.city.trim();
  const to          = destination.city.trim();

  const patchStop = useCallback((key: string, patch: Partial<StopDraft>) => {
    setStops(list => list.map(s => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  /**
   * A suggestion was tapped, so this stop now has real coordinates and
   * the city can be read off them instead of trusted to typing.
   */
  const onStopPicked = useCallback((key: string, pl: PickedPlace) => {
    patchStop(key, {
      query: pl.primary, place: pl, city: '', cityGuessed: false, cityLoading: true,
    });
    deriveCity(pl).then(({ city, guessed }) => {
      patchStop(key, { city, cityGuessed: guessed, cityLoading: false });
    });
  }, [patchStop]);

  /**
   * A new stop always lands BEFORE the destination, because the
   * destination is the end of the line by definition and a stop added
   * after it is not a stop, it is a different trip.
   */
  const addStop = useCallback(() => {
    setStops(list => (list.length >= MAX_STOPS
      ? list
      : [...list.slice(0, -1), blankStop(), list[list.length - 1]]));
  }, []);

  const removeStop = useCallback((key: string) => {
    setStops(list => (list.length <= 2 ? list : list.filter(s => s.key !== key)));
  }, []);

  const resetStops = useCallback(() => setStops([blankStop(), blankStop()]), []);

  /**
   * departAt stays the single source the submit path reads, so nothing
   * downstream had to change: the two pickers just write into it in the
   * exact shape the old text field produced.
   */
  useEffect(() => {
    setDepartAt(departDate && departTime ? `${departDate} ${departTime}` : '');
  }, [departDate, departTime]);

  /**
   * Distance measured along the stops, not typed and not city to city.
   *
   * routeKm was a free-text field, and seat price is literally
   * seats x rate x km, so whatever a rider typed set what passengers
   * paid. Then it became a straight line between two city centres,
   * which charged a passenger boarding outside Ibadan from the middle
   * of Ibadan. Running the line through every declared stop is both
   * honest and longer, which is the rider's side of the same fix.
   *
   * Entry i holds the km from the origin to stop i, which is exactly
   * what the server stores as TripStop.kmFromOrigin. Null from the
   * first unplaced stop onwards, because a cumulative total with a hole
   * in it is a wrong number rather than a partial one.
   */
  const legKm = useMemo<(number | null)[]>(() => {
    const out: (number | null)[] = [];
    let total  = 0;
    let broken = false;
    stops.forEach((s, i) => {
      if (!s.place) broken = true;
      if (broken) { out.push(null); return; }
      if (i > 0) {
        const prev = stops[i - 1].place!;
        total += haversineKm(prev.lat, prev.lng, s.place!.lat, s.place!.lng) * ROAD_FACTOR;
      }
      out.push(Math.round(total * 10) / 10);
    });
    return out;
  }, [stops]);

  const lastLeg = legKm[legKm.length - 1];
  const km      = lastLeg != null ? Math.round(lastLeg) : 0;

  /** Stops that carry coordinates, in travel order, for the map. */
  const placedStops = useMemo(
    () => stops.filter((s): s is StopDraft & { place: PickedPlace } => !!s.place),
    [stops],
  );

  /**
   * Re-fit as stops are added, rather than initialRegion once on mount.
   * A rider who adds Sagamu to a Lagos to Ibadan run should see it, not
   * a frame set before the stop existed.
   *
   * Keyed on the coordinates alone and nothing else. The stop list is
   * new on every keystroke, so a memo over the list itself would hand
   * MapView a fresh region while the rider is still typing a landmark
   * and pan the map out from under their thumb.
   */
  const routeKey = placedStops.map(s => `${s.place.lat},${s.place.lng}`).join('|');
  const routeCoords = useMemo(() => (
    routeKey
      ? routeKey.split('|').map((p) => {
          const [lat, lng] = p.split(',').map(Number);
          return { latitude: lat, longitude: lng };
        })
      : []
  ), [routeKey]);

  const region = useMemo(() => {
    if (routeCoords.length < 2) return null;
    const lats = routeCoords.map(c => c.latitude);
    const lngs = routeCoords.map(c => c.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    return {
      latitude:       (minLat + maxLat) / 2,
      longitude:      (minLng + maxLng) / 2,
      latitudeDelta:  Math.max((maxLat - minLat) * 1.8, 0.6),
      longitudeDelta: Math.max((maxLng - minLng) * 1.8, 0.6),
    };
  }, [routeCoords]);

  const [vehicleSpace,setVehicleSpace]= useState('1');

  // Travel Buddy (founder 23 Aug): sell what the vehicle truly has.
  const [takePassengers, setTakePassengers] = useState(false);
  const [seats,          setSeats]          = useState('1');
  const [takePackages,   setTakePackages]   = useState(true);

  /**
   * Lift a picker clear of the keyboard when its suggestions arrive.
   *
   * The first version scrolled to a y captured by onLayout, which is
   * relative to the PARENT rather than the scroll content. FROM and TO
   * sit near the top so it looked correct; the pickup point, deep in
   * the form, scrolled to the wrong place and stayed buried (founder,
   * on the handset: "when i try typing in the pickup point why is it
   * under my keyboard").
   *
   * The picker now measures how much of its OWN list the keyboard is
   * covering and hands back the number, so this just scrolls by that
   * much from wherever the form currently is. Correct for any field at
   * any depth, and it needs no layout bookkeeping at all. Memoised
   * because the picker keys a debounce effect off this prop, and a stop
   * list that re-renders on every keystroke would otherwise reset the
   * timer forever and never search.
   */
  const scrollRef = useRef<ScrollView>(null);

  /**
   * Standing work limits (2026-08-31), loaded from the driver profile
   * and saved one field at a time so a half-typed km box never clears
   * the interstate switch.
   */
  const [acceptsInterstate, setAcceptsInterstate] = useState(true);
  const [maxTripKm,         setMaxTripKm]         = useState('');
  const [prefSaving,        setPrefSaving]        = useState(false);

  useEffect(() => {
    let cancelled = false;
    driversApi.me()
      .then((d: any) => {
        if (cancelled || !d) return;
        setAcceptsInterstate(d.acceptsInterstate !== false);
        setMaxTripKm(d.maxTripKm != null ? String(d.maxTripKm) : '');
      })
      .catch(() => { /* keep the permissive defaults */ });
    return () => { cancelled = true; };
  }, []);

  const saveInterstatePref = async (next: boolean) => {
    // Optimistic: the switch must feel instant. Reverted on failure so
    // the rider is never shown a preference the server did not take.
    const previous = acceptsInterstate;
    setAcceptsInterstate(next);
    setPrefSaving(true);
    try {
      await driversApi.setWorkPreferences({ acceptsInterstate: next });
    } catch (e: any) {
      setAcceptsInterstate(previous);
      alertDialog('Could not save that', e?.message ?? 'Try again in a moment.');
    } finally {
      setPrefSaving(false);
    }
  };

  const saveMaxTripKm = async () => {
    setPrefSaving(true);
    try {
      const trimmed = maxTripKm.trim();
      await driversApi.setWorkPreferences({ maxTripKm: trimmed === '' ? null : Number(trimmed) });
      alertDialog(
        'Saved',
        trimmed === ''
          ? 'No distance limit: any length of run can reach you.'
          : `You will not be offered runs longer than ${trimmed} km.`,
      );
    } catch (e: any) {
      alertDialog('Could not save that', e?.message ?? 'Try again in a moment.');
    } finally {
      setPrefSaving(false);
    }
  };
  const scrollY   = useRef(0);
  const liftBy = useCallback((hiddenPx: number) => {
    if (!(hiddenPx > 0)) return;
    scrollRef.current?.scrollTo({ y: scrollY.current + hiddenPx, animated: true });
  }, []);

  const [submitting,  setSubmitting]  = useState(false);
  const [sheet,       setSheet]       = useState<SeirsSheetSpec | null>(null);

  /**
   * The vehicle class decides whether seats can be sold at all, and how
   * many. Loaded once so the form can refuse before the driver invests
   * the effort, instead of relaying a server rejection.
   */
  const [vehicleType, setVehicleType] = useState<string | null>(null);
  const seatCap = vehicleType ? (SEAT_CAPS[vehicleType] ?? 0) : null;

  /**
   * What a seat on this trip is worth, and what the rider keeps.
   *
   * The declare screen showed no money at all. A rider committed a trip
   * across the country with no idea what it paid, while the passenger
   * browsing it saw the price plainly (founder 2026-08-27: "does the
   * driver see the price, also whats seirs share").
   *
   * There is no seat-quote endpoint, so this uses the same arithmetic
   * the server uses, off the same public rate card: seats x rate x km,
   * and the rider keeps 75% of that. Labelled an estimate because the
   * server prices the booking for real and time surcharges can move it.
   */
  const [seatRateNgn, setSeatRateNgn] = useState<number | null>(null);

  useEffect(() => {
    configApi.rateCard()
      .then((card: any) => {
        const rates = card?.seatRates ?? {};
        const r = Number(rates?.[vehicleType ?? '']);
        setSeatRateNgn(Number.isFinite(r) && r > 0 ? r : null);
      })
      .catch(() => setSeatRateNgn(null));
  }, [vehicleType]);

  const perSeatNgn   = seatRateNgn != null ? seatRateNgn * km : null;
  const riderPerSeat = perSeatNgn != null ? perSeatNgn * 0.75 : null;
  const riderAllSeats = riderPerSeat != null
    ? riderPerSeat * Math.max(1, Number(seats) || 1)
    : null;


  // The declared list + cancel existed as endpoints since spec 2.18;
  // the screen never showed them, so a driver could declare a trip and
  // then neither see nor undo it (founder audit 2026-08-22).
  const [myTrips, setMyTrips] = useState<any[]>([]);
  const loadTrips = () => {
    driversApi.myInterstateTrips()
      .then((rows: any[]) => setMyTrips(
        /**
         * Also drop trips whose departure has passed. listMyInterstateTrips
         * returns the last 50 rows with no date filter, and nothing ever
         * flips a departed trip out of "active", so a run to Ibadan from
         * three weeks ago sat in MY DECLARED TRIPS forever reading as
         * live. It is dead to the rest of the system already: browseTrips
         * requires departAt > NOW() and the matcher only looks +/-24h
         * around departure (2026-08-25 interstate walk).
         */
        (rows ?? []).filter(r => r.status === 'active' && new Date(r.departAt).getTime() > Date.now()),
      ))
      .catch(() => {});
  };
  useEffect(() => {
    loadTrips();
    driversApi.me()
      .then((d: any) => setVehicleType(d?.vehicleType ?? null))
      .catch(() => {});
  }, []);

  const cancelTrip = (trip: any) => {
    const booked = Math.max(0, Number(trip.seatsBooked ?? 0));
    /**
     * The old copy said only "You will stop receiving packages matched
     * to this route", which is the smaller half of what cancelling does
     * and says nothing at all when people have paid for seats. Nothing
     * server-side blocks the cancel or warns the driver, so this dialog
     * is the only place a rider can learn that passengers are riding on
     * this decision (2026-08-25 interstate walk).
     */
    const sells = [
      trip.acceptsPackages ? 'packages' : null,
      trip.acceptsPassengers ? 'passenger seats' : null,
    ].filter(Boolean).join(' and ') || 'this route';
    setSheet({
      title: tr('auto.interstate.cancelThisTrip', 'Cancel this trip?'),
      message: booked > 0
        ? `${trip.fromCity} → ${trip.toCity}. ${booked} seat${booked === 1 ? '' : 's'} already booked and paid for on this trip. Cancelling delists it, and anyone still waiting on your answer gets refunded. If a passenger is counting on this run, tell them in chat first.`
        : `${trip.fromCity} → ${trip.toCity}. You will be delisted and stop being matched for ${sells}.`,
      options: [
        {
          label: tr('auto.interstate.cancelThisTrip2', 'Cancel this trip'),
          sub: booked > 0 ? `${booked} paid seat${booked === 1 ? '' : 's'} on it` : undefined,
          variant: 'destructive',
          icon: 'close-circle-outline',
          onPress: async () => {
            try { await driversApi.cancelInterstateTrip(trip.id); loadTrips(); }
            catch (e: any) { alertDialog('Could not cancel', e?.message ?? 'Try again.'); }
          },
        },
      ],
      cancelLabel: tr('auto.interstate.keepTheTrip', 'Keep the trip'),
    });
  };

  const submit = async () => {
    /**
     * Every stop must be PICKED, not typed.
     *
     * Without coordinates a stop is words, and words are what let a
     * rider wait somewhere else and blame the passenger. Refusing here,
     * naming the stop, beats saving a route nobody can be held to.
     */
    const unpicked = stops.findIndex(s => !s.place);
    if (unpicked >= 0) {
      const which = unpicked === 0
        ? 'Choose your starting point'
        : unpicked === stops.length - 1
          ? 'Choose your destination'
          : `Stop ${unpicked} has no place yet`;
      alertDialog(
        which,
        'Tap a suggestion as you type so the stop gets real coordinates. A place we cannot pin is a place a passenger cannot find, and the distance is measured from it.',
      );
      return;
    }
    // The city comes off the address, so an empty one means the lookup
    // never landed. Sending a blank city would put the trip in the
    // browse list under no city at all.
    const cityless = stops.findIndex(s => !s.city.trim());
    if (cityless >= 0) {
      alertDialog(
        'We could not read the city for one of your stops',
        'Tap that address again so we can place it. The city is read off the address on purpose: it is what stops an Ibadan address being filed under a Lagos label.',
      );
      return;
    }
    // The server rejects a same-city trip. Catch it here so the driver
    // is not told after the round trip (2026-08-25 interstate walk).
    if (from.toLowerCase() === to.toLowerCase()) {
      alertDialog(
        'Same city twice',
        `Your first and last stop are both in ${from}. An intercity trip has to end somewhere else.`,
      );
      return;
    }
    if (!departAt) { alertDialog('Departure time required'); return; }
    // Accept "YYYY-MM-DD HH:mm" form by normalizing to ISO before sending.
    const depart = departAt.includes('T') ? departAt : departAt.replace(' ', 'T');
    if (Number.isNaN(new Date(depart).getTime())) {
      alertDialog('Invalid departure', 'Use the format YYYY-MM-DD HH:mm.');
      return;
    }
    // Same reason as the same-city check: the server refuses a departure
    // in the past, and a driver declaring at the park types today's date
    // with an hour that has already gone more often than any other slip.
    if (new Date(depart).getTime() < Date.now() - 60_000) {
      alertDialog('Departure already passed', 'Pick a date and time still ahead of you.');
      return;
    }
    // A trip that carries neither is inert: the server stores it, it is
    // listed nowhere useful, and nothing will ever be offered against it.
    if (!takePackages && !takePassengers) {
      alertDialog('Nothing to offer', 'Turn on packages, passengers, or both. A trip carrying neither is not listed.');
      return;
    }
    if (takePassengers) {
      if (seatCap === 0) {
        alertDialog(
          'This vehicle cannot sell seats',
          `A ${vehicleType ?? 'vehicle'} is not a marketplace passenger class. You can still carry packages on this run.`,
        );
        return;
      }
      if (seatCap != null && (Number(seats) || 0) > seatCap) {
        alertDialog(
          'Too many seats',
          `A ${vehicleLabel(vehicleType)} sells at most ${seatCap} seat${seatCap === 1 ? '' : 's'}. No squeezing: that is the rule.`,
        );
        return;
      }
      // Seat pricing is per kilometre, so a trip with no route distance
      // is browsable but every booking on it dies at payment with a
      // message the PASSENGER sees and the driver never does.
      if (!(km > 0)) {
        alertDialog(
          'Route distance needed',
          'Seats are priced by distance, and we measure it along the stops you picked. Check every stop has a place on the map.',
        );
        return;
      }
      /**
       * The twelve-city gate that used to sit here is gone. It refused
       * any city outside DeliveriesService.CITY_COORDS, because a seat
       * booking needed coordinates for both ends and the server could
       * only look them up by name. Both ends now travel with the
       * declaration as real coordinates from the picker, so bookTripSeats
       * reads them directly and Jos books exactly like Ibadan.
       */
    }
    setSubmitting(true);
    try {
      /**
       * The origin stop IS the boarding point, so pickupAddress carries
       * the rider's own words when they gave any: "Berger Bus Stop (the
       * filling station before the toll gate)" is what a passenger
       * needs, and the pin underneath it is what settles an argument.
       * Sliced to the column's 255.
       */
      const pickupLabel = (origin.description.trim()
        ? `${origin.place!.description} (${origin.description.trim()})`
        : origin.place!.description).slice(0, 255);

      const body = {
        fromCity:        from,
        toCity:          to,
        /**
         * bookTripSeats reads trip.pickupLat for the passenger's map, so
         * this is the origin STOP and never the city centre. The two
         * used to be the same value, which pointed a passenger's map at
         * the middle of the city under a pickup label that named a
         * junction (founder spotted it on screen, 2026-08-27).
         */
        pickupLat:       origin.place!.lat,
        pickupLng:       origin.place!.lng,
        destLat:         destination.place!.lat,
        destLng:         destination.place!.lng,
        destAddress:     destination.place!.description.slice(0, 240),
        departAt:        new Date(depart).toISOString(),
        spareCapacityKg: Number(vehicleSpace) || 0,
        acceptsPassengers: takePassengers,
        seatsTotal:        takePassengers ? (Number(seats) || 1) : 0,
        acceptsPackages:   takePackages,
        /**
         * Always 'fixed' now. 'along_route' meant no label, no pin and
         * no window, which is the exact hole the founder named: a rider
         * can wait somewhere else and blame the passenger, and nobody
         * can settle it because no exact place was ever agreed. Every
         * declared trip names a boarding place, so the vague mode has
         * nothing left to describe.
         */
        pickupMode:      'fixed' as const,
        pickupAddress:   pickupLabel,
        routeKm:         km > 0 ? km : undefined,
        /**
         * kmFromOrigin is deliberately absent: the server measures it
         * off these coordinates and stores it, so a seat quoted today
         * cannot reprice tomorrow because the app rounded differently.
         */
        stops: stops.map(s => ({
          city:        s.city.trim(),
          address:     s.place!.description,
          latitude:    s.place!.lat,
          longitude:   s.place!.lng,
          description: s.description.trim() || undefined,
        })),
      };

      /**
       * Declare with the route, fall back to the two cities.
       *
       * stops rides on the same endpoint as an optional field, so a
       * server that has not shipped it yet simply ignores it. The one
       * case that needs handling is a server that REFUSES a body key it
       * does not know, which would take the whole declaration down with
       * it. Retried without stops only for that specific shape of
       * failure: a genuine rejection (same city, seat cap, past
       * departure) must not be retried, or a partial save becomes two
       * declared trips.
       */
      let degraded = false;
      try {
        await driversApi.declareInterstateTrip(body);
      } catch (e: any) {
        const msg = String(e?.message ?? '');
        if (!/cannot post|should not exist|unexpected (property|field)/i.test(msg)) throw e;
        const fallback: any = { ...body };
        delete fallback.stops;
        await driversApi.declareInterstateTrip(fallback);
        degraded = true;
      }
      /**
       * The old line was "Matching packages will appear in your available
       * jobs", which promises a queue that does not exist. What a declared
       * trip actually buys on the package side is a ranking bonus in
       * dispatch (matching.service.ts adds it when both declared cities
       * appear in the booking's addresses, and only within 24 hours of
       * departure). Nothing is reserved and no separate list is built, so
       * a driver who reads "will appear" and waits is waiting for a screen
       * that never fills.
       *
       * The passenger side is the opposite: a seat booking is a real,
       * paid, personal offer that expires if unanswered, which is the part
       * a driver most needs to be told about (2026-08-25 interstate walk).
       */
      const when = new Date(depart).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const lines = [
        takePassengers
          ? 'Passengers can now find and book your seats. A booking arrives as a job offer you accept or decline, and it expires if you leave it, so watch your notifications.'
          : null,
        takePackages
          ? 'Packages running between these cities are ranked towards you around your departure. That is a better chance, not a reservation, so keep working the normal job list.'
          : null,
        degraded && stops.length > 2
          ? 'One thing to know: this server saved your start and finish but not the stops in between yet. The trip is live, the route is the two ends.'
          : null,
      ].filter(Boolean).join('\n\n');
      /**
       * The corridor, set on every declared trip.
       *
       * It was wired only to the old "pick up along my route" mode, and
       * that mode is gone. The corridor is a PACKAGE ranking device, not
       * a passenger promise: driver.corridorDestLat/Lng/Label/ExpiresAt,
       * from 21 Aug, scoring up jobs whose pickup AND drop hug the line
       * the courier is already driving. A rider who has declared Lagos to
       * Ibadan is driving that line whatever the boarding arrangement, so
       * gating it on a pickup mode only ever cost them work.
       *
       * The window runs from now until the trip should be over: the hours
       * until departure, plus the drive at a deliberately generous 45km/h
       * average, plus two hours of Nigerian road. A corridor that expires
       * mid-journey stops matching exactly when the rider is most able to
       * pick something up.
       */
      try {
        const departsInH = Math.max(0, (new Date(depart).getTime() - Date.now()) / 3600000);
        const driveH     = km / 45;
        const hours      = Math.ceil(departsInH + driveH + 2);
        await driversApi.setCorridor(
          destination.place!.lat,
          destination.place!.lng,
          `${from} to ${to}`,
          Math.min(hours, 48),
        );
      } catch {
        // The trip is declared either way. A corridor that failed to
        // set costs matching quality, not the booking, so it must not
        // surface as a failure the rider has to act on.
      }

      const routeLine = stops.map(s => s.city.trim()).filter(Boolean).join(' → ');
      const clear = () => {
        loadTrips();
        resetStops();
        setDepartAt(''); setDepartDate(''); setDepartTime('');
      };
      setSheet({
        title: tr('auto.interstate.tripDeclared', 'Trip declared'),
        message: tx9('auto.interstate.youAreListedForOn', 'You are listed for {{routeLine}} on {{when}}. {{lines}}', { routeLine, when, lines }),
        options: [{
          label: tr('auto.profile.done', 'Done'),
          variant: 'primary',
          icon: 'checkmark-circle-outline',
          onPress: clear,
        }],
        cancelLabel: null,
        onCancel: clear,
      });
    } catch (e: any) {
      alertDialog('Could not declare trip', e?.message ?? 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * One point on the route: city and exact address side by side, with
   * room underneath for how to find it.
   *
   * The two boxes are not two inputs. Only the address is typed; the
   * city reads back what that address resolved to, so the label and the
   * pin can never disagree (founder: "two boxes next to each other city
   * from/to, and the start/finish with exact location and coordinate").
   */
  const renderStop = (stop: StopDraft, index: number) => {
    const isOrigin = index === 0;
    const isDest   = index === stops.length - 1;
    const dot      = isOrigin ? '#16A34A' : isDest ? '#EF4444' : '#D97706';
    const role     = isOrigin ? 'STARTING POINT' : isDest ? 'DESTINATION' : `STOP ${index}`;
    const fromOrigin = legKm[index];

    return (
      <View
        key={stop.key}
        style={[styles.stopCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <View style={styles.stopHead}>
          <View style={[styles.stopDot, { backgroundColor: dot }]} />
          <Text style={[styles.stopRole, { color: theme.textSecond }]}>{role}</Text>
          {!isOrigin && !isDest && (
            <Pressable onPress={() => removeStop(stop.key)} hitSlop={10}>
              <Trash2 size={16} color="#DC2626" />
            </Pressable>
          )}
          {!isOrigin && fromOrigin != null && fromOrigin > 0 && (
            <Text style={[styles.stopKm, { color: theme.textThird }]}>
              {fromOrigin} km in
            </Text>
          )}
        </View>

        <View style={styles.stopRow}>
          <View style={{ width: 104 }}>
            <Text style={[styles.miniLabel, { color: theme.textSecond }]}>CITY</Text>
            <View style={[styles.cityBox, {
              borderColor: theme.border,
              backgroundColor: theme.surfaceSecond,
            }]}>
              {stop.cityLoading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Text
                  numberOfLines={1}
                  // Shrinks rather than truncating. The city box is half
                  // width by design, and a long name is the whole point of
                  // the field, so "Ibadan" must never render as "Ibad...".
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{
                    fontSize: FontSize.md,
                    color: stop.city ? theme.text : theme.textThird,
                    fontWeight: stop.city ? FontWeight.semibold : FontWeight.regular,
                  }}
                >
                  {/*
                    The empty state said "From address", which did not fit
                    the box and rendered as "From a..." on device. A
                    truncated hint is worse than a short one: it reads as a
                    bug rather than an instruction. One word, and the label
                    above already says CITY.
                  */}
                  {stop.city || tx9('auto.interstate.auto', 'Auto')}
                </Text>
              )}
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <PlacePicker
              label={tx('auto.interstate.exactAddress', 'EXACT ADDRESS')}
              onSuggestionsShown={liftBy}
              value={stop.query}
              onChangeText={(t) => patchStop(stop.key, {
                query: t, place: null, city: '', cityGuessed: false, cityLoading: false,
              })}
              onPicked={(pl) => onStopPicked(stop.key, pl)}
              placeholder={isOrigin ? tx9('auto.interstate.eGBergerBusStop', 'e.g. Berger Bus Stop') : isDest ? tx9('auto.interstate.whereYouFinish', 'Where you finish') : tx9('auto.interstate.whereYouStop', 'Where you stop')}
              theme={theme as any}
            />
          </View>
        </View>

        {!!stop.query.trim() && !stop.place && (
          <Text style={[styles.warn, { color: '#D97706' }]}>
            {tr('auto.interstate.tapASuggestionSoThis', 'Tap a suggestion so this stop gets a real pin. Typed on its own it is only words, and words cannot settle where you actually waited.')}
          </Text>
        )}
        {/*
          The wording covers BOTH reasons this fires (2026-09-05).

          It used to say "because the map lookup did not answer", which was
          the only cause when it was written. Since derivePlace landed there
          is a second: the lookup answers fine, but with a name we do not
          recognise as a town, which happens for any place not in our list.
          Claiming the lookup failed would be a false explanation of a true
          warning, so the notice now says what it actually knows and why it
          matters.
        */}
        {stop.cityGuessed && !!stop.city && (
          <Text style={[styles.warn, { color: '#D97706' }]}>
            We read {stop.city} {tr('auto.interstate.offTheAddressAndWe', 'off the address, and we are not certain of it. Check it before you declare: passengers find this trip by searching that name.')}
          </Text>
        )}

        <View style={{ gap: 6 }}>
          <Text style={[styles.miniLabel, { color: theme.textSecond }]}>
            {tr('auto.interstate.howToFindThisSpot', 'HOW TO FIND THIS SPOT (OPTIONAL)')}
          </Text>
          <TextInput
            value={stop.description}
            onChangeText={(t) => patchStop(stop.key, { description: t })}
            maxLength={300}
            placeholder={tx('auto.interstate.eGTheFillingStation', 'e.g. the filling station before the toll gate')}
            placeholderTextColor={theme.textThird}
            style={[styles.input, {
              color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceSecond,
            }]}
          />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.interstate.declareIntercityTrip', 'Declare Intercity Trip')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        >

          {/*
            Standing interstate preference (2026-08-31).

            Everything else on this screen is about ONE declared trip.
            This is the rider's standing answer to "do you leave your
            state at all", and it had no home anywhere in the product:
            the only way to refuse interstate work was to decline each
            job, which costs a rider their acceptance rate for answering
            honestly. It sits here because this is the screen where a
            rider is already thinking about intercity work.

            Defaults to accepting, so nobody loses work by not finding
            this control.
          */}
          <View style={[styles.prefCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.prefTitle, { color: theme.text }]}>{tx('auto.interstate.takeInterstateWork', 'Take interstate work')}</Text>
                <Text style={[styles.prefSub, { color: theme.textSecond }]}>
                  {acceptsInterstate
                    ? tx9('auto.interstate.runsThatLeaveYourState', 'Runs that leave your state can be offered to you.')
                    : tx9('auto.interstate.youWillOnlyBeOffered', 'You will only be offered runs inside your own state.')}
                </Text>
              </View>
              <Switch
                value={acceptsInterstate}
                onValueChange={saveInterstatePref}
                disabled={prefSaving}
                trackColor={{ false: theme.border, true: theme.primary }}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={[styles.prefSub, { color: theme.textSecond, marginBottom: 6 }]}>
                {tr('auto.interstate.longestTripYouWillTake', 'Longest trip you will take (km). Leave empty for no limit.')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  value={maxTripKm}
                  onChangeText={(v) => setMaxTripKm(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder={tx('auto.interstate.noLimit', 'No limit')}
                  placeholderTextColor={theme.textThird}
                  style={[styles.prefInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
                />
                <Pressable
                  onPress={saveMaxTripKm}
                  disabled={prefSaving}
                  style={[styles.prefSaveBtn, { backgroundColor: prefSaving ? theme.border : theme.primary }]}
                >
                  <Text style={styles.prefSaveTxt}>{prefSaving ? tx9('auto.interstate.saving', 'Saving') : tx9('auto.earnings.save', 'Save')}</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {myTrips.length > 0 && (
            <View style={{ gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: 0.6, color: theme.textSecond }}>
                {tr('auto.interstate.myDeclaredTrips', 'MY DECLARED TRIPS')}
              </Text>
              {myTrips.map((tr) => {
                /**
                 * Seat bookings were completely invisible here. The card
                 * printed cities, departure and spare kg only, so a driver
                 * selling four seats with three already paid for saw the
                 * exact same card as a driver nobody had booked. The
                 * numbers were in the payload the whole time:
                 * listMyInterstateTrips returns the trip entity, seatsTotal
                 * and seatsBooked included. People turning up at a park to
                 * meet a driver who does not know they exist is the worst
                 * failure this screen can cause (2026-08-25 interstate walk).
                 */
                const total  = Math.max(0, Number(tr.seatsTotal ?? 0));
                const booked = Math.max(0, Number(tr.seatsBooked ?? 0));
                const left   = Math.max(0, total - booked);
                const kg     = Number(tr.spareCapacityKg ?? 0);
                /**
                 * listMyInterstateTrips does not join the stops yet, so
                 * this reads whatever the row happens to carry rather
                 * than assuming. It lights up on its own the day the
                 * list starts returning them.
                 */
                const rowStops = Array.isArray(tr.stops) ? tr.stops : [];
                const midStops = Math.max(0, rowStops.length - 2);
                return (
                  <View key={tr.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: theme.surface, borderColor: booked > 0 ? theme.primary : theme.border, borderWidth: booked > 0 ? 1.5 : 1, borderRadius: Radius.lg, padding: 12 }}>
                    <MapPin size={16} color={theme.primary} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>
                        {tr.fromCity} → {tr.toCity}
                      </Text>
                      <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, marginTop: 1 }}>
                        Departs {new Date(tr.departAt).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={{ color: theme.textThird, fontSize: FontSize.xs, marginTop: 2 }}>
                        {tr.acceptsPackages
                          ? `Packages${kg > 0 ? tx9('auto.interstate.kgSpare', ', {{kg}}kg spare', { kg }) : ''}`
                          : tx9('auto.interstate.noPackages', 'No packages')}
                        {' · '}
                        {tr.acceptsPassengers ? `${total} seat${total === 1 ? '' : 's'}` : tx9('auto.interstate.noSeats', 'No seats')}
                        {midStops > 0 ? tx9('auto.interstate.stopOnTheWay', '· {{midStops}} stop{{v1}} on the way', { midStops, v1: midStops === 1 ? '' : 's' }) : ''}
                        {tr.pickupAddress ? tx9('auto.interstate.boardsAt', '· boards at {{pickupAddress}}', { pickupAddress: tr.pickupAddress }) : ''}
                      </Text>
                      {tr.acceptsPassengers && booked > 0 && (
                        <Text style={{ color: theme.primary, fontSize: FontSize.xs, fontWeight: '700', marginTop: 4 }}>
                          {booked} seat{booked === 1 ? '' : 's'} booked and paid
                          {left > 0 ? tx9('auto.interstate.stillOpen', ', {{left}} still open', { left }) : tx9('auto.interstate.full', ', full')}
                        </Text>
                      )}
                    </View>
                    {/* Edit above Cancel: a wrong departure or a seat
                        count one too low used to mean cancelling the
                        whole route and declaring it again, stops and
                        all (founder 2026-08-29). */}
                    <View style={{ alignItems: 'flex-end', gap: 8 }}>
                      <Pressable
                        onPress={() => router.push(`/(driver)/edit-trip/${tr.id}` as any)}
                        hitSlop={8}
                      >
                        <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>{tr('auto.interstate.edit', 'Edit')}</Text>
                      </Pressable>
                      <Pressable onPress={() => cancelTrip(tr)} hitSlop={8}>
                        <Text style={{ color: '#DC2626', fontSize: FontSize.sm, fontWeight: '700' }}>{tx('auto.interstate.cancel', 'Cancel')}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={[styles.intro, { backgroundColor: theme.primary + '12' }]}>
            <Truck size={20} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.introTitle, { color: theme.text }]}>{tx('auto.interstate.earnExtraOnLongHaul', 'Earn extra on long-haul trips')}</Text>
              {/* Was "matching packages along your route will be auto-offered",
                  which describes a feed that does not exist: packages get a
                  ranking bonus, seats get a real booking. Passengers were not
                  mentioned at all even though they are the half that pays up
                  front (2026-08-25 interstate walk). */}
              <Text style={[styles.introSub, { color: theme.textSecond }]}>
                {tr('auto.interstate.setOutTheWholeRun', 'Set out the whole run before you leave: where you start, anywhere you stop, where you finish. Passengers can book your spare seats, and packages going the same way are ranked towards you.')}
              </Text>
            </View>
          </View>

          {/* Popular routes. These seed the two address boxes and nothing
              more: the rider still taps a suggestion in each, because a
              corridor name is not a place and the distance is measured from
              places. Adding a stop from a different corridor makes no sense,
              so this starts the route over. */}
          <Text style={[styles.label, { color: theme.textSecond }]}>{tr('auto.interstate.popularRoutes', 'POPULAR ROUTES')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {POPULAR_ROUTES.map(r => (
              <Pressable
                key={`${r.from}-${r.to}`}
                onPress={() => setStops([
                  { ...blankStop(), query: r.from },
                  { ...blankStop(), query: r.to },
                ])}
                style={[styles.routeChip, { borderColor: theme.border, backgroundColor: theme.surface }]}
              >
                <Text style={{ color: theme.text, fontSize: FontSize.xs, fontWeight: FontWeight.bold }}>{r.from} → {r.to}</Text>
                <Text style={{ color: theme.textSecond, fontSize: FontSize.xs }}>{tr('auto.interstate.tapToStart', 'tap to start')}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* ── The route, stop by stop ──────────────────────────────── */}
          <Text style={[styles.label, { color: theme.textSecond, marginTop: Spacing.md }]}>
            {tr('auto.interstate.yourRoute', 'YOUR ROUTE')}
          </Text>
          <Text style={[styles.helper, { color: theme.textThird, marginBottom: 4 }]}>
            {tr('auto.interstate.nameEveryPlaceYouWill', 'Name every place you will stop, in order, before you set off. Passengers book days ahead and plan around the route you sell them.')}
          </Text>

          {stops.slice(0, -1).map((stop, i) => (
            <View key={stop.key} style={{ gap: 4 }}>
              {renderStop(stop, i)}
              <View style={styles.connector}>
                <View style={{ width: 2, height: 12, backgroundColor: theme.border }} />
              </View>
            </View>
          ))}

          {stops.length < MAX_STOPS ? (
            <Pressable
              onPress={addStop}
              style={[styles.addStop, { borderColor: theme.primary, backgroundColor: theme.primary + '10' }]}
            >
              <Plus size={16} color={theme.primary} />
              <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>
                {tr('auto.interstate.addAStopOnThe', 'Add a stop on the way')}
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.helper, { color: theme.textThird, textAlign: 'center' }]}>
              {MAX_STOPS} {tr('auto.interstate.stopsIsTheLimitOn', 'stops is the limit on one run. You have to stop at every one of these, and a route nobody can hold you to is worth nothing.')}
            </Text>
          )}

          <View style={styles.connector}>
            <View style={{ width: 2, height: 12, backgroundColor: theme.border }} />
          </View>
          {renderStop(destination, stops.length - 1)}

          {/**
            * Route, map and money, together and near the top.
            *
            * Route distance used to sit at the very BOTTOM of the form as
            * an editable box, and there was no map anywhere on the screen
            * (founder 2026-08-27: "not a single physical map in sight on
            * this screen and why is the route distance at the bottom").
            *
            * It belongs here because it is the CONSEQUENCE of the stops
            * above it: name the places, and this is what the trip is.
            */}
          {region && (
            <View style={{
              marginTop: Spacing.md,
              borderRadius: Radius.lg,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              overflow: 'hidden',
            }}>
              <MapView
                provider={PROVIDER_GOOGLE}
                style={{ height: 180, width: '100%' }}
                /*
                 * pointerEvents alone does not stop the Android map from taking
                 * the gesture: a vertical swipe over it panned the route out to
                 * sea instead of scrolling the form (founder watching, 2026-09-05).
                 * The map is a picture here, not a control, so its own gestures
                 * are switched off and the ScrollView keeps the finger.
                 */
                pointerEvents="none"
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
                region={region}
              >
                {placedStops.map((s, i) => {
                  const isOrigin = stops[0].key === s.key;
                  const isDest   = stops[stops.length - 1].key === s.key;
                  return (
                    <Marker
                      key={s.key}
                      coordinate={{ latitude: s.place.lat, longitude: s.place.lng }}
                      pinColor={isOrigin ? '#16A34A' : isDest ? '#EF4444' : '#D97706'}
                      title={s.city || s.place.primary}
                      /**
                       * The rider's own words on the pin, because that is
                       * what the passenger is navigating by. Seeing where
                       * you have just sent someone before you commit to it
                       * is the point of the map (founder: "shouldn't we be
                       * able to see the exact pickup point instead of a
                       * text that says this and that").
                       */
                      description={s.description.trim() || s.place.description}
                    />
                  );
                })}
                <Polyline
                  coordinates={routeCoords}
                  strokeColor={theme.primary}
                  strokeWidth={3}
                />
              </MapView>

              <View style={{ padding: Spacing.md, gap: 10 }}>
                <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>
                  {placedStops.map(s => s.city || s.place.primary).join('  →  ')}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.6 }}>
                    {tr('auto.interstate.routeDistance', 'ROUTE DISTANCE')}
                  </Text>
                  <Text style={{ color: theme.text, fontSize: FontSize.lg, fontWeight: '800' }}>
                    {km > 0 ? `${km} km` : '--'}
                  </Text>
                </View>
                {/**
                  * Read-only. It used to be a text box, and seat price is
                  * literally seats x rate x km, so whatever a rider typed
                  * set what passengers paid (founder: "the route is
                  * editable, why wont a driver increase the distance").
                  * They would, and nothing stopped them.
                  */}
                <Text style={{ color: theme.textThird, fontSize: FontSize.xs, lineHeight: 16 }}>
                  {tr('auto.interstate.measuredAlongTheStopsYou', 'Measured along the stops you picked, not between city centres. SEIRS sets this, not the driver, because it is what passengers are charged per kilometre.')}
                </Text>

                {riderPerSeat != null && km > 0 && (
                  <View style={{
                    borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10, gap: 4,
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: theme.textSecond, fontSize: FontSize.sm }}>{tx('auto.interstate.youEarnPerSeat', 'You earn per seat')}</Text>
                      <Text style={{ color: theme.text, fontSize: FontSize.base, fontWeight: '700' }}>
                        {naira(riderPerSeat)}
                      </Text>
                    </View>
                    {takePassengers && (Number(seats) || 0) > 1 && riderAllSeats != null && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: theme.textSecond, fontSize: FontSize.sm }}>
                          If all {Number(seats)} seats sell
                        </Text>
                        <Text style={{ color: theme.primary, fontSize: FontSize.base, fontWeight: '800' }}>
                          {naira(riderAllSeats)}
                        </Text>
                      </View>
                    )}
                    <Text style={{ color: theme.textThird, fontSize: FontSize.xs, marginTop: 2 }}>
                      {tr('auto.interstate.estimateTheExactFigureIs', 'Estimate. The exact figure is priced when a passenger books, and a night or weekend departure pays more.')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={{ gap: 6, marginTop: Spacing.sm }}>
            <Text style={[styles.label, { color: theme.textSecond }]}>DEPARTURE</Text>
            {/**
              * Picked, never typed (founder 2026-08-27).
              *
              * This was a text box wanting "YYYY-MM-DD HH:mm" in 24-hour
              * time. A rider standing at a park with one hand on the
              * bike will get that wrong, and a wrong departure means the
              * matcher, which only looks at plus or minus 24 hours, never
              * sees the trip at all. Nothing tells them why.
              */}
            <Pressable
              onPress={() => setPickerOpen(o => !o)}
              style={[styles.input, {
                borderColor: pickerOpen ? theme.primary : theme.border,
                backgroundColor: theme.surface,
                justifyContent: 'center',
              }]}
            >
              <Text style={{
                color: departAt ? theme.text : theme.textThird,
                fontSize: FontSize.md,
              }}>
                {departAt ? prettyDepart(departDate, departTime) : tx9('auto.interstate.chooseADayAndTime', 'Choose a day and time')}
              </Text>
            </Pressable>

            {pickerOpen && (
              <View style={{
                borderWidth: 1, borderColor: theme.border, borderRadius: Radius.md,
                backgroundColor: theme.surface, overflow: 'hidden', marginTop: 4,
              }}>
                <RNCalendar
                  current={departDate || TODAY_ISO}
                  minDate={TODAY_ISO}
                  // The server refuses a departure past this, so the calendar
                  // must not offer one, for the same reason the early times
                  // are greyed: a picker that offers what the server rejects
                  // teaches the rider that the screen lies.
                  maxDate={maxDateISO}
                  onDayPress={(day: any) => setDepartDate(day.dateString)}
                  markedDates={departDate ? { [departDate]: { selected: true, selectedColor: theme.primary } } : {}}
                  theme={{
                    calendarBackground: theme.surface,
                    dayTextColor: theme.text,
                    monthTextColor: theme.text,
                    textDisabledColor: theme.textThird,
                    arrowColor: theme.primary,
                    todayTextColor: theme.primary,
                    selectedDayTextColor: '#FFFFFF',
                  }}
                />
                <View style={{ padding: Spacing.md, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <Text style={[styles.label, { color: theme.textSecond, marginBottom: 8 }]}>
                    {tr('auto.editTripDetail.departureTime', 'DEPARTURE TIME')}
                  </Text>
                  {/* Say why the early times are greyed, or it reads as a bug. */}
                  {minLeadMins > 0 && (
                    <Text style={{
                      fontSize: FontSize.xs,
                      color: theme.textSecond,
                      marginBottom: 10,
                    }}>
                      {/*
                        * This divided by 60 whatever the number was, so a five
                        * minute rule announced itself as "at least 0.1 hours
                        * notice", which is not a sentence anybody says.
                        * Minutes under an hour, hours above it.
                        */}
                      {tx9('auto.interstate.giveAtLeastNoticeSo', 'Give at least {{v0}} notice, so a sender can find your trip, agree a price and reach you.', { v0: minLeadMins < 60
                          ? `${Math.round(minLeadMins)} minute${Math.round(minLeadMins) === 1 ? '' : 's'}`
                          : `${Math.round((minLeadMins / 60) * 10) / 10} hour${minLeadMins === 60 ? '' : 's'}` })}
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {DEPART_SLOTS.map(slot => {
                      const active = departTime === slot;
                      /**
                       * Too soon, not just past.
                       *
                       * This used to grey out only times already gone today,
                       * which let a rider declare a trip leaving in twenty
                       * minutes. The server now refuses that, and a picker
                       * that offers a time the server rejects is worse than
                       * no picker. One test covers both cases: a slot in the
                       * past is simply a slot inside the notice window.
                       */
                      const slotAt = new Date(
                        `${departDate || TODAY_ISO}T${slot}:00`,
                      ).getTime();
                      const past = Number.isFinite(slotAt)
                        && slotAt < Date.now() + minLeadMins * 60_000;
                      return (
                        <Pressable
                          key={slot}
                          disabled={past}
                          onPress={() => { setDepartTime(slot); setPickerOpen(false); }}
                          style={{
                            paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
                            borderWidth: 1,
                            borderColor: active ? theme.primary : theme.border,
                            backgroundColor: active ? theme.primary : 'transparent',
                            opacity: past ? 0.35 : 1,
                          }}
                        >
                          <Text style={{
                            fontSize: FontSize.sm,
                            fontWeight: active ? FontWeight.semibold : FontWeight.regular,
                            color: active ? '#FFFFFF' : theme.text,
                          }}>{slot}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/*
                    * When the whole day is gone, SAY SO.
                    *
                    * Found by the founder on the device at 21:58: every slot
                    * from 04:00 to 22:00 was greyed, because the last one of
                    * the day was already inside the notice window. That is
                    * correct behaviour and it looked exactly like a broken
                    * screen, with nothing telling him to pick another day.
                    *
                    * A control that is right and unexplained is indis-
                    * tinguishable from one that is broken, and the person
                    * hitting it has no way to tell which.
                    */}
                  {DEPART_SLOTS.every(slot => {
                    const at = new Date(`${departDate || TODAY_ISO}T${slot}:00`).getTime();
                    return Number.isFinite(at) && at < Date.now() + minLeadMins * 60_000;
                  }) && (
                    <Text style={{
                      fontSize: FontSize.sm,
                      color: theme.primary,
                      fontWeight: FontWeight.semibold,
                      marginTop: 12,
                    }}>
                      {tr('auto.interstate.noDeparturesLeftOnThis', 'No departures left on this day. Pick tomorrow, or a later date, above.')}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          <View style={{ gap: 6, marginTop: Spacing.sm }}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{tr('auto.interstate.sparePackageCapacityKg', 'SPARE PACKAGE CAPACITY (kg)')}</Text>
            <TextInput
              value={vehicleSpace}
              onChangeText={setVehicleSpace}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={theme.textThird}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            />
            <Text style={[styles.helper, { color: theme.textThird }]}>{tx('auto.interstate.howMuchWeightCanYou', 'How much weight can you take above your existing load.')}</Text>
          </View>

          {/* ── Travel Buddy: what this trip sells ─────────────────── */}
          <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: 0.6, color: theme.textSecond, marginTop: 4 }}>
            {tr('auto.interstate.whatAreYouOffering', 'WHAT ARE YOU OFFERING?')}
          </Text>

          <Pressable
            onPress={() => setTakePackages(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderColor: takePackages ? theme.primary : theme.border, borderWidth: 1.5, borderRadius: Radius.lg, padding: 12 }}
          >
            <Truck size={18} color={takePackages ? theme.primary : theme.textSecond} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>{tx('auto.interstate.carryPackages', 'Carry packages')}</Text>
              {/* Said "Uses your spare kg above", which reads as a capacity
                  filter. Nothing filters on it: spareCapacityKg is shown to
                  people browsing your trip and to ops, and the matcher never
                  compares it against a package weight. Say what it really
                  does (2026-08-25 interstate walk). */}
              <Text style={{ color: theme.textThird, fontSize: FontSize.xs }}>
                {tr('auto.interstate.showsYourSpareKgTo', 'Shows your spare kg to senders on this route')}
              </Text>
            </View>
            {/* D-6.10: this was bound to (takePassengers || takePackages), so
                turning packages off while passengers was on left the word OFF
                painted in the ON colour. */}
            <Text style={{ color: takePackages ? theme.primary : theme.textThird, fontWeight: '700' }}>{takePackages ? 'ON' : 'OFF'}</Text>
          </Pressable>

          {/* seatCap null means the vehicle class has not loaded yet; 0 means
              this class cannot sell seats at all and the server will refuse
              the declaration outright, so the row is shown disabled with the
              reason rather than letting the driver fill a form that cannot
              be submitted (2026-08-25 interstate walk). */}
          <Pressable
            onPress={() => { if (seatCap !== 0) setTakePassengers(v => !v); }}
            disabled={seatCap === 0}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: seatCap === 0 ? 0.55 : 1, backgroundColor: theme.surface, borderColor: takePassengers ? theme.primary : theme.border, borderWidth: 1.5, borderRadius: Radius.lg, padding: 12 }}
          >
            <MapPin size={18} color={takePassengers ? theme.primary : theme.textSecond} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>{tx('auto.interstate.carryPassengers', 'Carry passengers')}</Text>
              <Text style={{ color: theme.textThird, fontSize: FontSize.xs }}>
                {seatCap === 0
                  ? tx9('auto.interstate.aIsNotAPassenger', 'A {{v0}} is not a passenger class on SEIRS. Packages only on this run.', { v0: vehicleLabel(vehicleType) })
                  : tx9('auto.interstate.realSeatsOnlySeirsBlocks', 'Real seats only: SEIRS blocks overloading. No doubling the front seat, ever.')}
              </Text>
            </View>
            <Text style={{ color: takePassengers ? theme.primary : theme.textThird, fontWeight: '700' }}>
              {seatCap === 0 ? 'N/A' : takePassengers ? 'ON' : 'OFF'}
            </Text>
          </Pressable>

          {takePassengers && (
            <View style={{ gap: 10 }}>
              <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, marginBottom: 4 }}>
                  {seatCap != null && seatCap > 0
                    ? tx9('auto.interstate.seatsYouReSellingA', 'Seats you\'re selling (a {{vehicleType}} sells up to {{seatCap}})', { vehicleType, seatCap })
                    : tx9('auto.interstate.seatsYouReSellingYour', 'Seats you\'re selling (your vehicle class caps this)')}
                </Text>
                <TextInput
                  value={seats}
                  // Clamped as typed. The server throws above the cap and the
                  // driver used to find out only after tapping Declare.
                  onChangeText={(v) => {
                    const digits = v.replace(/[^0-9]/g, '');
                    if (!digits) { setSeats(''); return; }
                    const n = Number(digits);
                    setSeats(String(seatCap != null && seatCap > 0 ? Math.min(n, seatCap) : n));
                  }}
                  keyboardType="number-pad"
                  placeholder={seatCap != null && seatCap > 0 ? `1 to ${seatCap}` : 'e.g. 3'}
                  placeholderTextColor={theme.textThird}
                  style={{ color: theme.text, fontSize: FontSize.base, padding: 0 }}
                />
              </View>

              {/**
                * The "pick up along my route" / "one fixed pickup point"
                * toggle is gone.
                *
                * Along-route wrote a mode and nothing else: no label, no
                * coordinates, no window. A passenger read "pick up along my
                * route" and got no pin, no place and no way to know where
                * they would meet, which is the hole the founder named: a
                * rider can wait somewhere else and blame the passenger, and
                * nobody can settle it because no exact place was ever
                * agreed. The route above now names every place, so there is
                * no vague option left to choose.
                */}
              <Text style={{ color: theme.textThird, fontSize: FontSize.xs, lineHeight: 17 }}>
                {origin.place
                  ? tx9('auto.interstate.passengersBoardAtAndGet', 'Passengers board at {{v0}} and get a map pin on {{primary}}{{v2}}. The stops in between are what your route really is, and the fare is measured along them rather than city centre to city centre.', { v0: origin.city || origin.place.primary, primary: origin.place.primary, v2: origin.description.trim() ? `, plus your note: ${origin.description.trim()}` : '' })
                  : tx9('auto.interstate.setYourStartingPointAbove', 'Set your starting point above. Passengers get a map pin on it, so it has to be a place you will really be standing.')}
              </Text>
            </View>
          )}


          <Pressable
            disabled={submitting}
            onPress={submit}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{tx('auto.interstate.declareTrip', 'Declare trip')}</Text>}
          </Pressable>

          {/* Said "You can decline any individual offer". A package boosted
              along a declared route is an ordinary pool job and there is no
              decline endpoint for one, so declining sent nothing anywhere
              (2026-08-23 sweep, D-6.9, paired with D-1.5). Seat bookings on
              the trip DO have a real decline; packages you simply skip. */}
          <Text style={[styles.footnote, { color: theme.textThird }]}>
            {tr('auto.interstate.packagesRunningYourDeclaredRoute', 'Packages running your declared route are ranked towards you around your departure. Nothing is forced on you: skip any package that does not suit the run. A seat request is different: it is made to you alone and nothing is charged until you accept it. Say yes or no, and it expires if you leave it unanswered.')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  prefCard:     { borderWidth: 1, borderRadius: Radius.lg, padding: 14, marginBottom: 12 },
  prefTitle:    { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  prefSub:      { fontSize: FontSize.xs, lineHeight: 17, marginTop: 2 },
  prefInput:    { flex: 1, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 9, fontSize: FontSize.base },
  prefSaveBtn:  { paddingHorizontal: 18, paddingVertical: 10, borderRadius: Radius.md },
  prefSaveTxt:  { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },

  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },

  intro:     { flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, alignItems: 'center', marginBottom: Spacing.md },
  introTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 2 },
  introSub:  { fontSize: FontSize.xs, lineHeight: 17 },

  label:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  input:     { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 12, fontSize: FontSize.base },
  helper:    { fontSize: FontSize.xs, lineHeight: 16 },

  routeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', gap: 2 },

  // One stop on the line. City and exact address sit in stopRow side by
  // side, which is the founder's shape: the label and the pin belong to
  // each other and are read together.
  stopCard:  { borderWidth: 1, borderRadius: Radius.lg, padding: 12, gap: 10 },
  stopHead:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopDot:   { width: 10, height: 10, borderRadius: 5 },
  stopRole:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.6, flex: 1 },
  stopKm:    { fontSize: FontSize.xs },
  stopRow:   { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  // Matches PlacePicker's own label and input metrics so the two boxes
  // in stopRow line up exactly.
  miniLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  cityBox:   { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  warn:      { fontSize: FontSize.xs, lineHeight: 16 },
  connector: { alignItems: 'flex-start', paddingLeft: 16 },
  addStop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, paddingVertical: 12 },

  primaryBtn:    { paddingVertical: 14, borderRadius: Radius.lg, alignItems: 'center', marginTop: Spacing.lg },
  primaryBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  footnote:  { fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.md, paddingHorizontal: Spacing.md, lineHeight: 17 },
  inputWrap: { borderWidth: 1, borderRadius: Radius.md, padding: 12 },
});
