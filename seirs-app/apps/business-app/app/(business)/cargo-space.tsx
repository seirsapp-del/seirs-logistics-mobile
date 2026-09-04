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
 * the parcel is offered to that one rider first. They accept or decline,
 * and an unanswered offer expires and refunds without anyone chasing it.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, StatusBar, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { deliveriesApi } from '@/services/api';
import { VEHICLE_LABEL } from '@seirs/shared/models/vehicles';

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
 * so this leads with the class and the plate.
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

  const visibleTrips = (() => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOfDay(new Date());
    const DAY   = 24 * 60 * 60 * 1000;

    const withinWindow = (t: any) => {
      if (when === 'any') return true;
      const at = new Date(t.departAt).getTime();
      if (!Number.isFinite(at)) return true;   // unreadable date is not a reason to hide work
      const day = startOfDay(new Date(at));
      if (when === 'today')    return day === today;
      if (when === 'tomorrow') return day === today + DAY;
      return at < today + 7 * DAY;             // 'week'
    };

    const rows = trips.filter(withinWindow);
    return rows.sort((a, b) =>
      sortBy === 'space'
        ? Number(b.spareCapacityKg ?? 0) - Number(a.spareCapacityKg ?? 0)
        : new Date(a.departAt).getTime() - new Date(b.departAt).getTime(),
    );
  })();

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
      const rows = await deliveriesApi.cargoTrips(a, b);
      setTrips(Array.isArray(rows) ? rows : []);
      setSearched(true);
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
          <Text style={[styles.headerSub, { color: theme.textSecond }]}>
            Room on a trip somebody is already making
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: theme.textSecond }]}>
          Drivers declare intercity trips in advance and say how much weight
          they can still take. Send your load on one and it is offered to that
          driver first. If they cannot take it you are refunded in full.
        </Text>

        <View style={{ gap: 8 }}>
          <TextInput
            value={from}
            onChangeText={setFrom}
            placeholder="Load is going from, e.g. Kano"
            placeholderTextColor={theme.textSecond}
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          />
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="Going to, e.g. Lagos"
            placeholderTextColor={theme.textSecond}
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          />
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
        </View>

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

        {searched && !loading && trips.length === 0 && (
          <View style={styles.emptyWrap}>
            <Icon name="Truck" size={40} color={theme.textSecond} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No space on that route yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              Drivers usually declare a trip a day or two ahead. Check again, or
              send it the normal way and a driver going that way can still pick
              it up.
            </Text>
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
              <Text style={[styles.tripMeta, { color: theme.textSecond, marginTop: 2 }]}>
                {trip.pickupMode === 'fixed' && trip.pickupAddress
                  ? `Load at: ${trip.pickupAddress}`
                  : 'Loads along the route (agree the spot in chat)'}
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
  spare:     { fontSize: 13, fontWeight: '700' },
  sendBtn:   { paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  sendTxt:   { color: '#fff', fontSize: 14, fontWeight: '700' },
});
