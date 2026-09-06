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
  RefreshControl, StatusBar, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Package, MapPin, Navigation, Clock, Armchair } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi, travelBuddyApi } from '@/services/api';
import { showDialog } from '@/components/SeirsDialog';
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

/**
 * Seat requests live on this screen too (2026-09-05).
 *
 * A seat is asked for, accepted by the driver, and only THEN paid, the same
 * shape as a parcel request. Until tonight the customer app booked seats
 * through a different path that charged first, so the driver never saw a
 * request and the passenger paid for a seat nobody had agreed to carry.
 * One screen for both kinds of ask, because the passenger is asking the
 * same question either way: will you carry this.
 */
type SeatReq = {
  id: string;
  status: string;
  seats: number;
  segmentKm: number;
  priceNgn: number;
  luggage: string | null;
  /**
   * address is there from the start; description, the pin and mapsUrl
   * arrive only once the seat is paid for (server-side gate).
   */
  board:  { city: string | null; address?: string | null; description?: string | null; mapsUrl?: string | null };
  alight: { city: string | null; address?: string | null; description?: string | null; mapsUrl?: string | null };
  deliveryId: string | null;
  paymentDueAt: string | null;
  driver: { name: string; rating: number | null; vehicleType?: string | null; vehiclePlate?: string | null };
};

const SEAT_COPY: Record<string, { label: string; tone: 'wait' | 'act' | 'done' | 'dead' }> = {
  requested:       { label: 'Waiting for the driver',      tone: 'wait' },
  accepted:        { label: 'Driver said yes, pay to hold', tone: 'act'  },
  pending_payment: { label: 'Driver said yes, pay to hold', tone: 'act'  },
  booked:          { label: 'Seat held',                    tone: 'done' },
  boarded:         { label: 'On board',                     tone: 'done' },
  dropped:         { label: 'Completed',                    tone: 'done' },
  cancelled:       { label: 'Cancelled',                    tone: 'dead' },
  no_show:         { label: 'Marked as no-show',            tone: 'dead' },
};

