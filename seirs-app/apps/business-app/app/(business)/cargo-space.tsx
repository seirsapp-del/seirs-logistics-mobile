/**
 * Cargo Space: freight room on a trip somebody is already making.
 *
 * Built 2026-08-31. The customer app has browsed declared intercity
 * trips since Travel Buddy shipped, and the business app had no
 * equivalent at all, so a trader could not reach the one part of the
 * network built for exactly their problem.
 *
 * It is NOT Travel Buddy, and deliberately not called that. The founder
 * put it plainly: a farmer sending 100 kg of yam with a truck driver who
 * is shown something called Travel Buddy will not think it is serious.
 * Same declared trips underneath, but this screen only ever lists riders
 * actually carrying freight, never a car with two seats free, and it
 * never mentions passengers or seats.
 *
 * Picking a trip hands off to Send a Package with the trip attached, so
 * the parcel is offered to that one rider first. They accept, decline, or
 * offer a different drop-off at a fresh price, and an unanswered offer simply
 * expires so the load can be asked of somebody else.
 *
 * Nothing is charged until both sides agree. This comment used to end "and
 * refunds without anyone chasing it", which was true before 2026-08-31 and
 * has been wrong since; the on-screen copy had drifted the same way and is
 * corrected too.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, StatusBar, Keyboard, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import * as Location from 'expo-location';
import { deliveriesApi, mapsApi } from '@/services/api';
import { derivePlace } from '@seirs/shared/models/cities';
import { VEHICLE_LABEL } from '@seirs/shared/models/vehicles';
import { CitySearchField } from '@/components/CitySearchField';
import { Calendar as RNCalendar } from 'react-native-calendars';

/**
 * The corridors a trader is most likely to want, so the common case is
 * one tap rather than two text fields. Deliberately the freight routes,
 * not the commuter ones.
 */
const COMMON_ROUTES: Array<[string, string]> = [
  ['Lagos', 'Ibadan'],
  ['Lagos', 'Abuja'],
  ['Kano', 'Lagos'],
  ['Onitsha', 'Lagos'],
  ['Ibadan', 'Abuja'],
];

/** "Fri, 5 Sep, 06:30", the way a departure is actually read. */
function prettyDepart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-NG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * The machine, in the words a trader uses to judge whether their load
 * fits. Colour and make matter far less here than on a passenger card,
 * so this leads with the class.
 *
 * The plate is deliberately absent while browsing (2026-09-04). It used
 * to print on every card, which handed a stranger a named driver, their
 * plate and the exact place and minute they would be standing. Do not
 * put it back here: it arrives on the accepted request, where the driver
 * has agreed to carry this particular load. The `plate` branch is kept
 * because the same helper renders accepted requests, where it IS known.
 */
function vehicleLine(driver: any): string {
  const kind = VEHICLE_LABEL[driver?.vehicleType] ?? driver?.vehicleType ?? 'vehicle';
  const plate = String(driver?.vehiclePlate ?? '').trim();
  return plate ? `${kind} · ${plate}` : String(kind);
}

