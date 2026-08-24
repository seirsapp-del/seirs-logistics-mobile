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
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, StatusBar,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';

const VEHICLE_LABEL: Record<string, string> = {
  motorcycle: 'Okada', tricycle: 'Keke', car: 'Car', van: 'Danfo / Bus',
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
    if (!from.trim() || !to.trim()) {
      Alert.alert('Both cities needed', 'Where are you leaving from, and where to?');
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const rows = await deliveriesApi.travelBuddyTrips(from.trim(), to.trim());
      setTrips(rows ?? []);
    } catch (e: any) {
      Alert.alert('Search failed', e?.message ?? 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  const bookSeat = (trip: any) => {
    const seatWord = (n: number) => `${n} seat${n === 1 ? '' : 's'}`;
    const options: any[] = [];
    for (let n = 1; n <= Math.min(4, trip.seatsLeft); n++) {
      options.push({
        text: seatWord(n),
        onPress: () => {
          Alert.alert('Luggage?', 'A small bag rides free. Large luggage adds a small fee.', [
            { text: 'No luggage',  onPress: () => doBook(trip, n, 'none') },
            { text: 'Small bag',   onPress: () => doBook(trip, n, 'small') },
            { text: 'Large',       onPress: () => doBook(trip, n, 'large') },
          ]);
        },
      });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('How many seats?', `${trip.seatsLeft} available on this trip.`, options);
  };

  const doBook = async (trip: any, seats: number, luggage: string) => {
    setBooking(trip.id);
    try {
      const created = await deliveriesApi.bookTripSeats(trip.id, seats, luggage);
      router.push({
        pathname: '/(customer)/payment/[deliveryId]',
        params: {
          deliveryId:   created.id,
          price:        String(Number(created.price ?? 0)),
          trackingCode: created.trackingCode ?? '',
        },
      } as any);
    } catch (e: any) {
      Alert.alert('Could not book', e?.message ?? 'Try again.');
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
                <Text style={[styles.tripRoute, { color: theme.text }]}>
                  {trip.fromCity} → {trip.toCity}
                </Text>
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
                  {trip.driver?.vehiclePlate ? ` · ${trip.driver.vehiclePlate}` : ''}
                  {trip.driver?.rating ? ` · ★ ${Number(trip.driver.rating).toFixed(1)}` : ''}
                </Text>
                <Text style={[styles.tripMeta, { color: theme.textThird }]}>
                  {trip.pickupMode === 'fixed' && trip.pickupAddress
                    ? `Pickup: ${trip.pickupAddress}`
                    : 'Pickup along the route (agree in chat)'}
                </Text>
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
  tripFoot:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seatsLeft: { fontSize: FontSize.sm, fontWeight: '700' },
  bookBtn:   { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  bookBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
});
