/**
 * Edit a booking that has not been paid for.
 *
 * Founder, 2026-08-29: "why can't a user edit their previous booking
 * since they haven't paid", and then "the same goes for sending a
 * package", and then "what about booking a ride". The answer was that
 * an unpaid booking had exactly two actions, Pay now and Cancel, so a
 * wrong flat number or a mistyped weight meant throwing the booking
 * away and rebuilding it from the first screen. The tracking code went
 * with it, which matters when the sender has already passed it on.
 *
 * One screen, three shapes, because the three kinds are genuinely
 * different objects and pretending otherwise would show a passenger a
 * weight field:
 *
 *   Travel Buddy seat  seats and luggage. Board and alight belong to
 *                      the rider's trip and are not the passenger's to
 *                      retype.
 *   Book-a-Ride        where they are going, and in what.
 *   Package            everything about the parcel and the receiver.
 *
 * The price is never computed here. The server re-prices the row
 * through the active rate card and hands back the before and after, so
 * a change that costs more says so in the confirmation rather than
 * appearing as a surprise on the payment screen.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Save, Package, Car, Users, Info } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { deliveriesApi, configApi, driversApi } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import InlineAddressPicker from '@/components/InlineAddressPicker';
import { tx } from '@/i18n/tx';

/* The same input filters the Send wizard uses. Typed on a phone, a
   decimal field will happily take "3Chidinma" unless something stops
   it. */
