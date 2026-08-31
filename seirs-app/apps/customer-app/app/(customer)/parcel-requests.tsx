/**
 * What you have asked drivers to carry, and what they said back.
 *
 * Built 2026-08-31. Posting a parcel to a rider's declared trip is a
 * REQUEST, not a booking: nothing is charged while it waits, a decline
 * costs you nothing, and there is no refund to chase. The founder's
 * reason, in his words: "once they pay then its irreversible with
 * deductions, like charges from bank etc".
 *
 * The screen exists mostly for one moment. A driver who cannot reach
 * your drop-off can offer one they DO pass, at a fresh price for the
 * new distance, and this is where you see both and decide. Accepting is
 * the first thing in the whole flow that leads to a payment.
 */
import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Package, MapPin, Navigation, Clock } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';
import { showDialog } from '@/components/SeirsDialog';
import { naira } from '@/utils/money';

type Req = {
  id: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  weightKg: number | string;
  quotedNgn: number | string | null;
  quotedKm: number | string | null;
  counterDropAddress: string | null;
  counterNote: string | null;
  counterQuotedNgn: number | string | null;
  counterQuotedKm: number | string | null;
  declineReason: string | null;
  deliveryId: string | null;
  expiresAt: string;
};

/** Plain words for each state, from the sender's side of it. */
const STATE_COPY: Record<string, { label: string; tone: 'wait' | 'act' | 'done' | 'dead' }> = {
  requested: { label: 'Waiting for the driver',       tone: 'wait' },
  countered: { label: 'Driver offered another spot',  tone: 'act'  },
  accepted:  { label: 'Agreed, payment due',          tone: 'done' },
  declined:  { label: 'Driver said no',               tone: 'dead' },
  withdrawn: { label: 'You withdrew this',            tone: 'dead' },
  expired:   { label: 'No answer in time',            tone: 'dead' },
};

