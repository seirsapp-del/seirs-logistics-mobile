import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Linking, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CreditCard, Wallet, Smartphone, Landmark, ShieldCheck } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { paymentsApi, type FlutterwavePaymentOption } from '@/services/api';

// Spec V8 §"Confirmed Decisions": COD removed. All non-wallet methods
// route through Flutterwave; the paymentOption hint controls which tab
// of the Flutterwave widget opens.
type PickerId = 'card' | 'bank_transfer' | 'ussd' | 'wallet';

interface PickerEntry {
  id:            PickerId;
  Icon:          LucideIcon;
  label:         string;
  desc:          string;
  // null = SEIRS wallet (no Flutterwave roundtrip). Otherwise the tab
  // hint we pass through to Flutterwave's hosted widget.
  flutterwave:   FlutterwavePaymentOption | null;
  backendMethod: 'card' | 'bank_transfer' | 'wallet';
}

/**
 * Customer payment methods. All three go to Flutterwave.
 *
 * "Seirs Wallet" was a fourth option and has been removed (founder
 * 2026-08-13) for two reasons, either of which alone is enough:
 *
 *   1. Customers do not hold a naira balance with SEIRS. Holding
 *      customer funds is a licensed activity under CBN rules and we are
 *      not licensed. Customers earn Rewards, which are points, and
 *      points do not pay a fare.
 *   2. It was broken. The entry carried flutterwave: null, so choosing
 *      it skipped the payment provider entirely and navigated straight
 *      to tracking, leaving an unpaid delivery looking paid. This is
 *      what the founder hit when "clicking pay didn't take me to any
 *      payment platform".
 *
 * The driver and partner ledgers are unaffected: those are real money
 * owed for work done, and they belong in those apps, not here.
 */
const METHODS: PickerEntry[] = [
  { id: 'card',          Icon: CreditCard, label: 'Card',          desc: 'Pay with a Nigerian Visa, Mastercard, or Verve card', flutterwave: 'card',         backendMethod: 'card' },
  { id: 'bank_transfer', Icon: Landmark,   label: 'Bank Transfer', desc: 'Get a one-time account number to transfer to',         flutterwave: 'banktransfer', backendMethod: 'bank_transfer' },
  { id: 'ussd',          Icon: Smartphone, label: 'USSD',          desc: 'Dial a code from your bank app or any phone',           flutterwave: 'ussd',         backendMethod: 'card' },
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

  // One route to checkout: Flutterwave, card tab open by default. Its
  // own page carries bank transfer and USSD, so we no longer ask first.
  const selectedId: PickerId = 'card';
  const [loading,    setLoading]    = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [error,      setError]      = useState('');
  const pendingTxRef = useRef<string | null>(null);

  const selected = METHODS.find(m => m.id === selectedId)!;

  const handlePay = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await paymentsApi.initiate(
        deliveryId,
        selected.backendMethod,
        selected.flutterwave ?? undefined,
      );
      if (res.error) throw new Error(res.error);

      // A method that reaches Flutterwave but comes back with no
      // checkout URL means the payment never started. Say so instead of
      // navigating to tracking, which would show an unpaid delivery as
      // though it were paid (founder 2026-08-13).
      if (selected.flutterwave && !res.authorizationUrl) {
        throw new Error(
          'Could not open the payment page. Your card has not been charged. Try again, or choose another method.',
        );
      }

      if (selected.flutterwave && res.authorizationUrl) {
        pendingTxRef.current = res.reference ?? null;

        // Watch for app returning to foreground: auto-verify payment
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
        return; // navigation happens via AppState handler
      }

      navigateToTracking();
    } catch (e: any) {
      setError(e.message ?? 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const navigateToTracking = () => {
    router.replace({
      pathname: '/(customer)/track',
      params: { code: trackingCode },
    });
  };

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

        {/* Amount card */}
        <View style={[styles.amountCard, { backgroundColor: theme.primary }]}>
          <Text style={styles.amountLabel}>Amount to pay</Text>
          <Text style={styles.amount}>₦{Number(price ?? 0).toLocaleString()}</Text>
          <Text style={styles.amountNote}>Funds held in escrow: released after delivery</Text>
        </View>

        {/* No method picker (founder 2026-08-13). We route everything to
            Flutterwave, and Flutterwave's own checkout already lists
            card, bank transfer and USSD. Asking the customer to choose
            here just made them choose twice, and one of the options was
            broken. If we ever add a second processor, the choice belongs
            here again. */}
        <View style={[styles.noticeBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary }]}>
          <Text style={[styles.noticeText, { color: theme.text }]}>
            You will be taken to Flutterwave&apos;s secure checkout, where you can pay by card, bank
            transfer or USSD. Come back to the app afterwards and we confirm it automatically.
          </Text>
          <Text style={[styles.noticeText, { color: theme.textSecond, marginTop: 6, fontSize: 12 }]}>
            Pay by card and it is saved for one tap next time. Manage saved cards in Settings, Payment Methods.
          </Text>
        </View>

        {error ? <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text> : null}

        {/* Escrow explanation */}
        <View style={[styles.escrowBox, { backgroundColor: theme.surfaceSecond }]}>
          <View style={styles.escrowTitleRow}>
            <ShieldCheck size={18} color={theme.text} strokeWidth={1.5} />
            <Text style={[styles.escrowTitle, { color: theme.text }]}>Escrow Protection</Text>
          </View>
          <Text style={[styles.escrowDesc, { color: theme.textSecond }]}>
            Your payment is held securely and only released to the driver after delivery is confirmed. If anything goes wrong, you get a full refund.
          </Text>
        </View>

        {/* Pay button */}
        <View style={styles.footer}>
          <Pressable
            style={[styles.payBtn, { backgroundColor: theme.primary }, (loading || verifying) && { opacity: 0.7 }]}
            onPress={handlePay}
            disabled={loading || verifying}
          >
            {loading || verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.payBtnText}>
                Continue to payment · ₦{Number(price ?? 0).toLocaleString()}
              </Text>
            )}
          </Pressable>
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
  amountCard:   { marginHorizontal: Spacing.xl, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.xl },
  amountLabel:  { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, marginBottom: Spacing.sm },
  amount:       { color: '#fff', fontSize: FontSize['4xl'], fontWeight: FontWeight.bold, marginBottom: Spacing.xs },
  amountNote:   { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.xs, textAlign: 'center' },
  section:      { paddingHorizontal: Spacing.xl, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  methodCard:   { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, marginBottom: Spacing.sm, gap: Spacing.md },
  methodIcon:   { marginRight: Spacing.sm },
  methodInfo:   { flex: 1 },
  methodLabel:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  methodDesc:   { fontSize: FontSize.xs, marginTop: 2 },
  radio:        { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
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
