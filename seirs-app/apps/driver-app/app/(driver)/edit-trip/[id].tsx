/**
 * Change a declared trip.
 *
 * The rider could declare a trip and cancel it, and nothing in between.
 * A departure typed half an hour out, or a seat count one too low,
 * meant cancelling and re-declaring the whole route, stops and all.
 * That is the same complaint the sender side had about unpaid bookings
 * (founder 2026-08-29).
 *
 * What may change depends on whether anyone has booked, and the screen
 * says which rather than offering a control the server will refuse:
 *
 *   nobody booked   departure, seats, spare capacity, and whether the
 *                   trip takes passengers or packages.
 *   someone booked  only what cannot strand them: more seats, more
 *                   spare capacity. The departure is frozen because a
 *                   passenger arranged their day around it.
 *
 * The route is never edited here. Cities and stops carry the measured
 * distances every segment fare is computed from, so a different route
 * is a different trip: cancel and declare it.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Calendar as RNCalendar } from 'react-native-calendars';
import { ArrowLeft, Lock } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

/**
 * Every half hour of the day, matching the declare form.
 *
 * This was a SECOND copy of the 04:00 to 22:00 grid. The declare screen was
 * widened to 24 hours when the founder found he could not declare a 22:30
 * departure, and this one was missed, so a rider could declare a night trip
 * and then be unable to EDIT it to another night time. He hit that within
 * minutes: "look at the edit screen i cant pick 23:00".
 *
 * The comment above it said "same grid the declare form offers", which was
 * true when written and became a lie the moment the other file changed. A
 * comment claiming two things match is not a mechanism that keeps them
 * matching. This wants to be one shared constant; leaving it duplicated for
 * now because the founder is mid-test and a shared module is a wider change
 * than the moment allows.
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
const onlyDigits  = (v: string) => v.replace(/[^0-9]/g, '');
const onlyDecimal = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');

export default function EditTrip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const theme  = Colors[scheme ?? 'light'];

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [trip,    setTrip]    = useState<any>(null);
  const [error,   setError]   = useState('');

  const [departDate, setDepartDate] = useState('');
  const [departTime, setDepartTime] = useState('');
  const [seats,      setSeats]      = useState('1');
  const [spareKg,    setSpareKg]    = useState('0');
  const [takesPax,   setTakesPax]   = useState(false);
  const [takesPkg,   setTakesPkg]   = useState(true);

  const booked = Math.max(0, Number(trip?.seatsBooked ?? 0));
  const frozen = booked > 0;

  useEffect(() => {
    (async () => {
      try {
        const rows = await driversApi.myInterstateTrips();
        const t = (rows ?? []).find((r: any) => String(r.id) === String(id));
        if (!t) { setError('That trip is no longer listed.'); return; }
        setTrip(t);
        const d = new Date(t.departAt);
        setDepartDate(d.toISOString().slice(0, 10));
        setDepartTime(d.toTimeString().slice(0, 5));
        setSeats(String(Number(t.seatsTotal ?? 1)));
        setSpareKg(String(Number(t.spareCapacityKg ?? 0)));
        setTakesPax(!!t.acceptsPassengers);
        setTakesPkg(!!t.acceptsPackages);
      } catch (e: any) {
        setError(e?.message ?? 'Could not open this trip.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const save = useCallback(async () => {
    setError('');
    const body: Record<string, any> = {
      seatsTotal:        Number(seats) || 0,
      spareCapacityKg:   Number(spareKg) || 0,
      acceptsPassengers: takesPax,
      acceptsPackages:   takesPkg,
    };
    // Only send a departure when it is still the rider's to move, and
    // only when they actually picked both halves of it.
    if (!frozen && departDate && departTime) {
      body.departAt = new Date(`${departDate}T${departTime}:00`).toISOString();
    }

    setSaving(true);
    try {
      await driversApi.editInterstateTrip(String(id), body);
      alertDialog('Trip updated', 'Your changes are live. Passengers searching this route see them now.', [
        { text: tr('auto.profile.done', 'Done'), onPress: () => router.back() },
      ]);
    } catch (e: any) {
      setError(e?.message ?? 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  }, [seats, spareKg, takesPax, takesPkg, frozen, departDate, departTime, id, router]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
        <View style={styles.centre}><ActivityIndicator color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.id.editTrip', 'Edit trip')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        <View style={[styles.banner, { backgroundColor: theme.surface, borderColor: frozen ? theme.primary : theme.border }]}>
          <Text style={[styles.bannerTitle, { color: theme.text }]}>
            {trip?.fromCity} → {trip?.toCity}
          </Text>
          <Text style={[styles.bannerNote, { color: theme.textSecond }]}>
            {frozen
              ? `${booked} seat${booked === 1 ? ' is' : tx9('auto.editTripDetail.sAre', 's are')} booked and paid for. You can still open up more seats or more space, but the departure is fixed: your passengers arranged their day around it. Cancel the trip if you can no longer make it.`
              : tx9('auto.editTripDetail.nobodyHasBookedYetSo', 'Nobody has booked yet, so everything below is still yours to change. The route itself is fixed: cancel and declare a new trip to drive somewhere else.')}
          </Text>
        </View>

        {/* Departure */}
        <Text style={[styles.label, { color: theme.textSecond }]}>DEPARTURE</Text>
        {frozen ? (
          <View style={[styles.locked, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Lock size={15} color={theme.textThird} />
            <Text style={[styles.lockedText, { color: theme.textSecond }]}>
              {new Date(trip.departAt).toLocaleString('en-NG', {
                weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          </View>
        ) : (
          <View style={[styles.pickerBox, { borderColor: theme.border, backgroundColor: theme.surface }]}>
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
              <Text style={[styles.label, { color: theme.textSecond, marginBottom: 8 }]}>{tr('auto.editTripDetail.departureTime', 'DEPARTURE TIME')}</Text>
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
                      onPress={() => setDepartTime(slot)}
                      style={[
                        styles.slot,
                        { borderColor: theme.border, backgroundColor: theme.background },
                        active && { borderColor: theme.primary, backgroundColor: theme.primary },
                        past && { opacity: 0.35 },
                      ]}
                    >
                      <Text style={{
                        color: active ? '#FFFFFF' : theme.text,
                        fontSize: FontSize.xs,
                        fontWeight: active ? '700' : '500',
                      }}>{slot}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* Passengers */}
        <View style={[styles.rowBetween, { marginTop: Spacing.sm }]}>
          <View style={styles.flex}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{tx('auto.id.takePassengers', 'Take passengers')}</Text>
            {frozen && takesPax && (
              <Text style={[styles.rowNote, { color: theme.textThird }]}>
                {tr('auto.editTripDetail.cannotBeTurnedOffWith', 'Cannot be turned off with seats already booked.')}
              </Text>
            )}
          </View>
          <Switch
            value={takesPax}
            disabled={frozen && takesPax}
            onValueChange={setTakesPax}
            trackColor={{ true: theme.primary }}
          />
        </View>
        {takesPax && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>
              SEATS FOR SALE{frozen ? tx9('auto.editTripDetail.alreadyBooked', '({{booked}} already booked)', { booked }) : ''}
            </Text>
            <TextInput
              value={seats}
              onChangeText={v => setSeats(onlyDigits(v))}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={theme.textThird}
              style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
            />
          </View>
        )}

        {/* Packages */}
        <View style={styles.rowBetween}>
          <Text style={[styles.rowTitle, { color: theme.text }]}>{tx('auto.id.carryPackages', 'Carry packages')}</Text>
          <Switch value={takesPkg} onValueChange={setTakesPkg} trackColor={{ true: theme.primary }} />
        </View>
        {takesPkg && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.textSecond }]}>{tr('auto.editTripDetail.spareSpaceKg', 'SPARE SPACE (KG)')}</Text>
            <TextInput
              value={spareKg}
              onChangeText={v => setSpareKg(onlyDecimal(v))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.textThird}
              style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
            />
            <Text style={[styles.rowNote, { color: theme.textThird }]}>
              {tr('auto.editTripDetail.whatIsGenuinelyLeftAfter', 'What is genuinely left after your own load. We stop offering you packages once this much is spoken for.')}
            </Text>
          </View>
        )}

        {!!error && <Text style={[styles.error, { color: '#DC2626' }]}>{error}</Text>}

        <Pressable
          onPress={save}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: theme.primary }, saving && { opacity: 0.6 }]}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveText}>{tx('auto.id.saveChanges', 'Save changes')}</Text>}
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title:  { fontSize: FontSize.lg, fontWeight: FontWeight.semibold as any },
  body:   { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },
  banner: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, gap: 4 },
  bannerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  bannerNote:  { fontSize: FontSize.xs, lineHeight: 17 },
  label:  { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.4 },
  pickerBox: { borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
  slot:   { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  locked: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
  },
  lockedText: { fontSize: FontSize.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  rowTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  rowNote:    { fontSize: FontSize.xs, marginTop: 3, lineHeight: 16 },
  field:  { gap: 6 },
  input:  {
    borderWidth: 1, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSize.md,
  },
  error:  { fontSize: FontSize.sm },
  saveBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md, borderRadius: Radius.lg },
  saveText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
});
