/**
 * Who wants to send a parcel on the trips you declared.
 *
 * Built 2026-08-31. The seat version of this screen shipped this morning;
 * this is the parcel one, and it carries the thing seats never had.
 *
 * A request holds no space and charges nobody until you accept, so
 * declining costs the sender nothing and there is no refund to chase.
 * That is why Decline carries no ceremony here either.
 *
 * The third button is the point. A sender asking you to reach somewhere
 * you do not pass is not a job you have to refuse: propose the place you
 * DO pass. Moving the drop moves the distance, so the server re-quotes
 * and the sender agrees to the new number, not the old one. Neither of
 * you is bound to anything until they do.
 */
/*
 * ONE inbox for seats and parcels (2026-09-05).
 *
 * Seat requests and parcel requests lived on two screens, so a rider who
 * declared one trip had to check two lists to see who wanted to ride on it.
 * The founder, looking at the empty seat inbox: "shouldn't the driver see
 * the seat request here on this screen as well as the parcel, to be able
 * to accept or reject". Same trip, same question, same screen.
 */
import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Package, MapPin, Navigation, Weight, Users, Luggage } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi, deliveriesApi, mapsApi } from '@/services/api';
import { naira } from '@/utils/money';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

type Req = {
  id: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  weightKg: number | string;
  packageDescription: string | null;
  senderInstructions: string | null;
  quotedNgn: number | string | null;
  quotedKm: number | string | null;
  counterDropAddress: string | null;
  counterQuotedNgn: number | string | null;
};

type SeatReq = {
  id: string;
  seats: number;
  luggage: string | null;
  note: string | null;
  boardName: string | null;
  alightName: string | null;
  fareNgn: number | null;
  earnNgn: number | null;
  passenger: string | null;
};