const onlyDecimal = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const onlyDigits  = (v: string) => v.replace(/[^0-9+]/g, '');
const onlyName    = (v: string) => v.replace(/[^\p{L} .'\-]/gu, '');

const LUGGAGE: Array<{ id: string; label: string; note: string }> = [
  { id: 'none',  label: 'No luggage', note: 'Just you' },
  { id: 'small', label: 'Small bag',  note: 'Rides free' },
  { id: 'large', label: 'Large',      note: 'Adds a fee' },
];

export default function EditBooking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const theme  = Colors[scheme ?? 'light'];

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [row,     setRow]     = useState<any>(null);
  const [error,   setError]   = useState('');

  // Editable state, filled from the row once it lands.
  const [seats,       setSeats]       = useState(1);
  const [luggage,     setLuggage]     = useState('none');
  const [pickup,      setPickup]      = useState<{ address: string; lat: number; lng: number } | null>(null);
  const [dropoff,     setDropoff]     = useState<{ address: string; lat: number; lng: number } | null>(null);
  const [weightKg,    setWeightKg]    = useState('');
  const [description, setDescription] = useState('');
  const [declared,    setDeclared]    = useState('');
  const [rcvFirst,    setRcvFirst]    = useState('');
  const [rcvLast,     setRcvLast]     = useState('');
  const [rcvPhone,    setRcvPhone]    = useState('');
  /**
   * Which luggage sizes this vehicle can actually take.
   *
   * "Large" was offered on an okada and the server refused it on save
   * (device QA 2026-08-29). The founder's standing rule is that a
   * control either works or it is not there, so the option is removed
   * for vehicles the card has no luggage fee for rather than shown and
   * then refused. Defaults to all three until the card lands, because
   * the server is the one that decides either way.
   */
  const [luggageOk, setLuggageOk] = useState<string[]>(['none', 'small', 'large']);
  /**
   * The trip's declared stops, and which two this passenger is riding
   * between.
   *
   * "Can you edit the address too" (founder 2026-08-29). On a parcel or
   * a ride, yes, and it always could. On a seat it cannot be a text box,
   * because the rider is not going to an address the passenger types.
   * What a passenger genuinely needs is a different LEG of the same
   * trip, and the stops are already an ordered line with measured
   * distances, so they are offered as a choice instead.
   */
  const [stops,  setStops]  = useState<any[]>([]);
  const [board,  setBoard]  = useState<string | null>(null);
  const [alight, setAlight] = useState<string | null>(null);

  // What the booking was riding when this screen opened, so an
  // untouched picker does not count as a change.
  const initialLeg = useRef<{ board: string | null; alight: string | null }>({ board: null, alight: null });

  const isSeat = !!row?.tripId;
  const isRide = row?.kind === 'ride';

  useEffect(() => {
    (async () => {
      try {
        const d = await deliveriesApi.get(String(id));
        setRow(d);
        setSeats(Number(d.seatCount ?? 0) || 1);
        const desc = String(d.packageDescription ?? '');
        setLuggage(/large luggage/.test(desc) ? 'large' : /small bag/.test(desc) ? 'small' : 'none');
        setPickup({ address: d.pickupAddress ?? '',  lat: Number(d.pickupLat),  lng: Number(d.pickupLng) });
        setDropoff({ address: d.dropoffAddress ?? '', lat: Number(d.dropoffLat), lng: Number(d.dropoffLng) });
        setWeightKg(d.weightKg != null ? String(d.weightKg) : '');
        setDescription(d.tripId ? '' : (d.packageDescription ?? ''));
        setDeclared(d.declaredValueNgn != null ? String(d.declaredValueNgn) : '');
        setRcvFirst(d.receiverFirstName ?? '');
        setRcvLast(d.receiverLastName ?? '');
        setRcvPhone(d.receiverPhone ?? '');
        if (d.tripId) {
          try {
            const card: any = await configApi.rateCard();
            const fee = card?.luggageFees?.[d.vehicleType];
            setLuggageOk(fee == null ? ['none', 'small'] : ['none', 'small', 'large']);
          } catch { /* leave all three: the server still decides */ }
          try {
            const rows = await driversApi.interstateTripStops(String(d.tripId));
            const ordered = (rows ?? []).slice().sort((a: any, b: any) => a.sequence - b.sequence);
            setStops(ordered);
            // Pre-select the leg they are on by matching the stored
            // addresses back to stops. The pickup carries a trailing
            // "(agree the exact spot in chat)", so compare on the start.
            const pick = (addr: string) =>
              ordered.find((st: any) => addr && String(addr).startsWith(String(st.address)))?.id ?? null;
            const b = pick(d.pickupAddress);
            const a = pick(d.dropoffAddress);
            setBoard(b); setAlight(a);
            initialLeg.current = { board: b, alight: a };
          } catch { /* no stops: the leg simply cannot be changed */ }
        }
      } catch (e: any) {
        setError(e?.message ?? 'Could not open this booking.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const save = useCallback(async () => {
    setError('');

    // Only send what this kind actually owns. A passenger has no weight
    // and a rider's trip stops are not the passenger's to move.
    let patch: Record<string, any>;
    if (isSeat) {
      patch = { seats, luggage };
      // Only when both ends are chosen AND they actually differ from
      // where this booking already boards, so an untouched screen does
      // not re-price a leg nobody changed.
      if (board && alight && (board !== initialLeg.current.board || alight !== initialLeg.current.alight)) {
        const bi = stops.findIndex(st => st.id === board);
        const ai = stops.findIndex(st => st.id === alight);
        if (bi >= 0 && ai >= 0 && ai <= bi) {
          setError('You cannot board after you get off. Pick the stops the other way round.');
          return;
        }
        patch.boardStopId  = board;
        patch.alightStopId = alight;
      }
    } else if (isRide) {
      if (!pickup?.address || !dropoff?.address) {
        setError('Both the pickup and the destination are needed.');
        return;
      }
      patch = {
        pickupAddress: pickup.address,  pickupLat: pickup.lat,  pickupLng: pickup.lng,
        dropoffAddress: dropoff.address, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng,
      };
    } else {
      const kg = parseFloat(weightKg);
      if (!(kg > 0)) {
        setError('Enter the weight in kilograms.');
        return;
      }
      if (!pickup?.address || !dropoff?.address) {
        setError('Both the pickup and the delivery address are needed.');
        return;
      }
      patch = {
        pickupAddress: pickup.address,  pickupLat: pickup.lat,  pickupLng: pickup.lng,
        dropoffAddress: dropoff.address, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng,
        weightKg: kg,
        packageDescription: description.trim(),
        declaredValueNgn: declared.trim() ? Number(declared) : 0,
        receiverFirstName: rcvFirst.trim(),
        receiverLastName:  rcvLast.trim(),
        receiverPhone:     rcvPhone.trim(),
      };
    }

    setSaving(true);
    try {
      const res = await deliveriesApi.editUnpaid(String(id), patch);
      const money = (n: number) =>
        `NGN ${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      alertDialog(
        'Booking updated',
        res.priceChanged
          ? `The price changed from ${money(res.priceBeforeNgn)} to ${money(res.priceAfterNgn)}. Nothing has been charged yet.`
          : `Your changes are saved. The price is still ${money(res.priceAfterNgn)}.`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (e: any) {
      setError(e?.message ?? 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  }, [isSeat, isRide, seats, luggage, board, alight, stops, pickup, dropoff, weightKg, description, declared, rcvFirst, rcvLast, rcvPhone, id, router]);

  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
        <View style={styles.centre}><ActivityIndicator color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  const Kind = isSeat ? Users : isRide ? Car : Package;
  const kindLabel = isSeat ? 'Travel Buddy seat' : isRide ? 'Ride' : 'Package';

  const field = (label: string, node: React.ReactNode) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecond }]}>{label}</Text>
      {node}
    </View>
  );
  const input = (value: string, onChange: (v: string) => void, placeholder: string, extra: object = {}) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.textThird}
      style={[styles.input, { backgroundColor: theme.surfaceSecond, color: theme.text, borderColor: theme.border }]}
      {...extra}
    />
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.id.editBooking', 'Edit booking')}</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

          <View style={[styles.banner, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Kind size={18} color={theme.primary} />
            <View style={styles.flex}>
              <Text style={[styles.bannerTitle, { color: theme.text }]}>
                {kindLabel} · {row?.trackingCode}
              </Text>
              <Text style={[styles.bannerNote, { color: theme.textSecond }]}>
                Nothing has been paid yet, so this can still change. We work the price out again when you save.
              </Text>
            </View>
          </View>

          {isSeat ? (
            <>
              {field('How many seats', (
                <View style={styles.row}>
                  {[1, 2, 3, 4].map(n => (
                    <Pressable
                      key={n}
                      onPress={() => setSeats(n)}
                      style={[
                        styles.chip,
                        { borderColor: theme.border, backgroundColor: theme.surfaceSecond },
                        seats === n && { borderColor: theme.primary, backgroundColor: theme.primary + '18' },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: seats === n ? theme.primary : theme.text }]}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
              {field('Luggage', (
                <View style={styles.row}>
                  {LUGGAGE.filter(l => luggageOk.includes(l.id)).map(l => (
                    <Pressable
                      key={l.id}
                      onPress={() => setLuggage(l.id)}
                      style={[
                        styles.wideChip,
                        { borderColor: theme.border, backgroundColor: theme.surfaceSecond },
                        luggage === l.id && { borderColor: theme.primary, backgroundColor: theme.primary + '18' },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: luggage === l.id ? theme.primary : theme.text }]}>{l.label}</Text>
                      <Text style={[styles.chipNote, { color: theme.textThird }]}>{l.note}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
              {stops.length > 1 ? (
                <>
                  {field('Where you board', (
                    <View style={styles.stopList}>
                      {stops.slice(0, -1).map(st => (
                        <Pressable
                          key={`b-${st.id}`}
                          onPress={() => setBoard(st.id)}
                          style={[
                            styles.stopRow,
                            { borderColor: theme.border, backgroundColor: theme.surfaceSecond },
                            board === st.id && { borderColor: theme.primary, backgroundColor: theme.primary + '18' },
                          ]}
                        >
                          <Text style={[styles.stopCity, { color: board === st.id ? theme.primary : theme.text }]}>
                            {st.city}
                          </Text>
                          <Text style={[styles.stopAddr, { color: theme.textThird }]} numberOfLines={1}>
                            {st.address}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ))}
                  {field('Where you get off', (
                    <View style={styles.stopList}>
                      {stops.slice(1).map(st => {
                        // A stop at or before the boarding point cannot be
                        // a destination, so it is not offered as one.
                        const bi = stops.findIndex(x => x.id === board);
                        const si = stops.findIndex(x => x.id === st.id);
                        if (bi >= 0 && si <= bi) return null;
                        return (
                          <Pressable
                            key={`a-${st.id}`}
                            onPress={() => setAlight(st.id)}
                            style={[
                              styles.stopRow,
                              { borderColor: theme.border, backgroundColor: theme.surfaceSecond },
                              alight === st.id && { borderColor: theme.primary, backgroundColor: theme.primary + '18' },
                            ]}
                          >
                            <Text style={[styles.stopCity, { color: alight === st.id ? theme.primary : theme.text }]}>
                              {st.city}
                            </Text>
                            <Text style={[styles.stopAddr, { color: theme.textThird }]} numberOfLines={1}>
                              {st.address}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                  <View style={styles.noteRow}>
                    <Info size={14} color={theme.textThird} />
                    <Text style={[styles.note, { color: theme.textThird }]}>
                      These are the driver's own stops, so the fare changes with the leg you pick. Agree the exact spot with them in chat.
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.noteRow}>
                  <Info size={14} color={theme.textThird} />
                  <Text style={[styles.note, { color: theme.textThird }]}>
                    This trip runs straight through with no stops in between, so there is no other leg to ride. Cancel and search again to travel a different route.
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              <InlineAddressPicker
                label={isRide ? 'Pick you up at' : 'Collect from'}
                dotColor={theme.primary}
                value={pickup?.address ?? ''}
                onSelect={(p: any) => setPickup({ address: p.address, lat: p.lat, lng: p.lng })}
              />
              <InlineAddressPicker
                label={isRide ? 'Going to' : 'Deliver to'}
                dotColor={theme.error}
                value={dropoff?.address ?? ''}
                onSelect={(p: any) => setDropoff({ address: p.address, lat: p.lat, lng: p.lng })}
              />

              {!isRide && (
                <>
                  {field('Weight (kg)', input(weightKg, v => setWeightKg(onlyDecimal(v)), 'e.g. 2.5', { keyboardType: 'decimal-pad' }))}
                  {field('What is inside', input(description, setDescription, 'e.g. Two cartons of books', { multiline: true }))}
                  {field('Declared value (NGN)', input(declared, v => setDeclared(onlyDecimal(v)), 'Leave blank if not insured', { keyboardType: 'number-pad' }))}
                  {field('Receiver first name', input(rcvFirst, v => setRcvFirst(onlyName(v)), 'e.g. Chidinma'))}
                  {field('Receiver last name',  input(rcvLast,  v => setRcvLast(onlyName(v)),  'e.g. Okafor'))}
                  {field('Receiver phone',      input(rcvPhone, v => setRcvPhone(onlyDigits(v)), '08012345678', { keyboardType: 'phone-pad' }))}
                </>
              )}
            </>
          )}

          {!!error && (
            <Text style={[styles.error, { color: theme.error }]}>{error}</Text>
          )}

          <Pressable
            onPress={save}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: theme.primary }, saving && { opacity: 0.6 }]}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : (<><Save size={18} color="#fff" /><Text style={styles.saveText}>{tx('auto.id.saveChanges', 'Save changes')}</Text></>)}
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.lg, fontWeight: FontWeight.semibold as any },
  body:    { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },
  banner:  {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth,
  },
  bannerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  bannerNote:  { fontSize: FontSize.xs, marginTop: 2, lineHeight: 17 },
  field: { gap: 6 },
  label: { fontSize: FontSize.xs },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSize.md,
  },
  row:   { flexDirection: 'row', gap: Spacing.sm },
  chip:  {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderWidth: 1, borderRadius: Radius.md,
  },
  wideChip: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, paddingHorizontal: 4,
    borderWidth: 1, borderRadius: Radius.md,
  },
  chipText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  chipNote: { fontSize: FontSize.xs, marginTop: 2 },
  stopList: { gap: 6 },
  stopRow:  { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  stopCity: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  stopAddr: { fontSize: FontSize.xs, marginTop: 1 },
  noteRow:  { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  note:     { flex: 1, fontSize: FontSize.xs, lineHeight: 17 },
  error:    { fontSize: FontSize.sm },
  saveBtn:  {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.sm,
  },
  saveText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
});
