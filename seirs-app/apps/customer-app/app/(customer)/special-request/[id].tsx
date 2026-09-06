/**
 * One special request, and the quote when it arrives.
 *
 * THE ITEMISED BREAKDOWN IS THE POINT. The founder was explicit at design
 * time: a bare large number with no breakdown reads as a shakedown. On a
 * transformer the difference between four hundred thousand naira and
 * eight hundred thousand is four extra men and a permit, and a sender who
 * cannot see that has no way to tell a price from a demand. So every line
 * shows what it is, how many, and at what rate.
 *
 * WHAT THIS SCREEN CANNOT SHOW. The server serves senders from a
 * different route than staff, so our cost basis, the margin on the quote,
 * the escalation trail and the call log have no path to this file at all.
 * That is deliberate and it is not a branch: two of tonight's data leaks
 * were one endpoint serving two audiences with the redaction living
 * somewhere else.
 *
 * EXPIRY IS SHOWN, NOT ENFORCED HERE. The screen counts down because a
 * sender deserves to know, but accepting sends no quote id and the server
 * refuses a stale one, so a phone left open on this screen overnight
 * cannot bind us to yesterday's diesel price.
 */
import { useCallback, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { specialRequestsApi } from '@/services/api';
import { showDialog } from '@/components/SeirsDialog';
import { naira } from '@/utils/money';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

/**
 * What each status means TO THE SENDER, in their words.
 *
 * The enum is the server's vocabulary and it is not the sender's: nobody
 * waiting on a quote wants to read "in_review". Each line says what is
 * happening and, where there is one, what happens next.
 */
const SAY = (): Record<string, { title: string; body: string; tone: 'wait' | 'act' | 'done' | 'stop' }> => ({
  submitted: { tone: 'wait', title: tr('auto.specialRequestDetail.weHaveIt', 'We have it'),
    body: tr('auto.specialRequestDetail.someoneWillReadThisAnd', 'Someone will read this and call you. Nothing is charged yet.') },
  in_review: { tone: 'wait', title: tr('auto.specialRequestDetail.beingWorkedOut', 'Being worked out'),
    body: tr('auto.specialRequestDetail.weArePricingTheVehicle', 'We are pricing the vehicle, the hands and the handling. We may ring you with questions.') },
  quoted:    { tone: 'act',  title: tr('auto.specialRequestDetail.yourQuoteIsReady', 'Your quote is ready'),
    body: tr('auto.specialRequestDetail.everyLineIsBelowAccept', 'Every line is below. Accept it and we will assign a named driver and vehicle before you pay.') },
  accepted:  { tone: 'done', title: tr('auto.specialRequestDetail.accepted', 'Accepted'),
    body: tr('auto.specialRequestDetail.weAreAssigningTheDriver', 'We are assigning the driver and vehicle now.') },
  assigned:  { tone: 'done', title: tr('auto.specialRequestDetail.driverAssigned', 'Driver assigned'),
    body: tr('auto.specialRequestDetail.yourDriverAndVehicleAre', 'Your driver and vehicle are set. Payment comes next.') },
  paid:      { tone: 'done', title: tr('auto.specialRequestDetail.paid', 'Paid'),
    body: tr('auto.specialRequestDetail.thisIsNowANormal', 'This is now a normal booking and you can track it like any other.') },
  converted: { tone: 'done', title: tr('auto.specialRequestDetail.onItsWay', 'On its way'),
    body: tr('auto.specialRequestDetail.trackItFromYourBookings', 'Track it from your bookings.') },
  declined:  { tone: 'stop', title: tr('auto.specialRequestDetail.weCannotTakeThisOne', 'We cannot take this one'),
    body: tr('auto.specialRequestDetail.theReasonIsBelowIf', 'The reason is below. If something changes, send it again.') },
  escalated: { tone: 'wait', title: tr('auto.specialRequestDetail.withASeniorColleague', 'With a senior colleague'),
    body: tr('auto.specialRequestDetail.someoneMoreSeniorIsLooking', 'Someone more senior is looking at it. This usually means we want to get it right rather than quickly.') },
  expired:   { tone: 'stop', title: tr('auto.specialRequestDetail.theQuoteRanOut', 'The quote ran out'),
    body: tr('auto.specialRequestDetail.dieselAndHaulageMoveSo', 'Diesel and haulage move, so quotes do not last forever. Ask us for a fresh one.') },
  withdrawn: { tone: 'stop', title: tr('auto.specialRequestDetail.youCancelledThis', 'You cancelled this'),
    body: tr('auto.specialRequestDetail.nothingWasCharged', 'Nothing was charged.') },
});

const TONE: Record<string, string> = {
  wait: '#D97706', act: '#16A34A', done: '#0F2B4C', stop: '#DC2626',
};

export default function SpecialRequestDetail() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [row,        setRow]        = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy,       setBusy]       = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setRow(await specialRequestsApi.detail(String(id)));
    } catch { /* keep whatever is on screen rather than blanking it */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const status = String(row?.status ?? 'submitted');
  const say    = SAY()[status] ?? SAY().submitted;
  const quote  = row?.quote ?? null;
  const lines: any[] = Array.isArray(quote?.lines) ? quote.lines : [];

  /** Hours left on the quote, or null when there is no live quote. */
  const hoursLeft = (() => {
    if (!quote?.expiresAt) return null;
    const ms = new Date(quote.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms)) return null;
    return Math.floor(ms / 3600000);
  })();

  const accept = async () => {
    showDialog({
      title: tr('auto.specialRequestDetail.acceptThisQuote', 'Accept this quote?'),
      message: `${naira(Number(quote?.totalNgn ?? 0))} in total. We will assign a named driver and vehicle, then take payment. Nothing is charged by accepting.`,
      actions: [
        { text: tr('auto.specialRequestDetail.accept', 'Accept'), onPress: async () => {
            setBusy(true);
            try {
              const res = await specialRequestsApi.accept(String(id));
              router.replace({
                pathname: '/(customer)/payment/[deliveryId]',
                params: { deliveryId: res.deliveryId, price: String(res.priceNgn) },
              } as any);
            } catch (e: any) {
              showDialog({ title: tr('auto.parcelRequests.couldNotAccept', 'Could not accept'), message: e?.message ?? 'The quote may have expired. Pull to refresh.' });
            } finally { setBusy(false); }
          } },
        { text: tr('auto.specialRequestDetail.notYet', 'Not yet'), style: 'cancel' },
      ],
    });
  };

  const withdraw = () => {
    showDialog({
      title: tr('auto.specialRequestDetail.cancelThisRequest', 'Cancel this request?'),
      message: tr('auto.specialRequestDetail.nothingHasBeenChargedSo', 'Nothing has been charged, so this costs you nothing. You can always send it again.'),
      actions: [
        { text: tr('auto.specialRequestDetail.cancelIt', 'Cancel it'), style: 'destructive', onPress: async () => {
            try { await specialRequestsApi.withdraw(String(id)); await load(); }
            catch (e: any) { showDialog({ title: tr('auto.specialRequestDetail.couldNotCancel', 'Could not cancel'), message: e?.message ?? 'Try again.' }); }
          } },
        { text: tr('auto.specialRequestDetail.keepIt', 'Keep it'), style: 'cancel' },
      ],
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.id.yourQuote', 'Your quote')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}
        >
          <View style={[styles.statusCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <View style={[styles.dot, { backgroundColor: TONE[say.tone] }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: theme.text }]}>{say.title}</Text>
              <Text style={[styles.statusBody, { color: theme.textSecond }]}>{say.body}</Text>
            </View>
          </View>

          {status === 'declined' && !!row?.declineReason && (
            <View style={[styles.reason, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Text style={[styles.reasonText, { color: '#991B1B' }]}>{row.declineReason}</Text>
            </View>
          )}

          {!!quote && lines.length > 0 && (
            <View style={[styles.quoteCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <Text style={[styles.quoteHead, { color: theme.text }]}>{tx('auto.id.whatItIsMadeUp', 'What it is made up of')}</Text>

              {lines.map((l, i) => (
                <View key={`${l.kind}-${i}`} style={[styles.line, i > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lineLabel, { color: theme.text }]}>{l.label}</Text>
                    {Number(l.qty) > 1 && (
                      <Text style={[styles.lineQty, { color: theme.textThird }]}>
                        {l.qty} x {naira(Number(l.unitNgn ?? 0))}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.lineAmt, { color: theme.text }]}>{naira(Number(l.amountNgn ?? 0))}</Text>
                </View>
              ))}

              <View style={[styles.total, { borderTopColor: theme.border }]}>
                <Text style={[styles.totalLabel, { color: theme.text }]}>{tx('auto.id.total', 'Total')}</Text>
                <Text style={[styles.totalAmt, { color: theme.text }]}>{naira(Number(quote.totalNgn ?? 0))}</Text>
              </View>

              {hoursLeft !== null && (
                <Text style={[styles.expiry, { color: hoursLeft <= 6 ? '#DC2626' : theme.textThird }]}>
                  {hoursLeft > 0
                    ? `This price holds for another ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}. Diesel and haulage move, so we cannot hold it longer.`
                    : 'This quote has run out. Pull down to refresh and ask us for a fresh one.'}
                </Text>
              )}
            </View>
          )}

          {status === 'quoted' && !!quote && (
            <Pressable
              onPress={accept}
              disabled={busy || (hoursLeft !== null && hoursLeft <= 0)}
              style={[styles.accept, { backgroundColor: busy || (hoursLeft !== null && hoursLeft <= 0) ? theme.border : theme.primary }]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.acceptText}>{tx('auto.id.acceptAndContinue', 'Accept and continue')}</Text>}
            </Pressable>
          )}

          {['submitted', 'in_review', 'quoted', 'escalated'].includes(status) && (
            <Pressable onPress={withdraw} style={styles.withdraw}>
              <Text style={[styles.withdrawText, { color: '#DC2626' }]}>{tx('auto.id.cancelThisRequest', 'Cancel this request')}</Text>
            </Pressable>
          )}

          <View style={[styles.recap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Text style={[styles.recapHead, { color: theme.textSecond }]}>{tr('auto.specialRequestDetail.whatYouSentUs', 'WHAT YOU SENT US')}</Text>
            <Text style={[styles.recapBody, { color: theme.text }]}>{row?.description ?? ''}</Text>
            <Text style={[styles.recapMeta, { color: theme.textThird }]}>
              {row?.pickupAddress} to {row?.dropoffAddress}
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  content:     { padding: Spacing.md, gap: Spacing.md, paddingBottom: 48 },

  statusCard:  { flexDirection: 'row', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
  dot:         { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  statusTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  statusBody:  { fontSize: FontSize.sm, lineHeight: 19, marginTop: 3 },

  reason:      { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  reasonText:  { fontSize: FontSize.sm, lineHeight: 19 },

  quoteCard:   { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 2 },
  quoteHead:   { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.sm },
  line:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: 10 },
  lineLabel:   { fontSize: FontSize.sm, fontWeight: '600' },
  lineQty:     { fontSize: FontSize.xs, marginTop: 2 },
  lineAmt:     { fontSize: FontSize.sm, fontWeight: '600', fontVariant: ['tabular-nums'] },
  total:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
                 borderTopWidth: 1, paddingTop: 12, marginTop: 6 },
  totalLabel:  { fontSize: FontSize.base, fontWeight: '700' },
  totalAmt:    { fontSize: FontSize.lg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  expiry:      { fontSize: FontSize.xs, lineHeight: 17, marginTop: 10 },

  accept:      { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  acceptText:  { color: '#fff', fontSize: FontSize.base, fontWeight: '700' },
  withdraw:    { alignItems: 'center', paddingVertical: 12 },
  withdrawText:{ fontSize: FontSize.sm, fontWeight: '600' },

  recap:       { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 6 },
  recapHead:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  recapBody:   { fontSize: FontSize.sm, lineHeight: 19 },
  recapMeta:   { fontSize: FontSize.xs },
});