export default function CargoSpaceScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

  const [from, setFrom]       = useState('');
  const [to, setTo]           = useState('');
  const [trips, setTrips]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError]     = useState('');

  /**
   * Narrowing the board.
   *
   * Discovery was a route pair and nothing else: three lorries running Kano
   * to Lagos tomorrow came back in one order with no way to choose between
   * them. A trader with perishables wants the soonest; a trader with two tons
   * wants the most room; and both usually mean "today" or "tomorrow", not
   * whatever is on the board three weeks out.
   *
   * Done on the rows already fetched rather than as query parameters. The
   * result set for one route is small, so filtering here is instant and
   * cannot fail, and it keeps the endpoint the customer app shares unchanged.
   */
  const [sortBy, setSortBy] = useState<'soonest' | 'space'>('soonest');
  const [when,   setWhen]   = useState<'any' | 'today' | 'tomorrow' | 'week'>('any');

  /**
   * The day, and how heavy the load is (founder 2026-09-04).
   *
   * The board asked for two cities and nothing else, so a trader with
   * 400 kg of yam was shown a car with 8 kg of boot space and had to
   * work out for themselves that it was no use. Both are applied to rows
   * already fetched, so the endpoint the customer app shares is
   * untouched.
   */
  const [dayISO,  setDayISO]  = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [loadKg,  setLoadKg]  = useState('');
  const [alerted, setAlerted] = useState(false);

  /**
   * Coordinates for each end, when we have any (founder 2026-09-04).
   *
   * The board matched on typed names, and names are the weak link: a
   * driver's stop is filed under whatever a geocoder called it. With
   * both ends carrying coordinates the server also matches by distance,
   * which no naming mistake can defeat.
   */
  const [fromCoords, setFromCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [toCoords,   setToCoords]   = useState<{ lat: number; lng: number } | null>(null);
  const [locating,   setLocating]   = useState<'from' | 'to' | null>(null);

  const useMyLocation = async (which: 'from' | 'to') => {
    setLocating(which);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location is off. Turn it on for SEIRS, or type the town instead.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      let label = '';
      try {
        const json: any = await mapsApi.geocode({ latlng: `${lat},${lng}` });
        const top = json?.results?.[0];
        label = derivePlace({
          components:       top?.address_components ?? null,
          formattedAddress: top?.formatted_address ?? null,
        }).city;
      } catch { /* a nameless pin still searches correctly */ }

      if (which === 'from') { setFromCoords({ lat, lng }); if (label) setFrom(label); }
      else                  { setToCoords({ lat, lng });   if (label) setTo(label); }
      setError('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not find you. Type the town instead.');
    } finally {
      setLocating(null);
    }
  };

  /** A town name turned into a point, so the distance match can run. */
  const coordsFor = async (
    text: string,
    known: { lat: number; lng: number } | null,
  ): Promise<{ lat: number; lng: number } | null> => {
    if (known) return known;
    const q = text.trim();
    if (!q) return null;
    try {
      const json: any = await mapsApi.geocode({ address: `${q}, Nigeria` });
      const loc = json?.results?.[0]?.geometry?.location;
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
        return { lat: Number(loc.lat), lng: Number(loc.lng) };
      }
    } catch { /* the name-based match still runs without this */ }
    return null;
  };


  const visibleTrips = (() => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOfDay(new Date());
    const DAY   = 24 * 60 * 60 * 1000;

    const withinWindow = (t: any) => {
      const at = new Date(t.departAt).getTime();
      if (!Number.isFinite(at)) return true;   // unreadable date is not a reason to hide work
      const day = startOfDay(new Date(at));
      // A chosen day wins over the coarse window: they are one control.
      if (dayISO) {
        const [y, m, d] = dayISO.split('-').map(Number);
        return day === startOfDay(new Date(y, m - 1, d));
      }
      if (when === 'any')      return true;
      if (when === 'today')    return day === today;
      if (when === 'tomorrow') return day === today + DAY;
      return at < today + 7 * DAY;             // 'week'
    };

    /**
     * Room for the actual load.
     *
     * A rider with 8 kg spare is not a result for 400 kg of yam, and
     * showing them only to be refused at the request screen wastes the
     * lorry the trader might have found instead.
     */
    const wanted = Number(loadKg);
    const fitsLoad = (t: any) =>
      !Number.isFinite(wanted) || wanted <= 0
        ? true
        : Number(t.spareCapacityKg ?? 0) >= wanted;

    const rows = trips.filter(t => withinWindow(t) && fitsLoad(t));
    return rows.sort((a, b) =>
      sortBy === 'space'
        ? Number(b.spareCapacityKg ?? 0) - Number(a.spareCapacityKg ?? 0)
        : new Date(a.departAt).getTime() - new Date(b.departAt).getTime(),
    );
  })();


  /** Register the corridor, so an empty board leaves something behind. */
  const alertMe = async () => {
    try {
      await deliveriesApi.watchTravelBuddyRoute(from.trim(), to.trim());
      setAlerted(true);
    } catch (e: any) {
      setError(e?.message ?? 'Could not set that alert. Try again in a moment.');
    }
  };
  const search = useCallback(async (f?: string, t?: string) => {
    const a = (f ?? from).trim();
    const b = (t ?? to).trim();
    if (!a || !b) {
      setError('Enter where the load is going from and to.');
      return;
    }
    Keyboard.dismiss();
    setError('');
    setLoading(true);
    try {
      // forPackages: never show a trader a trip that only takes people.
      const [ga, gb] = await Promise.all([
        coordsFor(a, fromCoords),
        coordsFor(b, toCoords),
      ]);
      const rows = await deliveriesApi.cargoTrips(a, b,
        ga && gb
          ? { fromLat: ga.lat, fromLng: ga.lng, toLat: gb.lat, toLng: gb.lng, radiusKm: 25 }
          : undefined);
      setTrips(Array.isArray(rows) ? rows : []);
      setSearched(true);
    setAlerted(false);          // a new corridor is a new question
    } catch (e: any) {
      setError(e?.message ?? 'Could not load trips right now.');
      setTrips([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const useRoute = (a: string, b: string) => {
    setFrom(a); setTo(b);
    void search(a, b);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable
          style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}
          onPress={() => router.back()}
        >
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Cargo Space</Text>
          {/* Says what it is for in the first line (founder 2026-09-06). */}
          <Text style={[styles.headerSub, { color: theme.textSecond }]}>
            Interstate trips: room on a run somebody is already making
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {/*
          * This said "if they cannot take it you are refunded in full", which
          * described the flow as it worked BEFORE 2026-08-31 and has been
          * wrong ever since. Posting to a rider's trip is a REQUEST, not a
          * booking: nothing is charged while it waits, so there is no refund
          * to promise and none to chase. The founder's reason, in his words:
          * "once they pay then its irreversible with deductions, like charges
          * from bank etc". Promising a refund also quietly teaches a trader
          * that money leaves first, which is the exact fear the request flow
          * was built to remove.
          */}
        <Text style={[styles.intro, { color: theme.textSecond }]}>
          Drivers declare intercity trips in advance and say how much weight
          they can still take. Ask one to carry your load and nothing is
          charged while they decide. You pay only after they accept, so a no
          costs you nothing.
        </Text>

        {/* A shipment is a route, a day and a weight. The board asked only
            the route, so the other two were discovered at the request
            screen (founder 2026-09-04). */}
        <View style={[styles.searchCard, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
          <CitySearchField
            label="LOAD IS GOING FROM"
            value={from}
            onChange={(v) => { setFrom(v); setFromCoords(null); }}
            placeholder="Where it is picked up"
            theme={theme}
            onLocate={() => useMyLocation('from')}
            locating={locating === 'from'}
            accessory={
              <Pressable
                onPress={() => {
                  const a = from, ac = fromCoords;
                  setFrom(to); setFromCoords(toCoords);
                  setTo(a);    setToCoords(ac);
                }}
                hitSlop={10}
                style={[styles.swapBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <Icon name="Repeat" size={15} color={theme.text} />
              </Pressable>
            }
          />

          <CitySearchField
            label="GOING TO"
            value={to}
            onChange={(v) => { setTo(v); setToCoords(null); }}
            placeholder="Where it is dropped"
            theme={theme}
            onLocate={() => useMyLocation('to')}
            locating={locating === 'to'}
          />

          <View style={styles.metaRow}>
            <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>WHEN</Text>
            <View style={styles.loadInline}>
              <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>WEIGHT</Text>
              <View style={[styles.loadBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <TextInput
                  value={loadKg}
                  onChangeText={t => setLoadKg(t.replace(/[^0-9.]/g, ''))}
                  placeholder="Any"
                  placeholderTextColor={theme.textThird}
                  keyboardType="numeric"
                  style={[styles.loadInput, { color: theme.text }]}
                />
                <Text style={[styles.loadUnit, { color: theme.textSecond }]}>kg</Text>
              </View>
            </View>
          </View>

          {/*
            A month grid, not a strip of chips (founder 2026-09-05: "the calendar").
            Travel Buddy on the customer side already opens a calendar from one
            field; this screen still scrolled a row of thirty day chips, which is
            the thing he asked to replace. Same control, same behaviour: tap the
            field, pick a day, or clear back to Any date.
          */}
          <Pressable
            onPress={() => setCalOpen(v => !v)}
            style={[styles.dayField, { backgroundColor: theme.surface, borderColor: calOpen ? theme.primary : theme.border }]}
          >
            <Text style={[styles.dayFieldText, { color: dayISO ? theme.text : theme.textThird }]}>
              {dayISO
                ? new Date(`${dayISO}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                : 'Any date'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {!!dayISO && (
                <Text onPress={() => { setDayISO(null); setCalOpen(false); }} style={[styles.dayClear, { color: theme.primary }]}>
                  Any date
                </Text>
              )}
              <Icon name="Calendar" size={18} color={theme.textSecond} />
            </View>
          </Pressable>

          {calOpen && (
            <View style={[styles.calWrap, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <RNCalendar
                current={dayISO || undefined}
                minDate={new Date().toISOString().slice(0, 10)}
                onDayPress={(d: any) => { setDayISO(d.dateString); setCalOpen(false); }}
                markedDates={dayISO ? { [dayISO]: { selected: true, selectedColor: theme.primary } } : {}}
                theme={{
                  calendarBackground:   theme.surface,
                  dayTextColor:         theme.text,
                  monthTextColor:       theme.text,
                  textDisabledColor:    theme.textThird,
                  arrowColor:           theme.primary,
                  todayTextColor:       theme.primary,
                  selectedDayTextColor: '#FFFFFF',
                }}
              />
            </View>
          )}
        </View>

        <Pressable
          onPress={() => search()}
          disabled={loading}
          style={[styles.searchBtn, { backgroundColor: loading ? theme.border : theme.primary }]}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.searchTxt}>Find space</Text>}
        </Pressable>
        {!!error && <Text style={[styles.error, { color: '#DC2626' }]}>{error}</Text>}

        {!searched && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Text style={[styles.routesLabel, { color: theme.textSecond }]}>COMMON ROUTES</Text>
            <View style={styles.routesRow}>
              {COMMON_ROUTES.map(([a, b]) => (
                <Pressable
                  key={`${a}-${b}`}
                  onPress={() => useRoute(a, b)}
                  style={[styles.routeChip, { borderColor: theme.border, backgroundColor: theme.surface }]}
                >
                  <Text style={[styles.routeChipTxt, { color: theme.text }]}>{a} to {b}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {searched && !loading && visibleTrips.length === 0 && (
          <View style={styles.emptyWrap}>
            <Icon name="Truck" size={40} color={theme.textSecond} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {trips.length > 0 ? 'Nothing that size on that day' : 'No space on that route yet'}
            </Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              {trips.length > 0
                ? `There ${trips.length === 1 ? 'is' : 'are'} ${trips.length} trip${trips.length === 1 ? '' : 's'} on this route, just none with room for what you asked on the day you picked. Try Any date, or a lighter load.`
                : 'Drivers usually declare a trip a day or two ahead. Check again, or send it the normal way and a driver going that way can still pick it up.'}
            </Text>

            {/* The dead end, made into a door: a trader who has named both
                ends of a corridor is the clearest demand signal we get. */}
            {trips.length === 0 && (
              alerted ? (
                <View style={[styles.alertDone, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <Icon name="CheckCircle2" size={17} color={theme.primary} />
                  <Text style={[styles.alertDoneTxt, { color: theme.text }]}>
                    We will tell you when a driver declares {from.trim()} to {to.trim()}.
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={alertMe}
                  style={[styles.alertBtn, { borderColor: theme.primary, backgroundColor: theme.surface }]}
                >
                  <Icon name="Bell" size={16} color={theme.primary} />
                  <Text style={[styles.alertBtnTxt, { color: theme.primary }]}>
                    Alert me when a driver runs this route
                  </Text>
                </Pressable>
              )
            )}

            <Text style={[styles.routesLabel, { color: theme.textSecond, marginTop: 18 }]}>OR TRY</Text>
            <View style={styles.routesRow}>
              {COMMON_ROUTES.map(([a, b]) => (
                <Pressable
                  key={`empty-${a}-${b}`}
                  onPress={() => { setDayISO(null); useRoute(a, b); }}
                  style={[styles.routeChip, { borderColor: theme.border, backgroundColor: theme.surface }]}
                >
                  <Text style={[styles.routeChipTxt, { color: theme.text }]}>{a} to {b}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Controls appear only once there is something to narrow. Chips on an
            empty board are furniture. */}
        {searched && !loading && trips.length > 0 && (
          <View style={{ gap: 8 }}>
            <View style={styles.filterRow}>
              {([['soonest', 'Leaving soonest'], ['space', 'Most room']] as const).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setSortBy(key)}
                  style={[styles.filterChip, {
                    borderColor: sortBy === key ? theme.primary : theme.border,
                    backgroundColor: sortBy === key ? theme.primary : theme.surface,
                  }]}
                >
                  <Text style={[styles.filterChipTxt, { color: sortBy === key ? '#fff' : theme.text }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.filterRow}>
              {([['any', 'Any time'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week']] as const).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setWhen(key)}
                  style={[styles.filterChip, {
                    borderColor: when === key ? theme.primary : theme.border,
                    backgroundColor: when === key ? `${theme.primary}15` : theme.surface,
                  }]}
                >
                  <Text style={[styles.filterChipTxt, { color: when === key ? theme.primary : theme.textSecond }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {/* Say when a filter is the reason the board looks empty, rather
                than letting it read as "no lorries run this route". */}
            {visibleTrips.length === 0 && (
              <Text style={[styles.intro, { color: theme.textSecond }]}>
                {trips.length} {trips.length === 1 ? 'trip' : 'trips'} on this route, none in that window.
                Try Any time.
              </Text>
            )}
          </View>
        )}

        {visibleTrips.map((trip) => {
          const spare = Number(trip.spareCapacityKg ?? 0);
          return (
            <View
              key={trip.id}
              style={[styles.tripCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <View style={styles.tripHead}>
                <View style={[styles.tripIcon, { backgroundColor: `${theme.primary}15` }]}>
                  <Icon name="Truck" size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tripRoute, { color: theme.text }]}>
                    {trip.fromCity} to {trip.toCity}
                  </Text>
                  {/* The stops in between. A trader could not tell whether a
                      lorry running Ile-Ife to Lagos passes their town, which
                      is the entire question they are asking. Same line, same
                      wording as the customer card. */}
                  {trip.stopCities?.length > 2 && (
                    <Text style={[styles.tripMeta, { color: theme.textSecond }]} numberOfLines={2}>
                      via {trip.stopCities.slice(1, -1).join(' · ')}
                    </Text>
                  )}
                  <Text style={[styles.tripMeta, { color: theme.textSecond }]}>
                    Leaves {prettyDepart(trip.departAt)}
                  </Text>
                </View>
              </View>

              {/*
                * Where to bring the load.
                *
                * The card carried the vehicle and the spare kilos but never
                * said where the driver actually leaves from, so a trader
                * could pick a lorry with no idea whether it meant crossing
                * Lagos or walking to the next street. The customer screen has
                * shown this since Travel Buddy shipped and the payload has
                * always carried it; only this screen left it out. Same
                * wording as the customer app, deliberately.
                */}
              {/*
                The AREA, not the address (2026-09-04).

                This printed the exact spot the driver typed, to anybody
                who ran a search, alongside their plate and departure
                minute. A trader needs to know which town the lorry loads
                in before they ask; the address belongs to the driver
                until they have accepted the load.
              */}
              {/* The person, as on the customer card (founder call 2026-09-05):
                  a trader handing over goods is choosing who carries them. */}
              <View style={[styles.tripFacts, { marginTop: 6 }]}>
                {trip.driver?.profilePhoto
                  ? <Image source={{ uri: trip.driver.profilePhoto }} style={styles.driverPhoto} />
                  : <View style={[styles.driverPhoto, { backgroundColor: `${theme.primary}15`, alignItems: 'center', justifyContent: 'center' }]}>
                      <Icon name="Users" size={16} color={theme.primary} />
                    </View>}
                <Text style={[styles.tripMeta, { color: theme.text, fontWeight: '600', flex: 1 }]} numberOfLines={1}>
                  {trip.driver?.name ?? 'Driver'}
                </Text>
              </View>
              <Text style={[styles.tripMeta, { color: theme.textSecond, marginTop: 2 }]}>
                {trip.segment
                  ? `Loads in ${trip.segment.boardCity}, unloads at ${trip.segment.alightCity}`
                  : trip.pickupMode === 'fixed' && trip.pickupArea
                    ? `Loads in ${trip.pickupArea}, unloads at ${trip.toCity}`
                    : `Loads along the route, unloads at ${trip.toCity}`}
              </Text>
              <Text style={[styles.tripMeta, { color: theme.textThird }]}>
                Exact spot once the driver accepts your load
              </Text>

              <View style={styles.tripFacts}>
                <Text style={[styles.tripMeta, { color: theme.textSecond }]}>
                  {vehicleLine(trip.driver)}
                  {/* A trader handing over goods is choosing a person, not
                      just a lorry. The rating is already in the payload. */}
                  {trip.driver?.rating != null ? `  ·  ${Number(trip.driver.rating).toFixed(1)} rating` : ''}
                </Text>
                <Text style={[styles.spare, { color: spare > 0 ? theme.primary : theme.textSecond }]}>
                  {spare > 0 ? `${spare} kg of space` : 'Space not stated'}
                </Text>
              </View>

              <Pressable
                style={[styles.sendBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push({
                  pathname: '/(business)/send-package',
                  params: {
                    tripId: trip.id,
                    tripLabel: `${trip.fromCity} to ${trip.toCity}`,
                  },
                } as any)}
              >
                <Text style={styles.sendTxt}>Send a load on this trip</Text>
              </Pressable>
            </View>
          );
        })}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub:   { fontSize: 12, marginTop: 2 },

  intro:       { fontSize: 14, lineHeight: 20 },
  input:       { borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15 },
  // The cargo search: route, day and weight asked together, because a
  // shipment is all three.
  searchCard:  { borderWidth: 1, borderRadius: 16, padding: 14, gap: 14 },
  swapBtn:     { width: 32, height: 32, borderRadius: 16, borderWidth: 1,
                 alignItems: 'center', justifyContent: 'center' },
  fieldLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  loadInline:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadBox:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999,
                 paddingHorizontal: 12, height: 34 },
  loadInput:   { fontSize: 15, fontWeight: '700', minWidth: 46, padding: 0, textAlign: 'right' },
  loadUnit:    { fontSize: 12, marginLeft: 4 },
  dayStrip:    { gap: 8, paddingRight: 14 },
  dayChip:     { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
                 alignItems: 'center', minWidth: 62 },
  dayTop:      { fontSize: 13, fontWeight: '700' },
  dayBottom:   { fontSize: 11, marginTop: 1 },

  // The empty board, which is a demand signal rather than an apology.
  alertBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderWidth: 1, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 16,
                  marginTop: 14 },
  alertBtnTxt:  { fontSize: 13, fontWeight: '700' },
  alertDone:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
                  borderRadius: 12, padding: 12, marginTop: 14 },
  alertDoneTxt: { fontSize: 13, flex: 1, lineHeight: 19 },
  dayField:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  dayFieldText: { fontSize: 15, fontWeight: '600' },
  dayClear:     { fontSize: 13, fontWeight: '700' },
  calWrap:      { borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginTop: 8 },
  searchBtn:   { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  searchTxt:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  error:       { fontSize: 13 },

  routesLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  routesRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  routeChip:    { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  routeChipTxt: { fontSize: 13, fontWeight: '600' },
  // Deliberately smaller than the route chips above: those start a search,
  // these narrow one that already ran, and they should not compete.
  filterRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip:   { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  filterChipTxt:{ fontSize: 12, fontWeight: '600' },

  emptyWrap:  { alignItems: 'center', paddingTop: 44, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: 12 },

  tripCard:  { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  tripHead:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tripIcon:  { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  tripRoute: { fontSize: 15, fontWeight: '700' },
  tripMeta:  { fontSize: 13, marginTop: 2 },
  tripFacts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  driverPhoto: { width: 30, height: 30, borderRadius: 15, marginRight: 8 },
  spare:     { fontSize: 13, fontWeight: '700' },
  sendBtn:   { paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  sendTxt:   { color: '#fff', fontSize: 14, fontWeight: '700' },
});