export default function ParcelRequestsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [rows, setRows]       = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await deliveriesApi.myParcelRequests().catch(() => []);
      setRows((list ?? []) as Req[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const withdraw = async (r: Req) => {
    setBusy(r.id);
    try {
      await deliveriesApi.withdrawParcelRequest(r.id);
      await load();
    } catch (e: any) {
      showDialog({ title: 'Could not withdraw', message: e?.message ?? 'Try again in a moment.' });
    } finally {
      setBusy(null);
    }
  };

  const takeCounter = async (r: Req) => {
    setBusy(r.id);
    try {
      const res = await deliveriesApi.acceptParcelCounter(r.id);
      const d = res?.delivery;
      // Agreement is the thing that creates a booking. Payment is the
      // next screen, and the first time money is involved at all.
      if (d?.id) {
        router.replace({
          pathname: '/(customer)/payment/[deliveryId]',
          params: {
            deliveryId:   d.id,
            price:        String(Number(d.price ?? 0)),
            trackingCode: d.trackingCode ?? '',
          },
        } as any);
      } else {
        await load();
      }
    } catch (e: any) {
      showDialog({ title: 'Could not accept', message: e?.message ?? 'Try again in a moment.' });
    } finally {
      setBusy(null);
    }
  };

  const payFor = (r: Req) => {
    if (!r.deliveryId) return;
    router.push({
      pathname: '/(customer)/payment/[deliveryId]',
      params: { deliveryId: r.deliveryId },
    } as any);
  };

  const toneColor = (tone: string) =>
    tone === 'act'  ? '#B45309'
    : tone === 'done' ? '#16A34A'
    : tone === 'dead' ? theme.textThird
    : theme.textSecond;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={cs === 'dark' ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Your trip requests</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
      >
        {loading && rows.length === 0 && (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
        )}

        {!loading && rows.length === 0 && (
          <View style={styles.empty}>
            <Package size={40} color={theme.textThird} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing asked yet</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              Find a driver already going your way under Travel Buddy and ask
              them to carry your parcel. Nothing is charged until they agree.
            </Text>
          </View>
        )}

        {rows.map((r) => {
          const meta = STATE_COPY[r.status] ?? { label: r.status, tone: 'wait' as const };
          const open = r.status === 'requested' || r.status === 'countered';
          return (
            <View key={r.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              <Text style={[styles.state, { color: toneColor(meta.tone) }]}>{meta.label.toUpperCase()}</Text>

              <View style={styles.row}>
                <MapPin size={13} color="#16A34A" strokeWidth={2} />
                <Text style={[styles.addr, { color: theme.text }]} numberOfLines={1}>{r.pickupAddress}</Text>
              </View>
              <View style={styles.row}>
                <Navigation size={13} color="#EF4444" strokeWidth={2} />
                <Text style={[styles.addr, { color: theme.text }]} numberOfLines={1}>{r.dropoffAddress}</Text>
              </View>

              <View style={styles.factRow}>
                <Text style={[styles.fact, { color: theme.textSecond }]}>
                  {Number(r.weightKg ?? 0)} kg
                  {r.quotedKm != null ? ` · ${Number(r.quotedKm)} km` : ''}
                </Text>
                {r.quotedNgn != null && (
                  <Text style={[styles.fare, { color: theme.text }]}>{naira(Number(r.quotedNgn))}</Text>
                )}
              </View>

              {/*
                The counter. Shown as its OWN price, next to the original,
                because the driver has changed where it goes and therefore
                what it costs. Agreeing to the old number would be agreeing
                to a journey nobody is making.
              */}
              {r.status === 'countered' && (
                <View style={[styles.counter, { backgroundColor: '#B4530918', borderColor: '#B45309' }]}>
                  <Text style={[styles.counterTitle, { color: '#B45309' }]}>
                    They can drop it at {r.counterDropAddress}
                  </Text>
                  {!!r.counterNote && (
                    <Text style={[styles.counterNote, { color: theme.textSecond }]}>{r.counterNote}</Text>
                  )}
                  <Text style={[styles.counterPrice, { color: theme.text }]}>
                    {r.counterQuotedNgn != null ? naira(Number(r.counterQuotedNgn)) : 'Price to confirm'}
                    {r.counterQuotedKm != null ? `  ·  ${Number(r.counterQuotedKm)} km` : ''}
                  </Text>
                </View>
              )}

              {r.status === 'declined' && !!r.declineReason && (
                <Text style={[styles.fact, { color: theme.textThird }]}>{r.declineReason}</Text>
              )}

              {r.status === 'requested' && (
                <View style={styles.row}>
                  <Clock size={12} color={theme.textThird} strokeWidth={2} />
                  <Text style={[styles.fact, { color: theme.textThird }]}>
                    Nothing is charged while you wait.
                  </Text>
                </View>
              )}

              <View style={styles.actions}>
                {open && (
                  <Pressable
                    disabled={busy === r.id}
                    onPress={() => withdraw(r)}
                    style={[styles.ghostBtn, { borderColor: theme.border }]}
                  >
                    <Text style={[styles.ghostTxt, { color: theme.textSecond }]}>Withdraw</Text>
                  </Pressable>
                )}
                {r.status === 'countered' && (
                  <Pressable
                    disabled={busy === r.id}
                    onPress={() => takeCounter(r)}
                    style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                  >
                    {busy === r.id
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.primaryTxt}>Accept and pay</Text>}
                  </Pressable>
                )}
                {r.status === 'accepted' && r.deliveryId && (
                  <Pressable onPress={() => payFor(r)} style={[styles.primaryBtn, { backgroundColor: theme.primary }]}>
                    <Text style={styles.primaryTxt}>Pay now</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },

  card:  { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 7 },
  state: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addr:  { flex: 1, fontSize: FontSize.sm },

  factRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  fact:    { fontSize: FontSize.xs, lineHeight: 17 },
  fare:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },

  counter:      { borderWidth: 1, borderRadius: Radius.md, padding: 10, gap: 4, marginTop: 2 },
  counterTitle: { fontSize: FontSize.sm, fontWeight: '700' },
  counterNote:  { fontSize: FontSize.xs, lineHeight: 17 },
  counterPrice: { fontSize: FontSize.md, fontWeight: FontWeight.bold as any, marginTop: 2 },

  actions:    { flexDirection: 'row', gap: 8, marginTop: 6 },
  ghostBtn:   { paddingVertical: 10, paddingHorizontal: 16, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ghostTxt:   { fontSize: FontSize.sm, fontWeight: '600' },
  primaryBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  primaryTxt: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  emptySub:   { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing.lg },
});