export default function ParcelRequestsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [trips, setTrips]     = useState<any[]>([]);
  const [reqs, setReqs]       = useState<Record<string, Req[]>>({});
  // Seat requests, keyed by trip like the parcels above them.
  const [seatReqs, setSeatReqs] = useState<Record<string, SeatReq[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);

  // Counter-offer sheet. Held here rather than per-card so only one can
  // ever be open, which is also the only one the rider can be thinking about.
  const [countering, setCountering] = useState<Req | null>(null);
  const [counterAddr, setCounterAddr] = useState('');
  const [counterNote, setCounterNote] = useState('');
  const [geocoding, setGeocoding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mine = await driversApi.myInterstateTrips().catch(() => []);
      // Any trip that takes either kind of request belongs on this screen.
      const active = (mine ?? []).filter((t: any) => t?.acceptsPackages || t?.acceptsPassengers);
      setTrips(active);
      const pairs = await Promise.all(active.map(async (t: any) => {
        const rows = t?.acceptsPackages
          ? await deliveriesApi.parcelRequestInbox(t.id).catch(() => [])
          : [];
        return [t.id, (rows ?? []) as Req[]] as const;
      }));
      setReqs(Object.fromEntries(pairs));

      const seatPairs = await Promise.all(active.map(async (t: any) => {
        if (!t?.acceptsPassengers) return [t.id, [] as SeatReq[]] as const;
        const bookings = await driversApi.tripBookings(t.id).catch(() => []);
        const open = (bookings ?? [])
          .filter((b: any) => String(b?.status) === 'requested')
          .map((b: any) => ({
            id:         b.id,
            seats:      Number(b.seats ?? 1),
            luggage:    b.luggage ?? null,
            note:       b.passengerNote ?? b.note ?? null,
            boardName:  b.board?.city ?? null,
            alightName: b.alight?.city ?? null,
            fareNgn:    b.priceNgn != null ? Number(b.priceNgn) : null,
            earnNgn:    b.driverEarningsNgn != null ? Number(b.driverEarningsNgn) : null,
            passenger:  b.passenger?.name ?? b.passengerName ?? null,
          }) as SeatReq);
        return [t.id, open] as const;
      }));
      setSeatReqs(Object.fromEntries(seatPairs));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const answer = async (r: Req, verb: 'accept' | 'decline') => {
    setBusy(r.id);
    try {
      if (verb === 'accept') {
        await deliveriesApi.acceptParcelRequest(r.id);
        alertDialog(
          'Accepted',
          'The sender pays now. It shows up in your jobs once the payment lands.',
        );
      } else {
        await deliveriesApi.declineParcelRequest(r.id);
      }
      await load();
    } catch (e: any) {
      alertDialog('Could not do that', e?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  const answerSeat = async (r: SeatReq, yes: boolean) => {
    setBusy(r.id);
    try {
      if (yes) await driversApi.acceptSeat(r.id);
      else     await driversApi.declineSeat(r.id);
      if (yes) {
        alertDialog('Accepted', 'The passenger pays now to hold the seat. It shows up in your jobs once the payment lands.');
      }
      await load();
    } catch (e: any) {
      alertDialog(yes ? 'Could not accept' : 'Could not decline', e?.message ?? 'Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  const sendCounter = async () => {
    if (!countering) return;
    const addr = counterAddr.trim();
    if (addr.length < 4) {
      alertDialog('Where instead?', 'Name the drop-off point you can actually reach.');
      return;
    }
    setGeocoding(true);
    try {
      /**
       * The counter needs COORDINATES, because the server re-prices on
       * distance. A typed place with no point on the map cannot be
       * quoted, so it is resolved here and refused plainly if it will
       * not resolve, rather than sending the sender a price built on a
       * guess.
       */
      const g = await mapsApi.geocode({ address: addr });
      const loc = g?.results?.[0]?.geometry?.location;
      if (!loc?.lat || !loc?.lng) {
        alertDialog('Could not find that place', 'Try a nearer landmark or a fuller address.');
        return;
      }
      await deliveriesApi.counterParcelRequest(countering.id, {
        dropAddress: addr,
        dropLat: Number(loc.lat),
        dropLng: Number(loc.lng),
        note: counterNote.trim() || undefined,
      });
      setCountering(null);
      setCounterAddr('');
      setCounterNote('');
      alertDialog(
        'Sent',
        'The sender sees your drop-off point and its price. Nothing is charged unless they agree.',
      );
      await load();
    } catch (e: any) {
      alertDialog('Could not send that', e?.message ?? 'Try again in a moment.');
    } finally {
      setGeocoding(false);
    }
  };

  const total =
    Object.values(reqs).reduce((n, list) => n + list.length, 0) +
    Object.values(seatReqs).reduce((n, list) => n + list.length, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{tx('auto.parcelRequests.requests', 'Requests')}</Text>
          <Text style={[styles.headerSub, { color: theme.textSecond }]}>
            {total === 0 ? 'Nothing waiting' : `${total} waiting on you`}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
      >
        {loading && total === 0 && (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
        )}

        {!loading && trips.length === 0 && (
          <View style={styles.empty}>
            <Package size={40} color={theme.textThird} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{tx('auto.parcelRequests.noTripsTakingRequests', 'No trips taking requests')}</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              {tr('auto.parcelRequests.declareAnIntercityTripWith', 'Declare an intercity trip with seats or packages on, and people going your way can ask to ride or to have theirs carried.')}
            </Text>
          </View>
        )}

        {!loading && trips.length > 0 && total === 0 && (
          <View style={styles.empty}>
            <Package size={40} color={theme.textThird} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{tx('auto.parcelRequests.nobodyHasAskedYet', 'Nobody has asked yet')}</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              {tr('auto.parcelRequests.seatAndParcelRequestsShow', 'Seat and parcel requests show up here. Nothing is charged until you accept, so you can say no without costing anybody money.')}
            </Text>
          </View>
        )}

        {trips.map((t) => {
          const list  = reqs[t.id] ?? [];
          const seats = seatReqs[t.id] ?? [];
          if (!list.length && !seats.length) return null;
          return (
            <View key={t.id} style={{ gap: Spacing.sm }}>
              <Text style={[styles.tripLabel, { color: theme.textSecond }]}>
                {String(t.fromCity).toUpperCase()} TO {String(t.toCity).toUpperCase()}
              </Text>

              {seats.map((r) => (
                <View key={r.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.row}>
                    <Users size={14} color={theme.primary} strokeWidth={2} />
                    <Text style={[styles.addr, { color: theme.text, fontWeight: '600' }]}>
                      {r.seats} seat{r.seats === 1 ? '' : 's'}{r.passenger ? ` for ${r.passenger}` : ''}
                    </Text>
                  </View>
                  {(r.boardName || r.alightName) && (
                    <View style={styles.row}>
                      <MapPin size={13} color={theme.textThird} strokeWidth={2} />
                      <Text style={[styles.fact, { color: theme.textSecond }]} numberOfLines={2}>
                        {r.boardName ?? 'your start'} to {r.alightName ?? 'your destination'}
                      </Text>
                    </View>
                  )}
                  {!!r.luggage && r.luggage !== 'none' && (
                    <View style={styles.row}>
                      <Luggage size={13} color={theme.textThird} strokeWidth={2} />
                      <Text style={[styles.fact, { color: theme.textSecond }]}>{r.luggage} luggage</Text>
                    </View>
                  )}
                  {!!r.note && (
                    <View style={[styles.instr, { backgroundColor: theme.surfaceSecond }]}>
                      <Text style={[styles.instrTxt, { color: theme.text }]}>{r.note}</Text>
                    </View>
                  )}
                  <View style={styles.factRow}>
                    <Text style={[styles.fact, { color: theme.textSecond }]}>
                      {r.earnNgn != null ? `You earn ${naira(r.earnNgn)}` : ''}
                    </Text>
                    {r.fareNgn != null && (
                      <Text style={[styles.fare, { color: theme.primary }]}>{naira(r.fareNgn)}</Text>
                    )}
                  </View>
                  <View style={styles.actions}>
                    <Pressable disabled={busy === r.id} onPress={() => answerSeat(r, false)} style={[styles.declineBtn, { borderColor: theme.border }]}>
                      <Text style={[styles.declineTxt, { color: theme.textSecond }]}>{tx('auto.parcelRequests.decline', 'Decline')}</Text>
                    </Pressable>
                    <Pressable disabled={busy === r.id} onPress={() => answerSeat(r, true)} style={[styles.acceptBtn, { backgroundColor: theme.primary }]}>
                      {busy === r.id
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.acceptTxt}>{tx('auto.parcelRequests.accept', 'Accept')}</Text>}
                    </Pressable>
                  </View>
                </View>
              ))}

              {list.map((r) => {
                const countered = r.status === 'countered';
                return (
                  <View key={r.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={styles.row}>
                      <MapPin size={13} color="#16A34A" strokeWidth={2} />
                      <Text style={[styles.addr, { color: theme.text }]} numberOfLines={1}>{r.pickupAddress}</Text>
                    </View>
                    <View style={styles.row}>
                      <Navigation size={13} color="#EF4444" strokeWidth={2} />
                      <Text style={[styles.addr, { color: theme.text }]} numberOfLines={1}>{r.dropoffAddress}</Text>
                    </View>

                    <View style={styles.factRow}>
                      <View style={styles.row}>
                        <Weight size={13} color={theme.textThird} strokeWidth={2} />
                        <Text style={[styles.fact, { color: theme.textSecond }]}>
                          {Number(r.weightKg ?? 0)} kg
                          {r.quotedKm != null ? ` · ${Number(r.quotedKm)} km` : ''}
                        </Text>
                      </View>
                      {r.quotedNgn != null && (
                        <Text style={[styles.fare, { color: theme.primary }]}>{naira(Number(r.quotedNgn))}</Text>
                      )}
                    </View>

                    {!!r.packageDescription && (
                      <Text style={[styles.fact, { color: theme.textSecond }]} numberOfLines={2}>
                        {r.packageDescription}
                      </Text>
                    )}

                    {/* What the sender needs you to know BEFORE you agree.
                        Instructions arriving after acceptance are how a rider
                        ends up bound to something they never would have taken. */}
                    {!!r.senderInstructions && (
                      <View style={[styles.instr, { backgroundColor: theme.surfaceSecond }]}>
                        <Text style={[styles.instrTxt, { color: theme.text }]}>
                          {r.senderInstructions}
                        </Text>
                      </View>
                    )}

                    {countered ? (
                      <View style={[styles.instr, { backgroundColor: '#B4530918' }]}>
                        <Text style={[styles.instrTxt, { color: '#B45309' }]}>
                          You offered {r.counterDropAddress}
                          {r.counterQuotedNgn != null ? ` at ${naira(Number(r.counterQuotedNgn))}` : ''}{tr('auto.parcelRequests.waitingForTheSenderTo', '. Waiting for the sender to answer.')}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.actions}>
                        <Pressable
                          disabled={busy === r.id}
                          onPress={() => answer(r, 'decline')}
                          style={[styles.declineBtn, { borderColor: theme.border }]}
                        >
                          <Text style={[styles.declineTxt, { color: theme.textSecond }]}>{tx('auto.parcelRequests.decline', 'Decline')}</Text>
                        </Pressable>
                        <Pressable
                          disabled={busy === r.id}
                          onPress={() => { setCountering(r); setCounterAddr(''); setCounterNote(''); }}
                          style={[styles.counterBtn, { borderColor: theme.primary }]}
                        >
                          <Text style={[styles.counterTxt, { color: theme.primary }]}>{tx('auto.parcelRequests.offerAnotherSpot', 'Offer another spot')}</Text>
                        </Pressable>
                        <Pressable
                          disabled={busy === r.id}
                          onPress={() => answer(r, 'accept')}
                          style={[styles.acceptBtn, { backgroundColor: theme.primary }]}
                        >
                          {busy === r.id
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={styles.acceptTxt}>{tx('auto.parcelRequests.accept', 'Accept')}</Text>}
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* Counter-offer */}
      <Modal visible={!!countering} transparent animationType="slide" onRequestClose={() => setCountering(null)}>
        <KeyboardAvoidingView
          style={styles.modalWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>{tx('auto.parcelRequests.offerAnotherDropOff', 'Offer another drop-off')}</Text>
            <Text style={[styles.sheetSub, { color: theme.textSecond }]}>
              {tr('auto.parcelRequests.nameAPlaceOnYour', 'Name a place on your route you can actually reach. The sender sees it with a fresh price and can accept or say no. Nothing is charged either way.')}
            </Text>

            <TextInput
              value={counterAddr}
              onChangeText={setCounterAddr}
              placeholder={tx('auto.parcelRequests.whereYouCanDropIt', 'Where you can drop it, e.g. Challenge Park, Ibadan')}
              placeholderTextColor={theme.textThird}
              style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
            />
            <TextInput
              value={counterNote}
              onChangeText={setCounterNote}
              placeholder={tx('auto.parcelRequests.whyInYourWordsOptional', 'Why, in your words (optional)')}
              placeholderTextColor={theme.textThird}
              multiline
              style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background, minHeight: 64, textAlignVertical: 'top' }]}
            />

            <View style={styles.sheetActions}>
              <Pressable onPress={() => setCountering(null)} style={[styles.declineBtn, { borderColor: theme.border, flex: 1 }]}>
                <Text style={[styles.declineTxt, { color: theme.textSecond }]}>{tx('auto.parcelRequests.cancel', 'Cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={sendCounter}
                disabled={geocoding}
                style={[styles.acceptBtn, { backgroundColor: geocoding ? theme.border : theme.primary, flex: 1 }]}
              >
                {geocoding
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.acceptTxt}>{tx('auto.parcelRequests.sendOffer', 'Send offer')}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  headerSub:   { fontSize: FontSize.xs, marginTop: 2 },

  tripLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.6 },

  card:    { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 7 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addr:    { flex: 1, fontSize: FontSize.sm },
  factRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fact:    { fontSize: FontSize.xs, lineHeight: 17 },
  fare:    { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },

  instr:    { borderRadius: Radius.md, padding: 9 },
  instrTxt: { fontSize: FontSize.xs, lineHeight: 17 },

  actions:    { flexDirection: 'row', gap: 8, marginTop: 4 },
  declineBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  declineTxt: { fontSize: FontSize.sm, fontWeight: '600' },
  counterBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  counterTxt: { fontSize: FontSize.sm, fontWeight: '700' },
  acceptBtn:  { paddingVertical: 10, paddingHorizontal: 20, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  acceptTxt:  { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold as any },
  emptySub:   { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing.lg },

  modalWrap:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:        { padding: Spacing.lg, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, gap: Spacing.sm },
  sheetTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  sheetSub:     { fontSize: FontSize.xs, lineHeight: 18 },
  input:        { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: FontSize.base },
  sheetActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
