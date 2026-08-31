/**
 * Who wants a seat on the trips you declared.
 *
 * Built 2026-08-31. The backend has had accept and decline since Travel
 * Buddy shipped and the driver app called neither, so a driver declared an
 * intercity trip and then had no way to see that anybody wanted to ride, let
 * alone say yes. The founder spotted it from the home screen: "when they
 * declare a trip how do they see the customers so they can accept or
 * decline".
 *
 * A request holds no seat and charges nobody until the driver accepts, so
 * declining costs the passenger nothing and there is no refund to chase.
 * That is why the decline button carries no ceremony.
 */
import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Users, MapPin, Luggage, ArrowLeft, Inbox } from 'lucide-react-native';
import { driversApi } from '@/services/api';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { alertDialog } from '@/components/SeirsDialog';

interface Req {
  id:         string;
  tripId:     string;
  tripLabel:  string;
  seats:      number;
  luggage:    string | null;
  note:       string | null;
  boardName:  string | null;
  alightName: string | null;
  fareNgn:    number | null;
  passenger:  string | null;
}

export default function SeatRequestsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [reqs,       setReqs]       = useState<Req[] | null>(null);
  const [busyId,     setBusyId]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const trips = await driversApi.myInterstateTrips().catch(() => []);
      const active = (trips ?? []).filter((t: any) => t?.acceptsPassengers);

      // One trip at a time is fine: a driver has a handful, not hundreds.
      const all: Req[] = [];
      for (const t of active) {
        const bookings = await driversApi.tripBookings(t.id).catch(() => []);
        for (const b of bookings ?? []) {
          if (String(b?.status) !== 'requested') continue;
          all.push({
            id:         b.id,
            tripId:     t.id,
            tripLabel:  [t.fromCity, t.toCity].filter(Boolean).join(' to ') || 'Your trip',
            seats:      Number(b.seats ?? 1),
            luggage:    b.luggage ?? null,
            note:       b.note ?? null,
            boardName:  b.boardStopName ?? b.boardName ?? null,
            alightName: b.alightStopName ?? b.alightName ?? null,
            fareNgn:    b.fareNgn != null ? Number(b.fareNgn) : null,
            passenger:  b.passengerName ?? b.customerName ?? null,
          });
        }
      }
      setReqs(all);
    } catch {
      setReqs([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const answer = async (r: Req, yes: boolean) => {
    setBusyId(r.id);
    try {
      if (yes) await driversApi.acceptSeat(r.id);
      else     await driversApi.declineSeat(r.id);
      await load();
    } catch (e: any) {
      alertDialog(
        yes ? 'Could not accept' : 'Could not decline',
        e?.message ?? 'Try again in a moment.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Seat requests</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {reqs === null ? (
          <View style={styles.center}><ActivityIndicator color={theme.primary} /></View>
        ) : reqs.length === 0 ? (
          <View style={styles.center}>
            <Inbox size={40} color={theme.textThird} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nobody waiting</Text>
            <Text style={[styles.emptySub, { color: theme.textThird }]}>
              When someone asks for a seat on a trip you declared, it lands here.
              Nothing is charged until you say yes.
            </Text>
          </View>
        ) : (
          reqs.map((r) => (
            <View key={r.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.trip, { color: theme.textThird }]}>{r.tripLabel}</Text>

              <View style={styles.row}>
                <Users size={15} color={theme.primary} />
                <Text style={[styles.strong, { color: theme.text }]}>
                  {r.seats} seat{r.seats === 1 ? '' : 's'}
                  {r.passenger ? ` for ${r.passenger}` : ''}
                </Text>
              </View>

              {(r.boardName || r.alightName) && (
                <View style={styles.row}>
                  <MapPin size={15} color={theme.textThird} />
                  <Text style={[styles.meta, { color: theme.textSecond }]} numberOfLines={2}>
                    {r.boardName ?? 'your start'} to {r.alightName ?? 'your destination'}
                  </Text>
                </View>
              )}

              {!!r.luggage && (
                <View style={styles.row}>
                  <Luggage size={15} color={theme.textThird} />
                  <Text style={[styles.meta, { color: theme.textSecond }]}>{r.luggage}</Text>
                </View>
              )}

              {!!r.note && (
                <Text style={[styles.note, { color: theme.textSecond, borderLeftColor: theme.border }]}>
                  {r.note}
                </Text>
              )}

              {r.fareNgn != null && (
                <Text style={[styles.fare, { color: theme.text }]}>
                  {'₦'}{r.fareNgn.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for this leg
                </Text>
              )}

              <View style={styles.actions}>
                <Pressable
                  disabled={busyId === r.id}
                  onPress={() => void answer(r, false)}
                  style={[styles.btn, { borderColor: theme.border, backgroundColor: theme.surfaceSecond }]}
                >
                  <Text style={[styles.btnText, { color: theme.textSecond }]}>Decline</Text>
                </Pressable>
                <Pressable
                  disabled={busyId === r.id}
                  onPress={() => void answer(r, true)}
                  style={[styles.btn, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                >
                  {busyId === r.id
                    ? <ActivityIndicator color={theme.textOnPrimary} />
                    : <Text style={[styles.btnText, { color: theme.textOnPrimary }]}>Accept</Text>}
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  content:    { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  center:     { alignItems: 'center', gap: 8, paddingTop: 80, paddingHorizontal: Spacing.lg },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any, marginTop: 6 },
  emptySub:   { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  card:       { borderWidth: 1, borderRadius: Radius.xl, padding: Spacing.md, gap: 8 },
  trip:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, letterSpacing: 0.6, textTransform: 'uppercase' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  strong:     { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any, flex: 1 },
  meta:       { fontSize: FontSize.sm, flex: 1 },
  note:       { fontSize: FontSize.sm, fontStyle: 'italic', borderLeftWidth: 2, paddingLeft: 10, marginTop: 2 },
  fare:       { fontSize: FontSize.base, fontWeight: FontWeight.bold as any, marginTop: 2 },
  actions:    { flexDirection: 'row', gap: Spacing.sm, marginTop: 6 },
  btn:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1 },
  btnText:    { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
});
