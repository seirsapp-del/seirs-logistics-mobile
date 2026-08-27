import { Calendar as RNCalendar } from 'react-native-calendars';
import { PlacePicker, type PickedPlace } from '@seirs/shared/components/PlacePicker';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, MapPin, Calendar, Truck, ArrowRight,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi, configApi } from '@/services/api';
import { naira } from '@/utils/money';
import { alertDialog } from '@/components/SeirsDialog';

// Spec V8 §2.18: driver declares an upcoming intercity trip
// (Lagos → Ibadan, etc.). System surfaces matching packages along
// that corridor. Customer chose at booking whether to drop at
// destination address or destination partner store.

/**
 * Departure times a rider can actually leave at.
 *
 * Half-hour steps from 04:00, because intercity runs leave at first
 * light and a park at 05:30 is a real departure, through to 22:00.
 * Anything outside that is a night run nobody is declaring in advance.
 */
const DEPART_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 4; h <= 22; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 22) out.push(`${String(h).padStart(2, '0')}:30`);
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
  { from: 'Lagos',   to: 'Ibadan',  km: 145 },
  { from: 'Lagos',   to: 'Abuja',   km: 760 },
  { from: 'Ibadan',  to: 'Abuja',   km: 605 },
  { from: 'Lagos',   to: 'Benin',   km: 320 },
  { from: 'Abuja',   to: 'Kano',    km: 350 },
  { from: 'Lagos',   to: 'Port Harcourt', km: 620 },
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
 * Mirrors DeliveriesService.CITY_COORDS. A seat booking builds a real
 * delivery row and needs coordinates for both ends, so a trip declared
 * between cities outside this list is listed in Travel Buddy, browsed,
 * chosen, and then fails at the payment step with "This route needs a
 * mapped pickup point. Ask the driver to re-declare with a pickup
 * location" - advice that cannot work, because re-declaring the same
 * city name maps no better. The driver never sees that error: the
 * passenger does. Packages are matched on address text and need no
 * coordinates, so this gate applies to the passenger path only.
 */
const SEAT_MAPPED_CITIES = [
  'lagos', 'ibadan', 'abuja', 'kano', 'port harcourt', 'benin',
  'benin city', 'enugu', 'kaduna', 'ilorin', 'abeokuta', 'onitsha',
];
const isSeatMappedCity = (c: string) =>
  SEAT_MAPPED_CITIES.includes(String(c ?? '').trim().toLowerCase());

