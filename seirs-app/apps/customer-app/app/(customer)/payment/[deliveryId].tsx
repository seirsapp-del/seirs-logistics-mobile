import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Linking, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { paymentsApi, deliveriesApi, loyaltyApi } from '@/services/api';
import { naira } from '@/utils/money';
import { VEHICLE_LABEL } from '@seirs/shared/models/vehicles';

// Spec V8 §"Confirmed Decisions": COD removed. Everything routes through
// Flutterwave's hosted checkout (card, bank transfer, USSD live there;
// asking the customer to pick a method here made them choose twice,
// founder 2026-08-13).
//
// Redesigned 2026-08-22 (founder: "totally different set up when
// compared with the business app"): the screen now speaks the same card
// language as the Review step, shows WHAT is being paid for, rounds to
// whole naira (three different numbers for one trip was the bug), and
// the protection copy promises only what the failed-delivery policy
// actually does.


/*
 * What points can be spent on, here, at the moment of paying.
 *
 * Redeeming has always worked, but only from the Rewards screen and only
 * on a booking that already exists, so the real sequence was: book, leave
 * the flow, open Rewards, find this delivery in a list, redeem, come back,
 * pay. Nobody was ever going to do that, which is why the founder asked
 * (2026-09-05) whether points could be used at checkout. They could not.
 *
 * Only the two redemptions the server will actually honour. Priority and
 * parcel cover are refused by loyalty.service with the points untouched,
 * because neither is a real product yet, so offering them here would be
 * a button whose only outcome is an error.
 *
 * The saving for a free delivery is deliberately not computed here: the
 * server caps it with loyalty_free_delivery_max_ngn and refuses outright
 * above the cap, so a figure guessed client-side would be a promise this
 * screen cannot keep.
 */
const POINT_REWARDS = [
  { type: 'discount_500' as const,  cost: 500,  label: '₦500 off',      note: 'Comes off this booking.' },
  { type: 'free_delivery' as const, cost: 1000, label: 'Free delivery', note: 'Covers this booking up to the reward cap.' },
];

