/**
 * Loads you have asked drivers to carry, and what they said back.
 *
 * Built 2026-08-31. Posting a load to a rider's declared trip is a
 * REQUEST, not a booking: nothing is charged while it waits, a decline
 * costs nothing, and there is no refund to chase. The founder's reason,
 * in his words: "once they pay then its irreversible with deductions,
 * like charges from bank etc".
 *
 * The screen earns its place at one moment. A driver who cannot reach
 * your drop-off can offer one they DO pass, priced for the new distance,
 * and this is where both numbers sit side by side and you decide.
 * Accepting is the first thing in the whole flow that leads to a payment.
 */
import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useSeirsDialog } from '@/components/SeirsDialog';
import { deliveriesApi } from '@/services/api';
import { naira } from '@/utils/money';
import { tx } from '@/i18n/tx';

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
};

/** Plain words for each state, from the sender's side of it. */
const STATE_COPY: Record<string, { label: string; tone: 'wait' | 'act' | 'done' | 'dead' }> = {
  requested: { label: 'Waiting for the driver',      tone: 'wait' },
  countered: { label: 'Driver offered another spot', tone: 'act'  },
  accepted:  { label: 'Agreed, payment due',         tone: 'done' },
  declined:  { label: 'Driver said no',              tone: 'dead' },
  withdrawn: { label: 'You withdrew this',           tone: 'dead' },
  expired:   { label: 'No answer in time',           tone: 'dead' },
};

export default function TripRequestsScreen() {
  const router = useRouter();
  const dialog = useSeirsDialog();
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

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
      dialog.alert('Could not withdraw', e?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  const takeCounter = async (r: Req) => {
    setBusy(r.id);
    try {
      const res = await deliveriesApi.acceptParcelCounter(r.id);
      const d = res?.delivery;
      // Agreement is what creates a booking. Payment is the next screen,
      // and the first time money is involved at all.
      if (d?.id) {
        router.replace({ pathname: '/(business)/delivery/[id]', params: { id: d.id } } as any);
      } else {
        await load();
      }
    } catch (e: any) {
      dialog.alert('Could not accept', e?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  const toneColor = (tone: string) =>
    tone === 'act'  ? '#B45309'
    : tone === 'done' ? '#16A34A'
    : tone === 'dead' ? theme.textThird
    : theme.textSecond;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{tx('auto.tripRequests.tripRequests', 'Trip requests')}</Text>
          <Text style={[styles.headerSub, { color: theme.textSecond }]}>
            Loads you have asked drivers to carry
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
      >
        {loading && rows.length === 0 && (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
        )}

        {!loading && rows.length === 0 && (
          <View style={styles.empty}>
            <Icon name="Truck" size={40} color={theme.textSecond} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{tx('auto.tripRequests.nothingAskedYet', 'Nothing asked yet')}</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              Find a driver already making your route under Cargo Space and ask
              them to carry your load. Nothing is charged until they agree.
            </Text>
          </View>
        )}

        {rows.map((r) => {
          const meta = STATE_COPY[r.status] ?? { label: r.status, tone: 'wait' as const };
          const open = r.status === 'requested' || r.status === 'countered';
          return (
            <View key={r.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.state, { color: toneColor(meta.tone) }]}>{meta.label.toUpperCase()}</Text>

              <View style={styles.row}>
                <Icon name="MapPin" size={13} color="#16A34A" />
                <Text style={[styles.addr, { color: theme.text }]} numberOfLines={1}>{r.pickupAddress}</Text>
              </View>
              <View style={styles.row}>
                <Icon name="Navigation" size={13} color="#EF4444" />
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
                The counter carries its OWN price, shown beside the original.
                The driver changed where the load goes and therefore what it
                costs; agreeing to the old number would be agreeing to a
                journey nobody is making.
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
                <Text style={[styles.fact, { color: theme.textThird }]}>
                  Nothing is charged while you wait.
                </Text>
              )}

              <View style={styles.actions}>
                {open && (
                  <Pressable
                    disabled={busy === r.id}
                    onPress={() => withdraw(r)}
                    style={[styles.ghostBtn, { borderColor: theme.border }]}
                  >
                    <Text style={[styles.ghostTxt, { color: theme.textSecond }]}>{tx('auto.tripRequests.withdraw', 'Withdraw')}</Text>
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
                      : <Text style={styles.primaryTxt}>{tx('auto.tripRequests.acceptAndPay', 'Accept and pay')}</Text>}
                  </Pressable>
                )}
                {r.status === 'accepted' && r.deliveryId && (
                  <Pressable
                    onPress={() => router.push({ pathname: '/(business)/delivery/[id]', params: { id: r.deliveryId } } as any)}
                    style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                  >
                    <Text style={styles.primaryTxt}>{tx('auto.tripRequests.openAndPay', 'Open and pay')}</Text>
                  </Pressable>
                )}
              </View>
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

  card:  { borderWidth: 1, borderRadius: 12, padding: 14, gap: 7 },
  state: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addr:  { flex: 1, fontSize: 14 },

  factRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  fact:    { fontSize: 12.5, lineHeight: 17 },
  fare:    { fontSize: 14, fontWeight: '600' },

  counter:      { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4, marginTop: 2 },
  counterTitle: { fontSize: 14, fontWeight: '700' },
  counterNote:  { fontSize: 12.5, lineHeight: 17 },
  counterPrice: { fontSize: 16, fontWeight: '700', marginTop: 2 },

  actions:    { flexDirection: 'row', gap: 8, marginTop: 6 },
  ghostBtn:   { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ghostTxt:   { fontSize: 14, fontWeight: '600' },
  primaryBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  primaryTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
});