export default function InterstateScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [from,        setFrom]        = useState('');
  const [to,          setTo]          = useState('');
  const [departAt,    setDepartAt]    = useState('');
  // Split so the rider picks a day and a time, never types either.
  const [departDate,  setDepartDate]  = useState('');
  const [departTime,  setDepartTime]  = useState('');
  const [pickerOpen,  setPickerOpen]  = useState(false);

  /**
   * Coordinates for both ends, from the picker rather than from typing.
   *
   * The trip row used to carry a bare city STRING and the server
   * resolved it through a hardcoded twelve-city list, so a rider
   * declaring anywhere else saved a trip nobody could book. With real
   * coordinates any destination in Nigeria works.
   */
  const [fromPlace, setFromPlace] = useState<PickedPlace | null>(null);
  const [toPlace,   setToPlace]   = useState<PickedPlace | null>(null);

  /**
   * departAt stays the single source the submit path reads, so nothing
   * downstream had to change: the two pickers just write into it in the
   * exact shape the old text field produced.
   */
  useEffect(() => {
    setDepartAt(departDate && departTime ? `${departDate} ${departTime}` : '');
  }, [departDate, departTime]);

  /**
   * Distance from the two picked points, not from a text box.
   *
   * routeKm was a free-text field, and seat price is literally
   * seats x rate x routeKm, so whatever a rider typed set what
   * passengers paid. The only validation was that it was above zero.
   *
   * Straight line understates road distance, so this is a floor rather
   * than a quote: the rider can raise it if they know the road is
   * longer, and the server floors it again on its own geometry. What it
   * removes is the empty box and the typo.
   */
  useEffect(() => {
    if (!fromPlace || !toPlace) return;
    const R = 6371;
    const dLat = ((toPlace.lat - fromPlace.lat) * Math.PI) / 180;
    const dLng = ((toPlace.lng - fromPlace.lng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos((fromPlace.lat * Math.PI) / 180) * Math.cos((toPlace.lat * Math.PI) / 180)
      * Math.sin(dLng / 2) ** 2;
    const straight = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    // Nigerian intercity roads run roughly 1.25x the straight line.
    setRouteKm(String(Math.round(straight * 1.25)));
  }, [fromPlace, toPlace]);
  const [vehicleSpace,setVehicleSpace]= useState('1');

  // Travel Buddy (founder 23 Aug): sell what the vehicle truly has.
  const [takePassengers, setTakePassengers] = useState(false);
  const [seats,          setSeats]          = useState('1');
  const [takePackages,   setTakePackages]   = useState(true);
  const [pickupMode,     setPickupMode]     = useState<'along_route' | 'fixed'>('along_route');
  const [pickupAddress,  setPickupAddress]  = useState('');
  /**
   * The meeting point's OWN coordinates.
   *
   * "One fixed pickup point" was a text box, and the trip sent the CITY
   * coordinates alongside it. So a rider typing "Ojo Junction" produced
   * a trip that told passengers "meets at Ojo Junction" and pointed
   * their map at the middle of the city (founder spotted it on screen,
   * 2026-08-27). The words were right and the pin was wrong, which is
   * worse than having no pin: a passenger trusts the map.
   */
  const [pickupPlace, setPickupPlace] = useState<PickedPlace | null>(null);

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
   * any depth, and it needs no layout bookkeeping at all.
   */
  const scrollRef = useRef<ScrollView>(null);
  const scrollY   = useRef(0);
  const liftBy = (hiddenPx: number) => {
    if (!(hiddenPx > 0)) return;
    scrollRef.current?.scrollTo({ y: scrollY.current + hiddenPx, animated: true });
  };

  const [routeKm,        setRouteKm]        = useState('');
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

  const km = Number(routeKm) || 0;
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
      title: 'Cancel this trip?',
      message: booked > 0
        ? `${trip.fromCity} → ${trip.toCity}. ${booked} seat${booked === 1 ? '' : 's'} already booked and paid for on this trip. Cancelling delists it, and anyone still waiting on your answer gets refunded. If a passenger is counting on this run, tell them in chat first.`
        : `${trip.fromCity} → ${trip.toCity}. You will be delisted and stop being matched for ${sells}.`,
      options: [
        {
          label: 'Cancel this trip',
          sub: booked > 0 ? `${booked} paid seat${booked === 1 ? '' : 's'} on it` : undefined,
          variant: 'destructive',
          icon: 'close-circle-outline',
          onPress: async () => {
            try { await driversApi.cancelInterstateTrip(trip.id); loadTrips(); }
            catch (e: any) { alertDialog('Could not cancel', e?.message ?? 'Try again.'); }
          },
        },
      ],
      cancelLabel: 'Keep the trip',
    });
  };

  const submit = async () => {
    if (!from.trim() || !to.trim()) { alertDialog('Both cities required'); return; }
    // The server rejects a same-city trip. Catch it here so the driver
    // is not told after the round trip (2026-08-25 interstate walk).
    if (from.trim().toLowerCase() === to.trim().toLowerCase()) {
      alertDialog('Same city twice', 'From and To must be different cities.');
      return;
    }
    /**
     * Both ends must be PICKED, not typed.
     *
     * Without coordinates the server falls back to its twelve-city
     * lookup, and a trip to anywhere else is saved successfully and is
     * unbookable forever. Refusing here, with the reason, beats letting
     * a rider wait a week for a booking that could never arrive.
     */
    if (!fromPlace || !toPlace) {
      alertDialog(
        'Choose both cities from the list',
        'Tap a suggestion as you type so we get the exact location. A typed name we cannot place means no passenger can book this trip.',
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
          `A ${vehicleType} sells at most ${seatCap} seat${seatCap === 1 ? '' : 's'}. No squeezing: that is the rule.`,
        );
        return;
      }
      // Seat pricing is per kilometre, so a trip with no route distance
      // is browsable but every booking on it dies at payment with a
      // message the PASSENGER sees and the driver never does.
      if (!(Number(routeKm) > 0)) {
        alertDialog(
          'Route distance needed',
          'Seats are priced by distance. Without it nobody can book this trip. Tap a popular route to fill it, or type the km.',
        );
        return;
      }
      // Coordinates for both ends are required to build the booking.
      if (!isSeatMappedCity(from) || !isSeatMappedCity(to)) {
        const bad = !isSeatMappedCity(from) ? from.trim() : to.trim();
        alertDialog(
          'Seats are not available on that city yet',
          `We cannot place ${bad} on the map yet, and a seat booking needs both ends mapped. Carry packages on this run instead, or pick one of the cities we cover: ${SEAT_MAPPED_CITIES.filter(c => c !== 'benin city').map(c => c.replace(/\b\w/g, m => m.toUpperCase())).join(', ')}.`,
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      await driversApi.declareInterstateTrip({
        fromCity:        from.trim(),
        toCity:          to.trim(),
        // The half the server was missing entirely.
        /**
         * The meeting point wins over the city when one was picked.
         * bookTripSeats reads trip.pickupLat for the passenger's map, so
         * sending the city here made a fixed pickup point decorative.
         */
        pickupLat:       (pickupMode === 'fixed' && pickupPlace) ? pickupPlace.lat : fromPlace.lat,
        pickupLng:       (pickupMode === 'fixed' && pickupPlace) ? pickupPlace.lng : fromPlace.lng,
        destLat:         toPlace.lat,
        destLng:         toPlace.lng,
        destAddress:     toPlace.description,
        departAt:        new Date(depart).toISOString(),
        spareCapacityKg: Number(vehicleSpace) || 0,
        acceptsPassengers: takePassengers,
        seatsTotal:        takePassengers ? (Number(seats) || 1) : 0,
        acceptsPackages:   takePackages,
        pickupMode,
        pickupAddress:     pickupMode === 'fixed' ? pickupAddress.trim() || undefined : undefined,
        routeKm:           Number(routeKm) > 0 ? Number(routeKm) : undefined,
      });
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
      ].filter(Boolean).join('\n\n');
      /**
       * "Pick up along my route" now MEANS something.
       *
       * It used to write pickupMode: 'along_route' and nothing else: no
       * label, no coordinates, no window. A passenger read "pick up along
       * my route" and got no pin, no place and no way to know where they
       * would actually meet (founder 2026-08-27).
       *
       * The corridor was already designed and already fed into matching:
       * driver.corridorDestLat/Lng/Label/ExpiresAt, from 21 Aug, scoring
       * up jobs whose pickup AND drop hug the line the courier is already
       * driving. This screen simply never set it. So the fix is wiring,
       * not a new design.
       *
       * The window runs from now until the trip should be over: the hours
       * until departure, plus the drive at a deliberately generous 45km/h
       * average, plus two hours of Nigerian road. A corridor that expires
       * mid-journey stops matching exactly when the rider is most able to
       * pick something up.
       */
      if (pickupMode === 'along_route' && toPlace) {
        try {
          const departsInH = Math.max(0, (new Date(depart).getTime() - Date.now()) / 3600000);
          const driveH     = (Number(routeKm) || 0) / 45;
          const hours      = Math.ceil(departsInH + driveH + 2);
          await driversApi.setCorridor(
            toPlace.lat,
            toPlace.lng,
            `${from.trim()} to ${to.trim()}`,
            Math.min(hours, 48),
          );
        } catch {
          // The trip is declared either way. A corridor that failed to
          // set costs matching quality, not the booking, so it must not
          // surface as a failure the rider has to act on.
        }
      }

      setSheet({
        title: 'Trip declared',
        message: `You are listed for ${from.trim()} → ${to.trim()} on ${when}.\n\n${lines}`,
        options: [{
          label: 'Done',
          variant: 'primary',
          icon: 'checkmark-circle-outline',
          onPress: () => { loadTrips(); setFrom(''); setTo(''); setDepartAt(''); setDepartDate(''); setDepartTime(''); setFromPlace(null); setToPlace(null); setPickupPlace(null); },
        }],
        cancelLabel: null,
        onCancel: () => { loadTrips(); setFrom(''); setTo(''); setDepartAt(''); setDepartDate(''); setDepartTime(''); setFromPlace(null); setToPlace(null); setPickupPlace(null); },
      });
    } catch (e: any) {
      alertDialog('Could not declare trip', e?.message ?? 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Declare Intercity Trip</Text>
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

          {myTrips.length > 0 && (
            <View style={{ gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: 0.6, color: theme.textSecond }}>
                MY DECLARED TRIPS
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
                          ? `Packages${kg > 0 ? `, ${kg}kg spare` : ''}`
                          : 'No packages'}
                        {' · '}
                        {tr.acceptsPassengers ? `${total} seat${total === 1 ? '' : 's'}` : 'No seats'}
                        {tr.acceptsPassengers && tr.pickupMode === 'fixed' && tr.pickupAddress
                          ? ` · meets at ${tr.pickupAddress}`
                          : tr.acceptsPassengers ? ' · pickup along the route' : ''}
                      </Text>
                      {tr.acceptsPassengers && booked > 0 && (
                        <Text style={{ color: theme.primary, fontSize: FontSize.xs, fontWeight: '700', marginTop: 4 }}>
                          {booked} seat{booked === 1 ? '' : 's'} booked and paid
                          {left > 0 ? `, ${left} still open` : ', full'}
                        </Text>
                      )}
                    </View>
                    <Pressable onPress={() => cancelTrip(tr)} hitSlop={8}>
                      <Text style={{ color: '#DC2626', fontSize: FontSize.sm, fontWeight: '700' }}>Cancel</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          <View style={[styles.intro, { backgroundColor: theme.primary + '12' }]}>
            <Truck size={20} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.introTitle, { color: theme.text }]}>Earn extra on long-haul trips</Text>
              {/* Was "matching packages along your route will be auto-offered",
                  which describes a feed that does not exist: packages get a
                  ranking bonus, seats get a real booking. Passengers were not
                  mentioned at all even though they are the half that pays up
                  front (2026-08-25 interstate walk). */}
              <Text style={[styles.introSub, { color: theme.textSecond }]}>
                Tell us you&apos;re going intercity. Passengers can book your spare seats, and packages running the same way are ranked towards you.
              </Text>
            </View>
          </View>

          {/* Popular routes */}
          <Text style={[styles.label, { color: theme.textSecond }]}>POPULAR ROUTES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {POPULAR_ROUTES.map(r => (
              <Pressable
                key={`${r.from}-${r.to}`}
                onPress={() => { setFrom(r.from); setTo(r.to); setRouteKm(String(r.km)); }}
                style={[styles.routeChip, { borderColor: theme.border, backgroundColor: theme.surface }]}
              >
                <Text style={{ color: theme.text, fontSize: FontSize.xs, fontWeight: FontWeight.bold }}>{r.from} → {r.to}</Text>
                <Text style={{ color: theme.textSecond, fontSize: FontSize.xs }}>~{r.km}km</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Fields */}
          <View style={{ gap: 6, marginTop: Spacing.md }}>
            {/**
              * Picked, not typed. A free-text city produced a trip the
              * server could not map and no passenger could book, and
              * the rider was told the PICKUP was the problem.
              */}
            <View>
            <PlacePicker
              label="FROM"
              onSuggestionsShown={liftBy}
              value={from}
              onChangeText={(t) => { setFrom(t); setFromPlace(null); }}
              onPicked={(pl) => { setFrom(pl.primary); setFromPlace(pl); }}
              placeholder="Start typing a city"
              types="(cities)"
              theme={theme as any}
            />
            </View>
          </View>

          <View style={{ alignItems: 'center', marginVertical: -8 }}>
            <ArrowRight size={20} color={theme.textThird} />
          </View>

          <View style={{ gap: 6 }}>
            <PlacePicker
              label="TO"
              onSuggestionsShown={liftBy}
              value={to}
              onChangeText={(t) => { setTo(t); setToPlace(null); }}
              onPicked={(pl) => { setTo(pl.primary); setToPlace(pl); }}
              placeholder="Start typing a city"
              types="(cities)"
              theme={theme as any}
            />
          </View>

          {/**
            * Route, map and money, together and near the top.
            *
            * Route distance used to sit at the very BOTTOM of the form as
            * an editable box, and there was no map anywhere on the screen
            * (founder 2026-08-27: "not a single physical map in sight on
            * this screen and why is the route distance at the bottom").
            *
            * It belongs here because it is the CONSEQUENCE of the two
            * cities above it: pick both, and this is what the trip is.
            */}
          {fromPlace && toPlace && (
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
                style={{ height: 160, width: '100%' }}
                pointerEvents="none"
                initialRegion={{
                  latitude:  (fromPlace.lat + toPlace.lat) / 2,
                  longitude: (fromPlace.lng + toPlace.lng) / 2,
                  latitudeDelta:  Math.max(Math.abs(fromPlace.lat - toPlace.lat) * 1.8, 0.6),
                  longitudeDelta: Math.max(Math.abs(fromPlace.lng - toPlace.lng) * 1.8, 0.6),
                }}
              >
                <Marker
                  coordinate={{ latitude: fromPlace.lat, longitude: fromPlace.lng }}
                  pinColor="#2F6F4E"
                  title={from.trim() || 'Start'}
                />
                <Marker
                  coordinate={{ latitude: toPlace.lat, longitude: toPlace.lng }}
                  pinColor="#A8342A"
                  title={to.trim() || 'Destination'}
                />
                {/**
                  * The meeting point, shown rather than described.
                  *
                  * Founder: "shouldn't we be able to see the exact pickup
                  * point instead of a text that says this and that." A
                  * passenger is going to stand somewhere on the strength
                  * of this, so the rider should be able to see where they
                  * have just sent them before they commit to it.
                  */}
                {pickupMode === 'fixed' && pickupPlace && (
                  <Marker
                    coordinate={{ latitude: pickupPlace.lat, longitude: pickupPlace.lng }}
                    pinColor="#B8790C"
                    title={pickupAddress.trim() || 'Pickup point'}
                    description="Where passengers meet you"
                  />
                )}
                <Polyline
                  coordinates={[
                    { latitude: fromPlace.lat, longitude: fromPlace.lng },
                    { latitude: toPlace.lat,   longitude: toPlace.lng },
                  ]}
                  strokeColor={theme.primary}
                  strokeWidth={3}
                />
              </MapView>

              <View style={{ padding: Spacing.md, gap: 10 }}>
                {pickupMode === 'fixed' && pickupPlace && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#B8790C' }} />
                    <Text style={{ color: theme.textThird, fontSize: FontSize.xs }}>
                      Passengers meet you at {pickupAddress.trim()}
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.6 }}>
                    ROUTE DISTANCE
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
                  Measured from the two cities you picked. SEIRS sets this, not the
                  driver, because it is what passengers are charged per kilometre.
                </Text>

                {riderPerSeat != null && km > 0 && (
                  <View style={{
                    borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10, gap: 4,
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: theme.textSecond, fontSize: FontSize.sm }}>You earn per seat</Text>
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
                      Estimate. The exact figure is priced when a passenger books, and
                      a night or weekend departure pays more.
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
                {departAt ? prettyDepart(departDate, departTime) : 'Choose a day and time'}
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
                    DEPARTURE TIME
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {DEPART_SLOTS.map(slot => {
                      const active = departTime === slot;
                      // A time already gone today cannot be a departure.
                      const past = departDate === TODAY_ISO
                        && slot <= new Date().toTimeString().slice(0, 5);
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
                </View>
              </View>
            )}
          </View>

          <View style={{ gap: 6, marginTop: Spacing.sm }}>
            <Text style={[styles.label, { color: theme.textSecond }]}>SPARE PACKAGE CAPACITY (kg)</Text>
            <TextInput
              value={vehicleSpace}
              onChangeText={setVehicleSpace}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={theme.textThird}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            />
            <Text style={[styles.helper, { color: theme.textThird }]}>How much weight can you take above your existing load.</Text>
          </View>

          {/* ── Travel Buddy: what this trip sells ─────────────────── */}
          <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: 0.6, color: theme.textSecond, marginTop: 4 }}>
            WHAT ARE YOU OFFERING?
          </Text>

          <Pressable
            onPress={() => setTakePackages(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderColor: takePackages ? theme.primary : theme.border, borderWidth: 1.5, borderRadius: Radius.lg, padding: 12 }}
          >
            <Truck size={18} color={takePackages ? theme.primary : theme.textSecond} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>Carry packages</Text>
              {/* Said "Uses your spare kg above", which reads as a capacity
                  filter. Nothing filters on it: spareCapacityKg is shown to
                  people browsing your trip and to ops, and the matcher never
                  compares it against a package weight. Say what it really
                  does (2026-08-25 interstate walk). */}
              <Text style={{ color: theme.textThird, fontSize: FontSize.xs }}>
                Shows your spare kg to senders on this route
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
              <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>Carry passengers</Text>
              <Text style={{ color: theme.textThird, fontSize: FontSize.xs }}>
                {seatCap === 0
                  ? `A ${vehicleType} is not a passenger class on SEIRS. Packages only on this run.`
                  : 'Real seats only: SEIRS blocks overloading. No doubling the front seat, ever.'}
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
                    ? `Seats you're selling (a ${vehicleType} sells up to ${seatCap})`
                    : "Seats you're selling (your vehicle class caps this)"}
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
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([['along_route', 'Pick up along my route'], ['fixed', 'One fixed pickup point']] as const).map(([k, label]) => (
                  <Pressable
                    key={k}
                    onPress={() => setPickupMode(k)}
                    style={{ flex: 1, padding: 10, borderRadius: Radius.md, borderWidth: 1.5, borderColor: pickupMode === k ? theme.primary : theme.border, backgroundColor: pickupMode === k ? theme.primary + '12' : 'transparent' }}
                  >
                    <Text style={{ color: pickupMode === k ? theme.primary : theme.textSecond, fontSize: FontSize.xs, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              {/**
                * Say what the passenger actually gets.
                *
                * Both options were bare labels, and "along my route" gave
                * a passenger no pin, no place and no way to know where
                * they would meet. It now declares the corridor, so this
                * explains what that means rather than leaving them to
                * guess (founder 2026-08-27).
                */}
              <Text style={{ color: theme.textThird, fontSize: FontSize.xs, lineHeight: 17 }}>
                {pickupMode === 'along_route'
                  ? (toPlace
                      ? `Passengers and senders on the ${from.trim() || 'this'} to ${to.trim()} line are ranked towards you, and you agree the exact spot in chat. Nobody is shown a pin, so only choose this if you are happy to be flexible.`
                      : 'Pick both cities first. Along-route matching needs to know the line you are driving.')
                  : 'Passengers get a map pin and directions to this exact spot. Better for a busy park where "somewhere in Ibadan" helps nobody.'}
              </Text>
              {pickupMode === 'fixed' && (
                <View style={{ gap: 6 }}>
                  <PlacePicker
                    label="PICKUP POINT"
                    onSuggestionsShown={liftBy}
                    value={pickupAddress}
                    onChangeText={(t) => { setPickupAddress(t); setPickupPlace(null); }}
                    onPicked={(pl) => { setPickupAddress(pl.primary); setPickupPlace(pl); }}
                    placeholder="e.g. Iwo Road roundabout"
                    theme={theme as any}
                  />
                  {!!pickupAddress.trim() && !pickupPlace && (
                    <Text style={{ color: '#B26A00', fontSize: FontSize.xs }}>
                      Tap a suggestion so passengers get a map pin. Typed on its own,
                      they only get the words and their map points at the city centre.
                    </Text>
                  )}
                </View>
              )}
              {/* The distance box used to live here, editable, at the very
                  bottom of the form. It is now measured from the two cities
                  and shown in the route summary near the top, because a
                  rider setting the number that prices a passenger's seat
                  was never a form field, it was an open till. */}
            </View>
          )}


          <Pressable
            disabled={submitting}
            onPress={submit}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Declare trip</Text>}
          </Pressable>

          {/* Said "You can decline any individual offer". A package boosted
              along a declared route is an ordinary pool job and there is no
              decline endpoint for one, so declining sent nothing anywhere
              (2026-08-23 sweep, D-6.9, paired with D-1.5). Seat bookings on
              the trip DO have a real decline; packages you simply skip. */}
          <Text style={[styles.footnote, { color: theme.textThird }]}>
            Packages running your declared route are ranked towards you around your departure. Nothing is forced on you: skip any package that does not suit the run. A seat booking is different, it is a paid offer made to you alone, so accept or decline it and it expires if you leave it unanswered.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },

  intro:     { flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, alignItems: 'center', marginBottom: Spacing.md },
  introTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 2 },
  introSub:  { fontSize: FontSize.xs, lineHeight: 17 },

  label:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  input:     { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 12, fontSize: FontSize.base },
  helper:    { fontSize: FontSize.xs },

  routeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, alignItems: 'center', gap: 2 },

  primaryBtn:    { paddingVertical: 14, borderRadius: Radius.lg, alignItems: 'center', marginTop: Spacing.lg },
  primaryBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  footnote:  { fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.md, paddingHorizontal: Spacing.md, lineHeight: 17 },
  inputWrap: { borderWidth: 1, borderRadius: Radius.md, padding: 12 },
});
