import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, MapPin, Calendar, Truck, ArrowRight,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi } from '@/services/api';

// Spec V8 §2.18: driver declares an upcoming intercity trip
// (Lagos → Ibadan, etc.). System surfaces matching packages along
// that corridor. Customer chose at booking whether to drop at
// destination address or destination partner store.

const POPULAR_ROUTES = [
  { from: 'Lagos',   to: 'Ibadan',  km: 145 },
  { from: 'Lagos',   to: 'Abuja',   km: 760 },
  { from: 'Ibadan',  to: 'Abuja',   km: 605 },
  { from: 'Lagos',   to: 'Benin',   km: 320 },
  { from: 'Abuja',   to: 'Kano',    km: 350 },
  { from: 'Lagos',   to: 'Port Harcourt', km: 620 },
];

export default function InterstateScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [from,        setFrom]        = useState('');
  const [to,          setTo]          = useState('');
  const [departAt,    setDepartAt]    = useState('');
  const [vehicleSpace,setVehicleSpace]= useState('1');

  // Travel Buddy (founder 23 Aug): sell what the vehicle truly has.
  const [takePassengers, setTakePassengers] = useState(false);
  const [seats,          setSeats]          = useState('1');
  const [takePackages,   setTakePackages]   = useState(true);
  const [pickupMode,     setPickupMode]     = useState<'along_route' | 'fixed'>('along_route');
  const [pickupAddress,  setPickupAddress]  = useState('');
  const [routeKm,        setRouteKm]        = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  // The declared list + cancel existed as endpoints since spec 2.18;
  // the screen never showed them, so a driver could declare a trip and
  // then neither see nor undo it (founder audit 2026-08-22).
  const [myTrips, setMyTrips] = useState<any[]>([]);
  const loadTrips = () => {
    driversApi.myInterstateTrips()
      .then((rows: any[]) => setMyTrips((rows ?? []).filter(r => r.status === 'active')))
      .catch(() => {});
  };
  useEffect(() => { loadTrips(); }, []);

  const cancelTrip = (trip: any) => {
    Alert.alert(
      'Cancel this trip?',
      `${trip.fromCity} → ${trip.toCity}. You will stop receiving packages matched to this route.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel trip', style: 'destructive',
          onPress: async () => {
            try { await driversApi.cancelInterstateTrip(trip.id); loadTrips(); }
            catch (e: any) { Alert.alert('Could not cancel', e?.message ?? 'Try again.'); }
          } },
      ],
    );
  };

  const submit = async () => {
    if (!from.trim() || !to.trim()) { Alert.alert('Both cities required'); return; }
    if (!departAt) { Alert.alert('Departure time required'); return; }
    // Accept "YYYY-MM-DD HH:mm" form by normalizing to ISO before sending.
    const depart = departAt.includes('T') ? departAt : departAt.replace(' ', 'T');
    if (Number.isNaN(new Date(depart).getTime())) {
      Alert.alert('Invalid departure', 'Use the format YYYY-MM-DD HH:mm.');
      return;
    }
    setSubmitting(true);
    try {
      await driversApi.declareInterstateTrip({
        fromCity:        from.trim(),
        toCity:          to.trim(),
        departAt:        new Date(depart).toISOString(),
        spareCapacityKg: Number(vehicleSpace) || 0,
        acceptsPassengers: takePassengers,
        seatsTotal:        takePassengers ? (Number(seats) || 1) : 0,
        acceptsPackages:   takePackages,
        pickupMode,
        pickupAddress:     pickupMode === 'fixed' ? pickupAddress.trim() || undefined : undefined,
        routeKm:           Number(routeKm) > 0 ? Number(routeKm) : undefined,
      });
      Alert.alert(
        'Trip declared',
        `You're listed for ${from} → ${to} on ${new Date(depart).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Matching packages will appear in your available jobs.`,
        [{ text: 'OK', onPress: () => { loadTrips(); setFrom(''); setTo(''); setDepartAt(''); } }],
      );
    } catch (e: any) {
      Alert.alert('Could not declare trip', e?.message ?? 'Try again.');
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {myTrips.length > 0 && (
            <View style={{ gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: 0.6, color: theme.textSecond }}>
                MY DECLARED TRIPS
              </Text>
              {myTrips.map((tr) => (
                <View key={tr.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: Radius.lg, padding: 12 }}>
                  <MapPin size={16} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>
                      {tr.fromCity} → {tr.toCity}
                    </Text>
                    <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, marginTop: 1 }}>
                      Departs {new Date(tr.departAt).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {Number(tr.spareCapacityKg) > 0 ? ` · ${Number(tr.spareCapacityKg)}kg spare` : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => cancelTrip(tr)} hitSlop={8}>
                    <Text style={{ color: '#DC2626', fontSize: FontSize.sm, fontWeight: '700' }}>Cancel</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={[styles.intro, { backgroundColor: theme.primary + '12' }]}>
            <Truck size={20} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.introTitle, { color: theme.text }]}>Earn extra on long-haul trips</Text>
              <Text style={[styles.introSub, { color: theme.textSecond }]}>
                Tell us you&apos;re going intercity and matching packages along your route will be auto-offered.
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
            <Text style={[styles.label, { color: theme.textSecond }]}>FROM</Text>
            <TextInput value={from} onChangeText={setFrom} placeholder="e.g. Lagos" placeholderTextColor={theme.textThird} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
          </View>

          <View style={{ alignItems: 'center', marginVertical: -8 }}>
            <ArrowRight size={20} color={theme.textThird} />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={[styles.label, { color: theme.textSecond }]}>TO</Text>
            <TextInput value={to} onChangeText={setTo} placeholder="e.g. Ibadan" placeholderTextColor={theme.textThird} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
          </View>

          <View style={{ gap: 6, marginTop: Spacing.sm }}>
            <Text style={[styles.label, { color: theme.textSecond }]}>DEPARTURE</Text>
            <TextInput
              value={departAt}
              onChangeText={setDepartAt}
              placeholder="YYYY-MM-DD HH:mm"
              placeholderTextColor={theme.textThird}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            />
            <Text style={[styles.helper, { color: theme.textThird }]}>Use 24-hour time. e.g. 2026-05-12 09:00</Text>
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
              <Text style={{ color: theme.textThird, fontSize: FontSize.xs }}>Uses your spare kg above</Text>
            </View>
            <Text style={{ color: takePassengers || takePackages ? theme.primary : theme.textThird, fontWeight: '700' }}>{takePackages ? 'ON' : 'OFF'}</Text>
          </Pressable>

          <Pressable
            onPress={() => setTakePassengers(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderColor: takePassengers ? theme.primary : theme.border, borderWidth: 1.5, borderRadius: Radius.lg, padding: 12 }}
          >
            <MapPin size={18} color={takePassengers ? theme.primary : theme.textSecond} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold }}>Carry passengers</Text>
              <Text style={{ color: theme.textThird, fontSize: FontSize.xs }}>
                Real seats only: SEIRS blocks overloading. No doubling the front seat, ever.
              </Text>
            </View>
            <Text style={{ color: takePassengers ? theme.primary : theme.textThird, fontWeight: '700' }}>{takePassengers ? 'ON' : 'OFF'}</Text>
          </Pressable>

          {takePassengers && (
            <View style={{ gap: 10 }}>
              <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, marginBottom: 4 }}>Seats you're selling (your vehicle class caps this)</Text>
                <TextInput
                  value={seats}
                  onChangeText={setSeats}
                  keyboardType="number-pad"
                  placeholder="e.g. 3"
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
              {pickupMode === 'fixed' && (
                <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, marginBottom: 4 }}>Pickup point (e.g. Iwo Road roundabout)</Text>
                  <TextInput
                    value={pickupAddress}
                    onChangeText={setPickupAddress}
                    placeholder="Where passengers meet you"
                    placeholderTextColor={theme.textThird}
                    style={{ color: theme.text, fontSize: FontSize.base, padding: 0 }}
                  />
                </View>
              )}
              <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ color: theme.textSecond, fontSize: FontSize.xs, marginBottom: 4 }}>Route distance in km (popular routes fill this automatically)</Text>
                <TextInput
                  value={routeKm}
                  onChangeText={setRouteKm}
                  keyboardType="number-pad"
                  placeholder="e.g. 145"
                  placeholderTextColor={theme.textThird}
                  style={{ color: theme.text, fontSize: FontSize.base, padding: 0 }}
                />
              </View>
            </View>
          )}


          <Pressable
            disabled={submitting}
            onPress={submit}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Declare trip</Text>}
          </Pressable>

          <Text style={[styles.footnote, { color: theme.textThird }]}>
            Matching packages along your declared route are boosted to you automatically. You can decline any individual offer.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