export default function ParcelRequestsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [rows, setRows]       = useState<Req[]>([]);
  const [seats, setSeats]     = useState<SeatReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, mine] = await Promise.all([
        deliveriesApi.myParcelRequests().catch(() => []),
        travelBuddyApi.mySeatBookings().catch(() => []),
      ]);
      setRows((list ?? []) as Req[]);
      setSeats((mine ?? []) as SeatReq[]);
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

  /*
   * Paying for a seat mints the delivery the fare is charged against, then
   * hands off to the ordinary payment screen. The server refuses unless the
   * driver has accepted, so this button only appears in that state.
   */
  const paySeat = async (b: SeatReq) => {
    setBusy(b.id);
    try {
      const res = await travelBuddyApi.paySeat(b.id);
      router.push({
        pathname: '/(customer)/payment/[deliveryId]',
        params: { deliveryId: res.deliveryId, price: String(Number(res.amountNgn ?? 0)) },
      } as any);
    } catch (e: any) {
      showDialog({ title: 'Could not start payment', message: e?.message ?? 'Try again in a moment.' });
    } finally {
      setBusy(null);
    }
  };

  const withdrawSeat = async (b: SeatReq) => {
    setBusy(b.id);
    try {
      await travelBuddyApi.cancelSeat(b.id);
      await load();
    } catch (e: any) {
      showDialog({ title: 'Could not withdraw', message: e?.message ?? 'Try again in a moment.' });
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
      <StatusBar barStyle={cs === 'dark' ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{tx('auto.parcelRequests.yourTripRequests', 'Your trip requests')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
      >
        {loading && rows.length === 0 && (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
        )}

        {!loading && rows.length === 0 && seats.length === 0 && (
          <View style={styles.empty}>
            <Package size={40} color={theme.textThird} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{tx('auto.parcelRequests.nothingAskedYet', 'Nothing asked yet')}</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              Find a driver already going your way under Travel Buddy and ask for
              a seat or for them to carry your parcel. Nothing is charged until they agree.
            </Text>
          </View>
        )}

        {seats.length > 0 && <Text style={[styles.section, { color: theme.textThird }]}>SEATS</Text>}
        {seats.map((b) => {
          const meta = SEAT_COPY[b.status] ?? { label: b.status, tone: 'wait' as const };
          const canPay = b.status === 'pending_payment' || b.status === 'accepted';
          const open   = b.status === 'requested';
          return (
            <View key={b.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              <Text style={[styles.state, { color: toneColor(meta.tone) }]}>{meta.label.toUpperCase()}</Text>
              <View style={styles.row}>
                <Armchair size={13} color={theme.primary} strokeWidth={2} />
                <Text style={[styles.addr, { color: theme.text }]} numberOfLines={1}>
                  {b.board?.city ?? 'Start'} to {b.alight?.city ?? 'End'}
                </Text>
              </View>
              <View style={styles.factRow}>
                <Text style={[styles.fact, { color: theme.textSecond }]}>
                  {b.seats} seat{b.seats === 1 ? '' : 's'} · {Number(b.segmentKm)} km · {b.driver?.name}
                  {b.driver?.rating ? ` · ★ ${Number(b.driver.rating).toFixed(1)}` : ''}
                </Text>
                <Text style={[styles.fare, { color: theme.text }]}>{naira(Number(b.priceNgn))}</Text>
              </View>
              {open && (
                <View style={styles.row}>
                  <Clock size={12} color={theme.textThird} strokeWidth={2} />
                  <Text style={[styles.fact, { color: theme.textThird }]}>{tx('auto.parcelRequests.nothingIsChargedWhileYou', 'Nothing is charged while you wait.')}</Text>
                </View>
              )}
              {canPay && (
                <Text style={[styles.fact, { color: theme.textSecond }]}>
                  The plate, the vehicle photo and the exact meeting spot are on the booking once paid. Pay to hold the seat.
                </Text>
              )}
              {/* Paid: the exact spot the driver picked, in their words, and
                  a link that opens Google Maps with the route to it (founder
                  2026-09-06). Same again for where they get off. */}
              {(b.status === 'booked' || b.status === 'boarded') && !!b.board?.address && (
                <View style={[styles.spot, { borderColor: theme.border, backgroundColor: theme.surfaceSecond }]}>
                  <Text style={[styles.spotLabel, { color: theme.textThird }]}>WHERE TO MEET</Text>
                  <Text style={[styles.spotAddr, { color: theme.text }]}>{b.board.address}</Text>
                  {!!b.board.description && (
                    <Text style={[styles.spotNote, { color: theme.textSecond }]}>{b.driver?.name?.split(' ')[0] ?? 'The driver'} says: {b.board.description}</Text>
                  )}
                  {!!b.board.mapsUrl && (
                    <Pressable onPress={() => Linking.openURL(b.board.mapsUrl!).catch(() => {})} style={styles.mapsLink}>
                      <Navigation size={13} color={theme.primary} strokeWidth={2} />
                      <Text style={[styles.mapsLinkTxt, { color: theme.primary }]}>{tx('auto.parcelRequests.openInGoogleMaps', 'Open in Google Maps')}</Text>
                    </Pressable>
                  )}
                  {!!b.alight?.address && (
                    <>
                      <Text style={[styles.spotLabel, { color: theme.textThird, marginTop: 10 }]}>WHERE YOU GET OFF</Text>
                      <Text style={[styles.spotAddr, { color: theme.text }]}>{b.alight.address}</Text>
                      {!!b.alight.mapsUrl && (
                        <Pressable onPress={() => Linking.openURL(b.alight.mapsUrl!).catch(() => {})} style={styles.mapsLink}>
                          <Navigation size={13} color={theme.primary} strokeWidth={2} />
                          <Text style={[styles.mapsLinkTxt, { color: theme.primary }]}>{tx('auto.parcelRequests.openInGoogleMaps', 'Open in Google Maps')}</Text>
                        </Pressable>
                      )}
                    </>
                  )}
                </View>
              )}
              <View style={styles.actions}>
                {open && (
                  <Pressable disabled={busy === b.id} onPress={() => withdrawSeat(b)} style={[styles.ghostBtn, { borderColor: theme.border }]}>
                    <Text style={[styles.ghostTxt, { color: theme.textSecond }]}>{tx('auto.parcelRequests.withdraw', 'Withdraw')}</Text>
                  </Pressable>
                )}
                {canPay && (
                  <Pressable disabled={busy === b.id} onPress={() => paySeat(b)} style={[styles.primaryBtn, { backgroundColor: theme.primary }]}>
                    {busy === b.id
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.primaryTxt}>Pay {naira(Number(b.priceNgn))}</Text>}
                  </Pressable>
                )}
                {b.deliveryId && (b.status === 'booked' || b.status === 'boarded') && (
                  <Pressable onPress={() => router.push({ pathname: '/(customer)/trip/[id]', params: { id: b.deliveryId } } as any)} style={[styles.ghostBtn, { borderColor: theme.border }]}>
                    <Text style={[styles.ghostTxt, { color: theme.textSecond }]}>{tx('auto.parcelRequests.track', 'Track')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}

        {rows.length > 0 && seats.length > 0 && <Text style={[styles.section, { color: theme.textThird }]}>PARCELS</Text>}
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
                    <Text style={[styles.ghostTxt, { color: theme.textSecond }]}>{tx('auto.parcelRequests.withdraw', 'Withdraw')}</Text>
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
                      : <Text style={styles.primaryTxt}>{tx('auto.parcelRequests.acceptAndPay', 'Accept and pay')}</Text>}
                  </Pressable>
                )}
                {r.status === 'accepted' && r.deliveryId && (
                  <Pressable onPress={() => payFor(r)} style={[styles.primaryBtn, { backgroundColor: theme.primary }]}>
                    <Text style={styles.primaryTxt}>{tx('auto.parcelRequests.payNow', 'Pay now')}</Text>
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
  // The paid seat's meeting spot and its Maps link (2026-09-06).
  spot:        { borderWidth: 1, borderRadius: Radius.md, padding: 10, marginTop: 8, gap: 3 },
  spotLabel:   { fontSize: 10.5, fontWeight: FontWeight.bold as any, letterSpacing: 0.8 },
  spotAddr:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  spotNote:    { fontSize: 12.5, lineHeight: 17 },
  mapsLink:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  mapsLinkTxt: { fontSize: 13, fontWeight: FontWeight.semibold as any },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },

  section: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginTop: 2, marginBottom: -6 },
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