export default function PaymentScreen() {
  const { deliveryId, price, trackingCode } = useLocalSearchParams<{
    deliveryId: string;
    price:      string;
    trackingCode: string;
  }>();
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];

  // The booking is the source of truth for the number on this screen.
  // The route param paints instantly; the fetched price replaces it so
  // the amount here always equals the amount on the trip card. The
  // charge itself was always priced server-side.
  const [delivery, setDelivery] = useState<any>(null);
  const [loadErr,  setLoadErr]  = useState(false);
  useEffect(() => {
    if (!deliveryId) return;
    deliveriesApi.get(String(deliveryId))
      .then((d: any) => setDelivery(d))
      .catch(() => setLoadErr(true));
  }, [deliveryId]);

  // Shown to the kobo: this is the figure Flutterwave will charge, and a
  // pay button that says a different number than the receipt is a support
  // ticket waiting to happen (founder 2026-08-24).
  const displayPrice = Number(delivery?.price ?? price ?? 0);
  const alreadyPaid  = !!delivery?.paymentHeldAt;
  const code         = delivery?.trackingCode ?? trackingCode;

  const [loading,    setLoading]    = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [error,      setError]      = useState('');
  const pendingTxRef = useRef<string | null>(null);

  // One-tap: the default saved card, tokenized on some earlier payment.
  // Nobody re-types 16 digits to finish an order (founder 2026-08-22).
  const [savedCard, setSavedCard] = useState<any | null>(null);
  useEffect(() => {
    paymentsApi.listSavedCards()
      .then((cards: any[]) => {
        if (!Array.isArray(cards) || cards.length === 0) return;
        setSavedCard(cards.find(c => c.isDefault) ?? cards[0]);
      })
      .catch(() => { /* no cards, hosted checkout only */ });
  }, []);

  /*
   * Points, and spending them without leaving this screen.
   *
   * The delivery is re-fetched after a redemption rather than the price
   * being adjusted locally: the server decides what a reward is worth, and
   * the number on the pay button has to be the number that gets charged.
   */
  const [points,     setPoints]     = useState<number | null>(null);
  const [redeeming,  setRedeeming]  = useState<string | null>(null);
  const [pointsMsg,  setPointsMsg]  = useState('');
  const [pointsErr,  setPointsErr]  = useState('');

  useEffect(() => {
    loyaltyApi.balance()
      .then((b: any) => setPoints(Number(b?.balance ?? 0)))
      .catch(() => { /* points are a bonus here, never a blocker on paying */ });
  }, []);

  // Rewards attach to a booking that has not been paid for or dispatched.
  // Anything else and the server refuses, so the card does not appear.
  const canUsePoints =
    !!delivery &&
    !delivery?.paymentHeldAt &&
    ['pending', 'assigned'].includes(String(delivery?.status ?? ''));

  const usePoints = async (type: 'discount_500' | 'free_delivery', cost: number) => {
    setPointsErr('');
    setRedeeming(type);
    try {
      await loyaltyApi.redeem(type, String(deliveryId));
      // Both numbers move together: the balance and the amount due.
      const [fresh, bal] = await Promise.all([
        deliveriesApi.get(String(deliveryId)).catch(() => null),
        loyaltyApi.balance().catch(() => null),
      ]);
      if (fresh) setDelivery(fresh);
      if (bal)   setPoints(Number((bal as any)?.balance ?? 0));
      setPointsMsg('Reward applied. ' + cost.toLocaleString() + ' points used.');
    } catch (e: any) {
      // The server's refusals are written for the customer ("your points
      // have not been touched"), so they are shown as they are.
      setPointsErr(e?.message ?? 'Could not apply that reward. Your points have not been touched.');
    } finally {
      setRedeeming(null);
    }
  };

  const handlePayWithSavedCard = async () => {
    if (!savedCard) return;
    setError('');
    setLoading(true);
    try {
      const res = await paymentsApi.payWithSavedCard(String(deliveryId), savedCard.id);
      if (res.success) {
        navigateToTracking();
        return;
      }
      // A declined token is a fallback, not a dead end: surface the
      // reason and leave the hosted checkout button right below.
      setError(res.error ?? 'Your saved card was declined. Try the full checkout below.');
    } catch (e: any) {
      setError(e?.message ?? 'Could not charge the saved card. Try the full checkout below.');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await paymentsApi.initiate(deliveryId, 'card', 'card');
      if (res.error) throw new Error(res.error);

      // Reaching Flutterwave but getting no checkout URL means the
      // payment never started. Say so instead of navigating to tracking,
      // which would show an unpaid delivery as though it were paid
      // (founder 2026-08-13).
      if (!res.authorizationUrl) {
        throw new Error(
          'Could not open the payment page. Your card has not been charged. Try again in a moment.',
        );
      }

      pendingTxRef.current = res.reference ?? null;

      // Watch for the app returning to foreground: auto-verify payment
      const sub = AppState.addEventListener('change', async (state) => {
        if (state === 'active' && pendingTxRef.current) {
          sub.remove();
          setVerifying(true);
          try {
            await paymentsApi.verify(pendingTxRef.current);
            pendingTxRef.current = null;
          } catch {
            // Payment may still be pending: navigation happens anyway
          } finally {
            setVerifying(false);
            navigateToTracking();
          }
        }
      });

      await Linking.openURL(res.authorizationUrl);
    } catch (e: any) {
      setError(e.message ?? 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const navigateToTracking = () => {
    router.replace({
      pathname: '/(customer)/track',
      params: { code },
    });
  };

  const summaryRows: Array<[string, string]> = delivery ? [
    ['Tracking', delivery.trackingCode ?? '-'],
    ['Pickup',   delivery.pickupAddress ?? '-'],
    ['Dropoff',  delivery.dropoffAddress ?? '-'],
    ...(delivery.distanceKm ? [['Distance', `${Number(delivery.distanceKm).toFixed(1)} km`] as [string, string]] : []),
    ...(delivery.vehicleType ? [['Vehicle', VEHICLE_LABEL[delivery.vehicleType] ?? delivery.vehicleType] as [string, string]] : []),
  ] : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.primary }]}>← Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Payment</Text>
        </View>

        {/* Amount card: one number, the same figure as the trip card.
            Shown to the kobo, like every other money line in the apps:
            the old whole-naira rule was reversed so the arithmetic
            reconciles wherever a customer checks it. */}
        <View style={[styles.amountCard, { backgroundColor: theme.primary }]}>
          <Text style={styles.amountLabel}>Amount to pay</Text>
          <Text style={styles.amount}>{naira(displayPrice)}</Text>
          <Text style={styles.amountNote}>Card processing is added at checkout.</Text>
        </View>

        {/* What this pays for: same card language as the Review step. */}
        {delivery && (
          <View style={[styles.sumCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            {/*
              Edit lives on the summary, not just the screen before it.

              Founder 2026-08-29: "after reaching the payment screen the
              user should be able to go back and edit their whole
              booking". Back only returned to wherever they came from,
              which for a Travel Buddy booking is the search results, so
              the details they were reading right here were the one thing
              they could not touch.

              On the summary card on purpose: this is the list of what
              they are about to pay for, so it is where a wrong line gets
              noticed.
            */}
            <View style={styles.sumHead}>
              <Text style={[styles.sumTitle, { color: theme.text, marginBottom: 0 }]}>Order Summary</Text>
              {!alreadyPaid && (
                <Pressable
                  onPress={() => router.push({ pathname: '/(customer)/edit-booking/[id]', params: { id: String(deliveryId) } } as any)}
                  hitSlop={8}
                >
                  <Text style={{ color: theme.primary, fontSize: FontSize.sm, fontWeight: '700' }}>Edit</Text>
                </Pressable>
              )}
            </View>
            {summaryRows.map(([lbl, val]) => (
              <View key={lbl} style={styles.sumRow}>
                <Text style={[styles.sumLabel, { color: theme.textThird }]}>{lbl}</Text>
                <Text style={[styles.sumValue, { color: theme.text }]} numberOfLines={2}>{val}</Text>
              </View>
            ))}
            <View style={[styles.sumRow, { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8, marginTop: 4 }]}>
              <Text style={[styles.sumLabel, { color: theme.textThird }]}>Total</Text>
              <Text style={[styles.sumTotal, { color: theme.text }]}>{naira(displayPrice)}</Text>
            </View>
          </View>
        )}

        {canUsePoints && points !== null && (
          <View style={[styles.sumCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.sumRow}>
              <Text style={[styles.sumTotal, { color: theme.text }]}>Use your points</Text>
              <Text style={[styles.sumValue, { color: theme.textSecond }]}>
                {points.toLocaleString()} points
              </Text>
            </View>

            {POINT_REWARDS.map((r) => {
              const afford = points >= r.cost;
              const busy   = redeeming === r.type;
              return (
                /*
                 * Its own row styles, not the order summary's.
                 *
                 * sumValue carries textAlign right and flex 1 because it is the
                 * right-hand column of a label/value row. Reused here it threw the
                 * reward name to the right margin and left "89 points to go"
                 * stranded on the left, with the points cost not showing at all.
                 */
                <View key={r.type} style={styles.useRow}>
                  <Text style={[styles.useCost, { color: afford ? theme.primary : theme.textThird }]}>
                    {r.cost.toLocaleString()}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.useLabel, { color: theme.text }]}>{r.label}</Text>
                    <Text style={[styles.useNote, { color: theme.textThird }]}>
                      {afford ? r.note : (r.cost - points).toLocaleString() + ' points to go'}
                    </Text>
                  </View>
                  {afford && (
                    <Pressable
                      disabled={!!redeeming}
                      onPress={() => usePoints(r.type, r.cost)}
                      style={[styles.useBtn, { borderColor: theme.primary }, !!redeeming && { opacity: 0.6 }]}
                    >
                      {busy
                        ? <ActivityIndicator size="small" color={theme.primary} />
                        : <Text style={[styles.useBtnText, { color: theme.primary }]}>
                            Use {r.cost.toLocaleString()}
                          </Text>}
                    </Pressable>
                  )}
                </View>
              );
            })}

            {!!pointsMsg && (
              <Text style={[styles.sumLabel, { color: '#16A34A', fontWeight: '700' }]}>{pointsMsg}</Text>
            )}
            {!!pointsErr && (
              <Text style={[styles.sumLabel, { color: '#DC2626' }]}>{pointsErr}</Text>
            )}
          </View>
        )}

        {alreadyPaid ? (
          <View style={[styles.noticeBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary }]}>
            <Text style={[styles.noticeText, { color: theme.text }]}>
              This booking is already paid. Nothing more to do here.
            </Text>
          </View>
        ) : (
          <View style={[styles.noticeBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary }]}>
            <Text style={[styles.noticeText, { color: theme.text }]}>
              You will be taken to our secure checkout, where you can pay by card, bank
              transfer or USSD. Come back to the app afterwards and we confirm it automatically.
            </Text>
            <Text style={[styles.noticeText, { color: theme.textSecond, marginTop: 6, fontSize: 12 }]}>
              Pay by card and it is saved for one tap next time. Manage saved cards in Settings, Payment Methods.
            </Text>
          </View>
        )}

        {error ? <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text> : null}
        {loadErr ? (
          <Text style={[styles.errorText, { color: theme.textSecond }]}>
            Could not load the booking details. The amount still comes from the booking when you pay.
          </Text>
        ) : null}

        {/* Payment protection: promises only what the policy delivers.
            "Full refund no matter what" was on this screen and is not
            what the failed-delivery policy says. */}
        <View style={[styles.escrowBox, { backgroundColor: theme.surfaceSecond }]}>
          <View style={styles.escrowTitleRow}>
            <ShieldCheck size={18} color={theme.text} strokeWidth={1.5} />
            <Text style={[styles.escrowTitle, { color: theme.text }]}>Payment Protection</Text>
          </View>
          <Text style={[styles.escrowDesc, { color: theme.textSecond }]}>
            Your payment is held by SEIRS and only released to the driver after delivery is
            confirmed. If the delivery cannot be completed, refunds follow the Terms of Service:
            work already done, like distance covered, can be deducted.
          </Text>
        </View>

        {/* Pay button */}
        <View style={styles.footer}>
          {alreadyPaid ? (
            <Pressable
              style={[styles.payBtn, { backgroundColor: theme.primary }]}
              onPress={navigateToTracking}
            >
              <Text style={styles.payBtnText}>Track this delivery</Text>
            </Pressable>
          ) : savedCard ? (
            <>
              <Pressable
                style={[styles.payBtn, { backgroundColor: theme.primary }, (loading || verifying) && { opacity: 0.7 }]}
                onPress={handlePayWithSavedCard}
                disabled={loading || verifying}
              >
                {loading || verifying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.payBtnText}>
                    Pay {naira(displayPrice)} with {String(savedCard.brand ?? 'card').toUpperCase()} •••• {savedCard.last4}
                  </Text>
                )}
              </Pressable>
              <Pressable onPress={handlePay} disabled={loading || verifying} style={{ paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: theme.primary, fontSize: 14, fontWeight: '600' }}>
                  Use a different payment method
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={[styles.payBtn, { backgroundColor: theme.primary }, (loading || verifying) && { opacity: 0.7 }]}
              onPress={handlePay}
              disabled={loading || verifying}
            >
              {loading || verifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.payBtnText}>
                  Pay {naira(displayPrice)}
                </Text>
              )}
            </Pressable>
          )}
          {verifying && (
            <Text style={[styles.verifyNote, { color: theme.textSecond }]}>
              Verifying your payment...
            </Text>
          )}
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:       { padding: Spacing.xl, paddingBottom: Spacing.md },
  backBtn:      { marginBottom: Spacing.md },
  backText:     { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  title:        { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  amountCard:   { marginHorizontal: Spacing.xl, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.md },
  amountLabel:  { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, marginBottom: Spacing.sm },
  amount:       { color: '#fff', fontSize: FontSize['4xl'], fontWeight: FontWeight.bold, marginBottom: Spacing.xs },
  amountNote:   { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.xs, textAlign: 'center' },
  // Order Summary: same values as the Review step's summary card.
  sumHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sumCard:      { marginHorizontal: Spacing.xl, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  sumTitle:     { fontSize: 17, fontWeight: FontWeight.bold, marginBottom: Spacing.sm },
  sumRow:       { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  useRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  useCost:      { fontSize: 15, fontWeight: '800', minWidth: 44 },
  useLabel:     { fontSize: 14, fontWeight: '600' },
  useNote:      { fontSize: 12, marginTop: 2 },
  useBtn:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.lg, borderWidth: 1.5, minWidth: 84, alignItems: 'center' },
  useBtnText:   { fontSize: 13, fontWeight: '700' },
  sumLabel:     { fontSize: 13 },
  sumValue:     { fontSize: 13, flex: 1, textAlign: 'right' },
  sumTotal:     { fontSize: 17, fontWeight: FontWeight.bold },
  noticeBox:    { marginHorizontal: Spacing.xl, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  noticeText:   { fontSize: FontSize.sm, lineHeight: 20 },
  errorText:    { textAlign: 'center', fontSize: FontSize.sm, marginHorizontal: Spacing.xl, marginBottom: Spacing.md },
  escrowBox:    { marginHorizontal: Spacing.xl, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg },
  escrowTitle:    { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  escrowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  escrowDesc:   { fontSize: FontSize.sm, lineHeight: 20 },
  footer:       { paddingHorizontal: Spacing.xl },
  payBtn:       { height: 56, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  payBtnText:   { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },
  verifyNote:   { textAlign: 'center', fontSize: FontSize.xs, marginTop: Spacing.sm },
});
