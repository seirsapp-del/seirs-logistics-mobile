/**
 * Travel Buddy (founder 2026-08-23): the interstate marketplace. A
 * driver already going Ibadan→Lagos sells the seats and boot space
 * they truly have; you ride along or your package does.
 *
 * SEIRS prices every seat (drivers never set their own numbers), the
 * seat ledger refuses to oversell, and payment + escrow + tracking are
 * the same rails as every other booking.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, StatusBar, ActivityIndicator, Image, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';
import { showDialog, type DialogAction } from '@/components/SeirsDialog';
import { VEHICLE_LABEL } from '@seirs/shared/models/vehicles';


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
    try {
      const rows = await deliveriesApi.travelBuddyTrips(from.trim(), to.trim());
      setTrips(rows ?? []);
    } catch (e: any) {
      showDialog({ title: 'Search failed', message: e?.message ?? 'Try again.' });
    } finally {
      setLoading(false);
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
      // The vehicle goes in front of the seat count on purpose: this is
      // the last screen before money moves, and the passenger should
      // know what they are walking up to before they pay for it.
      message: `${vehicleSummary(trip.driver)}\n\n${trip.seatsLeft} available on this trip.`,
      actions: [...seats, { text: 'Cancel', style: 'cancel' }],
    });
  };

  const doBook = async (trip: any, seats: number, luggage: string) => {
    setBooking(trip.id);
    try {
      // Book the leg they searched for, not the whole trip.
      const created = await deliveriesApi.bookTripSeats(
        trip.id, seats, luggage,
        trip.segment
          ? { boardStopId: trip.segment.boardStopId, alightStopId: trip.segment.alightStopId }
          : null,
      );
      router.push({
        pathname: '/(customer)/payment/[deliveryId]',
        params: {
          deliveryId:   created.id,
          price:        String(Number(created.price ?? 0)),
          trackingCode: created.trackingCode ?? '',
        },
      } as any);
    } catch (e: any) {
      showDialog({ title: 'Could not book', message: e?.message ?? 'Try again.' });
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
        <Text style={[styles.title, { color: theme.text }]}>Travel Buddy</Text>
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

        <View style={styles.formRow}>
          <TextInput
            value={from}
            onChangeText={setFrom}
            placeholder="From (e.g. Ibadan)"
            placeholderTextColor={theme.textThird}
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          />
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="To (e.g. Lagos)"
            placeholderTextColor={theme.textThird}
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          />
        </View>
        <Pressable style={[styles.searchBtn, { backgroundColor: theme.primary }]} onPress={search} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchBtnText}>Find trips</Text>}
        </Pressable>

        {searched && !loading && trips.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color={theme.textThird} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No trips on this route yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              Drivers declare trips a day or two ahead. Check back, or send
              your package the normal way and it can still ride with an
              intercity driver.
            </Text>
          </View>
        )}

        {trips.map((trip) => (
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
                    ? `Board at ${trip.segment.boardCity} (agree the exact spot in chat)`
                    : trip.pickupMode === 'fixed' && trip.pickupAddress
                      ? `Pickup: ${trip.pickupAddress}`
                      : 'Pickup along the route (agree in chat)'}
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
            <View style={[styles.vehicleId, { backgroundColor: theme.primary + '10' }]}>
              <Ionicons name="eye-outline" size={15} color={theme.primary} />
              <View style={{ flex: 1 }}>
                {vehicleDescription(trip.driver) ? (
                  <Text style={[styles.vehicleDesc, { color: theme.text }]}>
                    Look for a {vehicleDescription(trip.driver).toLowerCase()}
                  </Text>
                ) : (
                  <Text style={[styles.vehicleDesc, { color: theme.textSecond }]}>
                    Colour and model not listed: ask in chat
                  </Text>
                )}
                {trip.driver?.vehiclePlate ? (
                  <Text style={[styles.vehiclePlate, { color: theme.text }]}>
                    {trip.driver.vehiclePlate}
                  </Text>
                ) : (
                  <Text style={[styles.tripMeta, { color: theme.textThird }]}>
                    No plate on file: confirm it with the driver before you board
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.tripFoot}>
              {trip.acceptsPassengers && trip.seatsLeft > 0 ? (
                <>
                  <Text style={[styles.seatsLeft, { color: theme.text }]}>
                    {trip.seatsLeft} seat{trip.seatsLeft === 1 ? '' : 's'} left
                  </Text>
                  <Pressable
                    style={[styles.bookBtn, { backgroundColor: theme.primary }, booking === trip.id && { opacity: 0.6 }]}
                    disabled={booking === trip.id}
                    onPress={() => bookSeat(trip)}
                  >
                    {booking === trip.id
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.bookBtnText}>Book a seat</Text>}
                  </Pressable>
                </>
              ) : trip.acceptsPassengers ? (
                <Text style={[styles.seatsLeft, { color: theme.textThird }]}>Trip is full</Text>
              ) : (
                <Text style={[styles.seatsLeft, { color: theme.textThird }]}>Packages only on this trip</Text>
              )}
              {trip.acceptsPackages && (
                <Pressable onPress={() => router.push('/(customer)/send' as any)}>
                  <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '600' }}>
                    Send a package →
                  </Text>
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
  tripFoot:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seatsLeft: { fontSize: FontSize.sm, fontWeight: '700' },
  bookBtn:   { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  bookBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
});
