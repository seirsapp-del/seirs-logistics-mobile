/**
 * Travel Buddy (founder 2026-08-23): the interstate marketplace. A
 * driver already going Ibadan→Lagos sells the seats and boot space
 * they truly have; you ride along or your package does.
 *
 * SEIRS prices every seat (drivers never set their own numbers), the
 * seat ledger refuses to oversell, and payment + escrow + tracking are
 * the same rails as every other booking.
 */
import { useState, useRef, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, StatusBar, ActivityIndicator, Image, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import * as Location from 'expo-location';
import { deliveriesApi, mapsApi, travelBuddyApi } from '@/services/api';
import { derivePlace } from '@seirs/shared/models/cities';
import { showDialog, type DialogAction } from '@/components/SeirsDialog';
import { VEHICLE_LABEL } from '@seirs/shared/models/vehicles';
import { CitySearchField } from '@/components/CitySearchField';
import { Calendar as RNCalendar } from 'react-native-calendars';
import { tx } from '@/i18n/tx';


/**
 * The colour, make and model of the machine, as one phrase.
 *
 * "Okada" is not an identification. At Ojota at 5am there are two
 * hundred of them and the passenger has paid for exactly one, so the
 * card has to say "Red Bajaj Boxer" or it has said nothing useful. This
 * is a safety line before it is a convenience one: someone who cannot
 * pick their vehicle out of the row also cannot tell it apart from a
 * stranger offering a lift.
 *
 * Every part is optional on the driver's record, so this builds from
 * whatever is actually filled in rather than printing separators around
 * blanks.
 */
const vehicleDescription = (driver: any): string => {
  const parts = [driver?.vehicleColor, driver?.vehicleMake, driver?.vehicleModel]
    .map((w: any) => String(w ?? '').trim())
    .filter(Boolean);
  if (!parts.length) return '';
  const phrase = parts.join(' ');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
};

/** One sentence for the booking dialogs, or an honest admission. */
const vehicleSummary = (driver: any): string => {
  const desc  = vehicleDescription(driver);
  const plate = String(driver?.vehiclePlate ?? '').trim();
  const kind  = VEHICLE_LABEL[driver?.vehicleType] ?? driver?.vehicleType ?? 'vehicle';
  if (desc && plate) return `Look for a ${desc.toLowerCase()}, plate ${plate}.`;
  if (desc)          return `Look for a ${desc.toLowerCase()}. The plate is not listed: ask before you board.`;
  if (plate)         return `Look for plate ${plate} on a ${String(kind).toLowerCase()}.`;
  // Saying so beats an empty line: the passenger knows to ask in chat
  // instead of walking up to the first okada they see.
  return `This driver has not listed the colour or plate. Ask them in chat before you board.`;
};

/**
 * Corridors people actually travel, as one-tap chips.
 *
 * The screen was two empty boxes and a button over two thirds of blank
 * space. It read as an unfinished form rather than a marketplace, and
 * it asked a first-time user to know both the feature AND their route
 * before anything happened (founder 2026-08-29, raised while looking at
 * it for pitch-deck screenshots).
 *
 * Same list the driver app offers a rider when they declare a trip, so
 * both sides of the marketplace are pointed at the same corridors and
 * the pool on each one is not split by wording.
 */
const POPULAR_ROUTES: Array<{ from: string; to: string }> = [
  { from: 'Lagos',   to: 'Ibadan' },
  { from: 'Lagos',   to: 'Abuja' },
  { from: 'Ibadan',  to: 'Abuja' },
  { from: 'Lagos',   to: 'Benin' },
  { from: 'Abuja',   to: 'Kano' },
  { from: 'Lagos',   to: 'Port Harcourt' },
];

export default function TravelBuddyScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [trips,    setTrips]    = useState<any[]>([]);
  const [booking,  setBooking]  = useState<string | null>(null);

  /**
   * Narrowing the board.
   *
   * Discovery was a route pair and nothing else, so three buses running Lagos
   * to Ibadan tomorrow came back in one order with no way to choose between
   * them. Someone travelling wants the one leaving soonest, or the one with
   * room for the whole family, and almost always today or tomorrow rather
   * than whatever sits three weeks out.
   *
   * Applied to rows already fetched. One route returns a small set, so this
   * is instant, cannot fail, and leaves the endpoint the business app shares
   * completely alone.
   */
  const [sortBy, setSortBy] = useState<'soonest' | 'seats'>('soonest');
  const [when,   setWhen]   = useState<'any' | 'today' | 'tomorrow' | 'week'>('any');

  /**
   * The day, and how many of you there are (founder 2026-09-04).
   *
   * The search asked for two cities and nothing else, so a family of
   * three looking for Friday were shown one seat left on a Tuesday okada
   * and had to work out for themselves that it was no use. Both are
   * applied to rows already fetched, so the endpoint the business app
   * shares is untouched.
   */
  const [dayISO, setDayISO] = useState<string | null>(null);
  const [seats,  setSeats]  = useState(1);

  /**
   * A route nobody runs yet is still worth knowing about.
   *
   * An empty search used to be a dead end: a sentence apologising, and
   * no way to act. The person in front of it is the clearest demand
   * signal the business has, someone who has named both ends of a route
   * and wants to pay for it, and we were throwing that away
   * (founder 2026-09-04). Now they can ask to be told, which also gives
   * operations a list of corridors to go and recruit drivers onto.
   */
  const [alerted, setAlerted] = useState(false);
  const [calOpen, setCalOpen] = useState(false);

  /**
   * Coordinates for each end, when we have any (founder 2026-09-04).
   *
   * The server matches names AND, when both ends carry coordinates,
   * distance. Distance is the half that cannot be defeated by a geocoder
   * calling Ile-Ife "Kajola", so the screen collects coordinates
   * wherever it can: from the device when somebody taps "use my
   * location", and otherwise by resolving the typed city once, at search
   * time, rather than on every keystroke.
   */
  const [fromCoords, setFromCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [toCoords,   setToCoords]   = useState<{ lat: number; lng: number } | null>(null);
  const [locating,   setLocating]   = useState<'from' | 'to' | null>(null);

  const useMyLocation = async (which: 'from' | 'to') => {
    setLocating(which);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showDialog({
          title:   'Location is off',
          message: 'Turn on location for SEIRS, or type the town instead. Both work.',
        });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // Name it for the human, but keep the coordinates for the match.
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
    } catch (e: any) {
      showDialog({
        title:   'Could not find you',
        message: e?.message ?? 'Try again, or type the town instead.',
      });
    } finally {
      setLocating(null);
    }
  };

  /** A city name turned into a point, so the distance match can run. */
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

  /**
   * A month of days, not a fortnight (founder 2026-09-05).
   *
   * Two weeks is the wrong horizon for intercity travel here: people
   * book around a wedding, a burial, a school run or a market day that
   * is three or four weeks out, and a strip that stops before the date
   * they have in mind reads as "we do not go then".
   */
  const DAY_STRIP = (() => {
    const out: Array<{ iso: string; top: string; bottom: string }> = [];
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({
        iso,
        top:    i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short' }),
        bottom: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      });
    }
    return out;
  })();

  const visibleTrips = (() => {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOfDay(new Date());
    const DAY   = 24 * 60 * 60 * 1000;

    const withinWindow = (t: any) => {
      const at = new Date(t.departAt).getTime();
      if (!Number.isFinite(at)) return true;   // an unreadable date is not a reason to hide a trip
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
     * Room for the whole party.
     *
     * A trip with one seat left is not a result for three people, and
     * showing it only to refuse them at the seat picker wastes the trip
     * they might have found instead.
     */
    const fitsParty = (t: any) => Number(t.seatsLeft ?? 0) >= seats;

    return trips.filter(t => withinWindow(t) && fitsParty(t)).sort((a, b) =>
      sortBy === 'seats'
        ? Number(b.seatsLeft ?? 0) - Number(a.seatsLeft ?? 0)
        : new Date(a.departAt).getTime() - new Date(b.departAt).getTime(),
    );
  })();

  /**
   * Re-read the seat counts every time this screen comes back.
   *
   * The list was fetched once and never again. Booking pushes straight
   * to payment, so a passenger who backs out, or who simply returns,
   * came back to a card still reading "1 seat left" with a live "Book a
   * seat" button on a trip that was now full: seat picker, luggage
   * picker, then a refusal from the server three taps later. Worse on a
   * one-seat okada, where the passenger holding the unpaid booking is
   * usually the same person looking at the stale button (2026-08-29).
   *
   * The server was never at risk, its claim is a guarded increment and
   * refuses cleanly. This is about not offering a seat that is gone.
   *
   * Silent: no spinner, no empty state, no dialog on failure. A failed
   * refresh leaves the last known list rather than blanking the screen
   * on someone who has not asked for anything.
   */
  const refresh = useCallback(async () => {
    if (!from.trim() || !to.trim()) return;
    try {
      const [a, b] = await Promise.all([
        coordsFor(from, fromCoords),
        coordsFor(to,   toCoords),
      ]);
      const rows = await deliveriesApi.travelBuddyTrips(from.trim(), to.trim(),
        a && b
          ? { fromLat: a.lat, fromLng: a.lng, toLat: b.lat, toLng: b.lng, radiusKm: 25 }
          : undefined);
      setTrips(rows ?? []);
    } catch { /* keep what is on screen */ }
  }, [from, to]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      // The first focus is the mount, and nothing has been searched yet.
      if (firstFocus.current) { firstFocus.current = false; return; }
      refresh();
    }, [refresh]),
  );

  const search = async () => {
    /**
     * Put the keyboard away before answering (2026-08-29).
     *
     * Tapping Find trips left the keyboard up, and the result renders
     * below the button. So the answer, whether it is a list of trips or
     * the "No trips on this route yet" card, appeared underneath the
     * keyboard and the search looked like it had done nothing. Found on
     * the device: the empty state was there the whole time, just
     * invisible until the keyboard was dismissed by hand.
     *
     * Same shape as the business app's address suggestions sitting under
     * the keyboard, which is a defect this codebase has already paid for
     * once.
     */
    Keyboard.dismiss();
    if (!from.trim() || !to.trim()) {
      showDialog({ title: 'Both cities needed', message: 'Where are you leaving from, and where to?' });
      return;
    }
    setLoading(true);
    setSearched(true);
    setAlerted(false);          // a new route is a new question
    try {
      const [a, b] = await Promise.all([
        coordsFor(from, fromCoords),
        coordsFor(to,   toCoords),
      ]);
      const rows = await deliveriesApi.travelBuddyTrips(from.trim(), to.trim(),
        a && b
          ? { fromLat: a.lat, fromLng: a.lng, toLat: b.lat, toLng: b.lng, radiusKm: 25 }
          : undefined);
      setTrips(rows ?? []);
    } catch (e: any) {
      showDialog({ title: 'Search failed', message: e?.message ?? 'Try again.' });
    } finally {
      setLoading(false);
    }
  };

  /** Register the route, so an empty search leaves something behind. */
  const alertMe = async () => {
    try {
      await deliveriesApi.watchTravelBuddyRoute(from.trim(), to.trim());
      setAlerted(true);
    } catch (e: any) {
      showDialog({
        title:   'Could not set that alert',
        message: e?.message ?? 'Try again in a moment.',
      });
    }
  };

  /**
   * Seat picker, then luggage.
   *
   * BUG FIXED 2026-08-24: this built up to five Alert buttons (four seat
   * counts plus Cancel) and handed them to Alert.alert. Android's
   * AlertDialog has three button slots and React Native silently drops
   * everything past the third, so on any trip with three or more seats
   * left, "3 seats" and "4 seats" were never rendered and neither was
   * Cancel: the customer could not book more than two seats and had no
   * button to back out with. Nothing warned about it because the drop
   * happens inside the platform. SeirsDialog renders every action, in a
   * list that scrolls, so a choice can no longer vanish.
   *
   * The luggage step had the mirror problem in miniature: three options
   * and no way out at all.
   */
  const bookSeat = (trip: any) => {
    const seatWord = (n: number) => `${n} seat${n === 1 ? '' : 's'}`;
    const seats: DialogAction[] = [];
    for (let n = 1; n <= Math.min(4, trip.seatsLeft); n++) {
      seats.push({
        text: seatWord(n),
        onPress: () => {
          showDialog({
            title: 'Any luggage?',
            message: 'A small bag rides free. Large luggage adds a small fee.',
            actions: [
              { text: 'No luggage', onPress: () => doBook(trip, n, 'none') },
              { text: 'Small bag',  onPress: () => doBook(trip, n, 'small') },
              { text: 'Large',      onPress: () => doBook(trip, n, 'large') },
              { text: 'Cancel',     style: 'cancel' },
            ],
          });
        },
      });
    }
    showDialog({
      title: 'How many seats?',
      // The vehicle used to be named here, on the reasoning that this is
      // the last screen before money moves. It cannot be: at this point
      // the driver has not agreed to carry this person, and printing
      // their plate to anyone who taps Book would hand it out for the
      // price of a tap. It is promised instead, and delivered on
      // acceptance, before any money actually moves.
      message: `${trip.seatsLeft} available on this trip.\n\nThis sends a request to the driver. Nothing is charged until they accept, and the plate is shown once you pay to hold the seat.`,
      actions: [...seats, { text: 'Cancel', style: 'cancel' }],
    });
  };

  /*
   * A seat is REQUESTED, not bought (2026-09-05).
   *
   * This called /deliveries/travel-buddy/trips/:id/book, which minted a
   * delivery and pushed the payment screen before the driver had seen a
   * thing. Found on device: the driver inbox filters on status "requested"
   * and so stayed empty, the passenger paid for a seat nobody had agreed to
   * carry, and both apps promised the opposite in their own copy. The
   * accept-then-pay flow was already on the server; this is the client
   * finally calling it. Payment happens from Your trip requests once the
   * driver says yes.
   */
  const doBook = async (trip: any, seats: number, luggage: string) => {
    setBooking(trip.id);
    try {
      await travelBuddyApi.requestSeat(trip.id, {
        seats,
        luggage: (luggage === 'small' || luggage === 'large') ? luggage : 'none',
        // The leg they searched for. With no segment the server takes the
        // whole route, first stop to last.
        ...(trip.segment
          ? { boardStopId: trip.segment.boardStopId, alightStopId: trip.segment.alightStopId }
          : {}),
      });
      showDialog({
        title: 'Request sent',
        message: `${trip.driver?.name ?? 'The driver'} has your request. Nothing is charged until they accept. You can watch it under Your trip requests.`,
        actions: [
          { text: 'View requests', onPress: () => router.push('/(customer)/parcel-requests' as any) },
          { text: 'Done', style: 'cancel' },
        ],
      });
    } catch (e: any) {
      showDialog({ title: 'Could not send request', message: e?.message ?? 'Try again.' });
    } finally {
      setBooking(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.travelBuddy.travelBuddy', 'Travel Buddy')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.intro, { backgroundColor: theme.primary + '12' }]}>
          <Ionicons name="car-outline" size={20} color={theme.primary} />
          <Text style={[styles.introText, { color: theme.textSecond }]}>
            Drivers already making an intercity trip sell their real spare
            seats. Cheaper than the park, fully identified drivers, and the
            system never lets a vehicle be overloaded.
          </Text>
        </View>

        {/* A trip is a route, a day and a number of people. The screen used
            to ask only the route, so the other two were discovered at the
            seat picker, three taps in (founder 2026-09-04). */}
        <View style={[styles.searchCard, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
          <CitySearchField
            label="FROM"
            value={from}
            onChange={(v) => { setFrom(v); setFromCoords(null); }}
            placeholder="Where you are leaving"
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
                <Ionicons name="swap-vertical" size={16} color={theme.text} />
              </Pressable>
            }
          />

          <CitySearchField
            label="TO"
            value={to}
            onChange={(v) => { setTo(v); setToCoords(null); }}
            placeholder="Where you are going"
            theme={theme}
            onLocate={() => useMyLocation('to')}
            locating={locating === 'to'}
          />

          <View style={styles.metaRow}>
            <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>WHEN</Text>
            <View style={styles.seatsInline}>
              <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>SEATS</Text>
              <View style={[styles.stepper, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Pressable onPress={() => setSeats(s => Math.max(1, s - 1))} hitSlop={8} style={styles.stepBtn}>
                  <Text style={[styles.stepMark, { color: seats <= 1 ? theme.textThird : theme.text }]}>–</Text>
                </Pressable>
                <Text style={[styles.stepVal, { color: theme.text }]}>{seats}</Text>
                <Pressable onPress={() => setSeats(s => Math.min(4, s + 1))} hitSlop={8} style={styles.stepBtn}>
                  <Text style={[styles.stepMark, { color: seats >= 4 ? theme.textThird : theme.text }]}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/*
            A real month grid, not a strip (founder 2026-09-05: "thats what
            i meant", pointing at the driver's declare screen).

            The strip made you scroll a month sideways to find one Saturday.
            Somebody travelling for a wedding, a burial or a market day
            already knows the date; they should be able to touch it. Same
            component and the same theming the driver already uses, so both
            sides of the marketplace pick a day the same way.

            minDate is today because nobody books a trip into the past, and
            there is no maxDate: unlike the driver's declare screen the
            server refuses nothing here, and a picker that greys a day it
            would actually accept teaches the passenger that the screen
            lies.
          */}
          <Pressable
            onPress={() => setCalOpen(v => !v)}
            style={[styles.dayField, { backgroundColor: theme.surface, borderColor: calOpen ? theme.primary : theme.border }]}
          >
            <Text style={[styles.dayFieldText, { color: dayISO ? theme.text : theme.textThird }]}>
              {dayISO
                ? new Date(`${dayISO}T00:00:00`).toLocaleDateString('en-GB',
                    { weekday: 'short', day: 'numeric', month: 'short' })
                : 'Any date'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {!!dayISO && (
                <Text
                  onPress={() => { setDayISO(null); setCalOpen(false); }}
                  style={[styles.dayClear, { color: theme.primary }]}
                >
                  Any date
                </Text>
              )}
              <Ionicons name={calOpen ? 'chevron-up' : 'calendar-outline'} size={18} color={theme.textSecond} />
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

        <Pressable style={[styles.searchBtn, { backgroundColor: theme.primary }]} onPress={search} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchBtnText}>{tx('auto.travelBuddy.findTrips', 'Find trips')}</Text>}
        </Pressable>

        {/* Corridors, until a search has been run. They fill a screen that
            was otherwise empty, teach what Travel Buddy is without
            reading the paragraph above, and turn two typed cities into
            one tap. They step aside the moment there are results. */}
        {!searched && (
          <View style={styles.routesWrap}>
            <Text style={[styles.routesLabel, { color: theme.textSecond }]}>POPULAR ROUTES</Text>
            <View style={styles.routesRow}>
              {POPULAR_ROUTES.map(r => (
                <Pressable
                  key={`${r.from}-${r.to}`}
                  onPress={() => { setFrom(r.from); setTo(r.to); }}
                  style={[styles.routeChip, { borderColor: theme.border, backgroundColor: theme.surfaceSecond }]}
                >
                  <Text style={[styles.routeChipText, { color: theme.text }]}>
                    {r.from} <Text style={{ color: theme.textThird }}>→</Text> {r.to}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.routesNote, { color: theme.textThird }]}>
              Tap one to fill the boxes, then Find trips. Any other route works too: type it in.
            </Text>
          </View>
        )}

        {searched && !loading && visibleTrips.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color={theme.textThird} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {trips.length > 0 ? 'Nothing matching that day' : 'No trips on this route yet'}
            </Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              {trips.length > 0
                ? `There are ${trips.length} trip${trips.length === 1 ? '' : 's'} on this route, just not for ${seats} seat${seats === 1 ? '' : 's'} on the day you picked. Try Any date.`
                : 'Drivers declare trips a day or two ahead. Check back, or send your package the normal way and it can still ride with an intercity driver.'}
            </Text>

            {/* The dead end, made into a door. */}
            {trips.length === 0 && (
              alerted ? (
                <View style={[styles.alertDone, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
                  <Text style={[styles.alertDoneText, { color: theme.text }]}>
                    We will tell you when a driver declares {from.trim()} to {to.trim()}.
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={alertMe}
                  style={[styles.alertBtn, { borderColor: theme.primary, backgroundColor: theme.surface }]}
                >
                  <Ionicons name="notifications-outline" size={17} color={theme.primary} />
                  <Text style={[styles.alertBtnText, { color: theme.primary }]}>
                    Alert me when someone declares this route
                  </Text>
                </Pressable>
              )
            )}

            <Text style={[styles.routesLabel, { color: theme.textSecond, marginTop: Spacing.lg }]}>OR TRY</Text>
            <View style={styles.routesRow}>
              {POPULAR_ROUTES.map(r => (
                <Pressable
                  key={`empty-${r.from}-${r.to}`}
                  onPress={() => { setFrom(r.from); setTo(r.to); setDayISO(null); }}
                  style={[styles.routeChip, { borderColor: theme.border, backgroundColor: theme.surfaceSecond }]}
                >
                  <Text style={[styles.routeChipText, { color: theme.text }]}>
                    {r.from} <Text style={{ color: theme.textThird }}>→</Text> {r.to}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Only once there is something to narrow. Chips on an empty board
            are furniture. */}
        {searched && !loading && trips.length > 0 && (
          <View style={{ gap: 8, marginBottom: Spacing.sm }}>
            <View style={styles.filterRow}>
              {([['soonest', 'Leaving soonest'], ['seats', 'Most seats']] as const).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setSortBy(key)}
                  style={[styles.filterChip, {
                    borderColor: sortBy === key ? theme.primary : theme.border,
                    backgroundColor: sortBy === key ? theme.primary : theme.surface,
                  }]}
                >
                  <Text style={[styles.filterChipText, { color: sortBy === key ? '#fff' : theme.text }]}>
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
                  <Text style={[styles.filterChipText, { color: when === key ? theme.primary : theme.textSecond }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {/* A filter emptying the board must not read as "nobody drives
                this route". */}
            {visibleTrips.length === 0 && (
              <Text style={{ fontSize: FontSize.sm, color: theme.textSecond }}>
                {trips.length} {trips.length === 1 ? 'trip' : 'trips'} on this route, none in that window. Try Any time.
              </Text>
            )}
          </View>
        )}

        {visibleTrips.map((trip) => (
          <View key={trip.id} style={[styles.tripCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {trip.driver?.vehiclePhotoUrl ? (
                <Image source={{ uri: trip.driver.vehiclePhotoUrl }} style={styles.vehImg} />
              ) : (
                <View style={[styles.vehImg, { backgroundColor: theme.surfaceSecond, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="car-outline" size={22} color={theme.textThird} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                {/*
                  Head the card with the part of the route THIS passenger
                  is riding (2026-08-29).

                  The search now matches intermediate stops, so somebody
                  searching Ibadan to Lagos can find a trip that runs Jos
                  to Ibadan to Lagos. Showing that trip's endpoints would
                  head their card "Jos → Lagos" with a Jos pickup
                  address, and they would book believing they board in
                  Jos, 791 km from where they actually get on.

                  Their own segment leads. The full route stays underneath
                  as context, because it is still useful to know the
                  driver is coming all the way from Jos.
                */}
                <Text style={[styles.tripRoute, { color: theme.text }]}>
                  {trip.segment
                    ? `${trip.segment.boardCity} → ${trip.segment.alightCity}`
                    : `${trip.fromCity} → ${trip.toCity}`}
                </Text>
                {/*
                  The stops in between, which is the whole point of a
                  declared trip and was the one thing the card never said.
                  A passenger searching Ile-Ife to Ibadan saw "Ile-Ife →
                  Lagos" and had to guess whether the run served them
                  (founder, 2026-09-05, watching it happen).
                */}
                {trip.stopCities?.length > 2 && (
                  <Text style={[styles.tripMeta, { color: theme.textSecond }]} numberOfLines={2}>
                    via {trip.stopCities.slice(1, -1).join(' · ')}
                  </Text>
                )}
                {trip.segment && (
                  <Text style={[styles.tripMeta, { color: theme.textThird }]}>
                    part of {trip.fromCity} → {trip.toCity}
                    {trip.segment.segmentKm ? ` · ${trip.segment.segmentKm} km` : ''}
                  </Text>
                )}
                <Text style={[styles.tripMeta, { color: theme.textSecond }]}>
                  {new Date(trip.departAt).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>

            <View style={[styles.driverRow, { borderTopColor: theme.border }]}>
              {/* A face, because the passenger has to recognise somebody at
                  the roadside in the dark (founder call, 2026-09-05). */}
              {trip.driver?.profilePhoto
                ? <Image source={{ uri: trip.driver.profilePhoto }} style={styles.driverPhoto} />
                : <View style={[styles.driverPhoto, styles.driverPhotoEmpty, { backgroundColor: theme.primary + "15" }]}>
                    <Ionicons name="person" size={20} color={theme.primary} />
                  </View>}
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverName, { color: theme.text }]}>{trip.driver?.name}</Text>
                <Text style={[styles.tripMeta, { color: theme.textSecond }]}>
                  {VEHICLE_LABEL[trip.driver?.vehicleType] ?? trip.driver?.vehicleType}
                  {trip.driver?.rating ? ` · ★ ${Number(trip.driver.rating).toFixed(1)}` : ''}
                </Text>
                {/* The fixed pickup point belongs to the trip's ORIGIN.
                    Showing it to somebody boarding at a later stop would
                    send them to the wrong city. */}
                <Text style={[styles.tripMeta, { color: theme.textThird }]}>
                  {trip.segment
                    ? `Get on at ${trip.segment.boardCity}, off at ${trip.segment.alightCity}`
                    : trip.pickupMode === 'fixed' && trip.pickupArea
                      ? `Gets you on at ${trip.pickupArea}, off at ${trip.toCity}`
                      : 'Pickup along the route (agree in chat)'}
                </Text>
                <Text style={[styles.tripMeta, { color: theme.textThird }]}>
                  Exact spot once the driver accepts you
                </Text>
              </View>
            </View>

            {/*
              Which car, in its own row rather than tucked into the grey
              meta line. The plate moved out of that line and up here for
              the same reason: at a motor park before dawn this is the
              only thing that tells the right vehicle from a stranger's,
              so it has to be the part of the card that is easy to read.
            */}
            {/*
              Which car, and WHEN you get to know (2026-09-04).

              This row printed the plate, colour and model straight off
              the browse list, and the card above it carried a photograph
              of the vehicle and the driver's full name. So any stranger
              running a search could assemble, for every declared trip, a
              named driver, their vehicle, the exact place they would be
              standing and the exact minute. The founder's reason for
              keeping trips off the home screen was driver safety; this
              was the same exposure through another door.

              The list now says what KIND of vehicle, which is what a
              passenger needs in order to choose. The plate, photograph
              and colour arrive with the acceptance, which is the moment
              the driver has agreed to meet this particular person.
            */}
            <View style={[styles.vehicleId, { backgroundColor: theme.primary + '10' }]}>
              <Ionicons name="lock-closed-outline" size={15} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.vehicleDesc, { color: theme.text }]}>
                  {[trip.driver?.vehicleColor, trip.driver?.vehicleMake, trip.driver?.vehicleModel]
                    .filter(Boolean)
                    .join(' ') || VEHICLE_LABEL[trip.driver?.vehicleType] || 'Vehicle'}
                </Text>
                <Text style={[styles.tripMeta, { color: theme.textThird }]}>
                  The plate is shown once the driver accepts you
                </Text>
              </View>
            </View>

            {/*
              The foot had three jobs on one row: how many seats are left,
              a filled pill, and a long text link that ended up as heavy as
              the pill. On a narrow phone it wrapped, and the founder's word
              for it was "jam packed" (2026-09-05).

              Seats are INFORMATION, so they move up out of the way. The two
              things a passenger can do become two buttons of equal width:
              filled for the seat, outlined for the parcel. Same shape, same
              height, one obviously primary.
            */}
            <Text style={[styles.seatsLine, { color: theme.textSecond }]}>
              {trip.acceptsPassengers && trip.seatsLeft > 0
                ? `${trip.seatsLeft} seat${trip.seatsLeft === 1 ? '' : 's'} left`
                : trip.acceptsPassengers
                  ? 'Trip is full'
                  : 'Packages only on this trip'}
              {trip.spareCapacityKg > 0 ? ` · ${trip.spareCapacityKg} kg spare` : ''}
            </Text>

            <View style={styles.tripFoot}>
              {trip.acceptsPassengers && trip.seatsLeft > 0 && (
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: theme.primary }, booking === trip.id && { opacity: 0.6 }]}
                  disabled={booking === trip.id}
                  onPress={() => bookSeat(trip)}
                >
                  {booking === trip.id
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.actionBtnText}>{tx('auto.travelBuddy.bookASeat', 'Book a seat')}</Text>}
                </Pressable>
              )}
              {/*
                This read "Send a package →" beside a specific rider's
                trip, which promises a booking onto THAT trip. It pushes
                the ordinary Send wizard with no trip attached at all
                (2026-08-29).

                UPDATE 2026-08-31: packages ARE booked onto a trip now.
                This link used to push the Send wizard with no trip
                attached at all, so it promised a connection the code
                never made, and the wording was softened rather than the
                gap being closed.

                The whole offer lifecycle already existed and never cared
                what kind of booking it was: only this trip's driver sees
                it, only they can claim it, they can decline it, and an
                unanswered offer expires and refunds. The one missing
                piece was a way to create a PACKAGE with a tripId, which
                is what the params below now do.
              */}
              {trip.acceptsPackages && (
                <Pressable
                  style={[styles.actionBtn, styles.actionBtnGhost, { borderColor: theme.primary }]}
                  onPress={() => router.push({
                    pathname: '/(customer)/send',
                    params: {
                      tripId: trip.id,
                      tripLabel: `${trip.fromCity} to ${trip.toCity}`,
                    },
                  } as any)}
                >
                  <Text style={[styles.actionBtnText, { color: theme.primary }]}>{tx('auto.travelBuddy.sendAParcel', 'Send a parcel')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  intro:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg },
  introText: { flex: 1, fontSize: FontSize.sm, lineHeight: 19 },

  formRow: { gap: Spacing.sm },
  input:   { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: FontSize.base },

  // The trip search: route, day and party size in one card, so the three
  // questions a journey actually has are asked together.
  searchCard:  { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.md },
  swapBtn:     { width: 34, height: 34, borderRadius: 17, borderWidth: 1,
                 alignItems: 'center', justifyContent: 'center' },
  fieldLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seatsInline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepper:     { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.full,
                 paddingHorizontal: 4, height: 34 },
  stepBtn:     { width: 30, alignItems: 'center', justifyContent: 'center' },
  stepMark:    { fontSize: 19, fontWeight: '600', lineHeight: 22 },
  stepVal:     { fontSize: FontSize.base, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  dayField:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 13 },
  dayFieldText: { fontSize: FontSize.base, fontWeight: '600' },
  dayClear:     { fontSize: FontSize.sm, fontWeight: '700' },
  calWrap:      { borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
  dayStrip:    { gap: Spacing.sm, paddingRight: Spacing.md },
  dayChip:     { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8,
                 alignItems: 'center', minWidth: 62 },
  dayTop:      { fontSize: FontSize.sm, fontWeight: '700' },
  dayBottom:   { fontSize: FontSize.xs, marginTop: 1 },

  // The empty result, which is a demand signal rather than an apology.
  alertBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                   borderWidth: 1, borderRadius: Radius.full, paddingVertical: 12, paddingHorizontal: 16,
                   marginTop: Spacing.md },
  alertBtnText:  { fontSize: FontSize.sm, fontWeight: '700' },
  alertDone:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
                   borderRadius: Radius.md, padding: 12, marginTop: Spacing.md },
  alertDoneText: { fontSize: FontSize.sm, flex: 1, lineHeight: 19 },
  routesWrap:    { marginTop: Spacing.lg, gap: Spacing.sm },
  routesLabel:   { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
  routesRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  routeChip:     { paddingHorizontal: 12, paddingVertical: 9, borderRadius: Radius.full, borderWidth: 1 },
  routeChipText: { fontSize: FontSize.sm, fontWeight: '600' },
  // Smaller than the route chips above on purpose: those start a search,
  // these narrow one that already ran, and they should not compete for it.
  filterRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip:     { paddingHorizontal: 11, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  filterChipText: { fontSize: FontSize.xs, fontWeight: '600' },
  routesNote:    { fontSize: FontSize.xs, lineHeight: 16, marginTop: 2 },
  searchBtn:     { height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: '700' },

  empty:      { alignItems: 'center', paddingTop: 40, gap: 8, paddingHorizontal: 30 },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  emptySub:   { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 19 },

  tripCard:  { borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 10 },
  vehImg:    { width: 64, height: 48, borderRadius: 8 },
  tripRoute: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  tripMeta:  { fontSize: FontSize.xs, marginTop: 1 },
  driverRow: { borderTopWidth: 1, paddingTop: 10 },
  driverName:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  vehicleId:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: 10, borderRadius: Radius.md },
  vehicleDesc: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  // Plates are read at a distance, so they get the letter spacing.
  vehiclePlate:{ fontSize: FontSize.base, fontWeight: '700', letterSpacing: 1, marginTop: 1 },
  seatsLine:     { fontSize: FontSize.xs, fontWeight: '600', marginTop: 10 },
  actionBtn:     { flex: 1, minHeight: 44, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  actionBtnGhost:{ backgroundColor: 'transparent', borderWidth: 1.5 },
  actionBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  driverPhoto:      { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  driverPhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  tripFoot:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  seatsLeft: { fontSize: FontSize.sm, fontWeight: '700' },
  bookBtn:   { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  bookBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
});
