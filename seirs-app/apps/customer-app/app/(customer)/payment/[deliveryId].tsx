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

// Spec V8 §"Confirmed Decisions" — COD removed. All non-wallet methods
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

const METHODS: PickerEntry[] = [
  { id: 'card',          Icon: CreditCard, label: 'Card',          desc: 'Pay with a Nigerian Visa, Mastercard, or Verve card', flutterwave: 'card',         backendMethod: 'card' },
  { id: 'bank_transfer', Icon: Landmark,   label: 'Bank Transfer', desc: 'Get a one-time account number to transfer to',         flutterwave: 'banktransfer', backendMethod: 'bank_transfer' },
  { id: 'ussd',          Icon: Smartphone, label: 'USSD',          desc: 'Dial a code from your bank app or any phone',           flutterwave: 'ussd',         backendMethod: 'card' },
  { id: 'wallet',        Icon: Wallet,     label: 'Seirs Wallet',  desc: 'Use your existing SEIRS wallet balance',                flutterwave: null,           backendMethod: 'wallet' },
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

  const [selectedId, setSelectedId] = useState<PickerId>('card');
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

      if (selected.flutterwave && res.authorizationUrl) {
        pendingTxRef.current = res.reference ?? null;

        // Watch for app returning to foreground — auto-verify payment
        const sub = AppState.addEventListener('change', async (state) => {
          if (state === 'active' && pendingTxRef.current) {
            sub.remove();
            setVerifying(true);
            try {
              await paymentsApi.verify(pendingTxRef.current);
              pendingTxRef.current = null;
            } catch {
              // Payment may still be pending — navigation happens anyway
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
          <Text style={[styles.title, { color: theme.text }]}>Choose Payment</Text>
        </View>

        {/* Amount card */}
        <View style={[styles.amountCard, { backgroundColor: theme.primary }]}>
          <Text style={styles.amountLabel}>Amount to pay</Text>
          <Text style={styles.amount}>₦{Number(price ?? 0).toLocaleString()}</Text>
          <Text style={styles.amountNote}>Funds held in escrow — released after delivery</Text>
        </View>

        {/* Payment methods */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Payment Method</Text>
          {METHODS.map((m) => {
            const on = selectedId === m.id;
            return (
              <Pressable
                key={m.id}
                style={[
                  styles.methodCard,
                  {
                    backgroundColor: on ? theme.primary + '12' : theme.surface,
                    borderColor:     on ? theme.primary : theme.border,
                  },
                  Shadows.sm,
                ]}
                onPress={() => setSelectedId(m.id)}
              >
                <m.Icon size={24} color={on ? theme.primary : theme.text} strokeWidth={1.5} style={styles.methodIcon} />
                <View style={styles.methodInfo}>
                  <Text style={[styles.methodLabel, { color: theme.text }]}>{m.label}</Text>
                  <Text style={[styles.methodDesc,  { color: theme.textSecond }]}>{m.desc}</Text>
                </View>
                <View style={[
                  styles.radio,
                  {
                    borderColor:     on ? theme.primary : theme.border,
                    backgroundColor: on ? theme.primary : 'transparent',
                  },
                ]} />
              </Pressable>
            );
          })}
        </View>

        {selectedId === 'card' && (
          <View style={[styles.noticeBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary }]}>
            <Text style={[styles.noticeText, { color: theme.text }]}>
              You&apos;ll be redirected to Flutterwave&apos;s secure card form. Return to the app after payment to confirm.
            </Text>
            <Text style={[styles.noticeText, { color: theme.textSecond, marginTop: 6, fontSize: 12 }]}>
              Your card will be saved securely for one-tap reuse next time. Manage saved cards in Settings → Payment Methods.
            </Text>
          </View>
        )}

        {selectedId === 'bank_transfer' && (
          <View style={[styles.noticeBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary }]}>
            <Text style={[styles.noticeText, { color: theme.text }]}>
              Flutterwave will generate a one-time virtual account number for this transfer. Send the exact amount from your bank app — the order confirms automatically when funds land.
            </Text>
          </View>
        )}

        {selectedId === 'ussd' && (
          <View style={[styles.noticeBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary }]}>
            <Text style={[styles.noticeText, { color: theme.text }]}>
              Pick your bank on the next screen and dial the code from any phone — no smartphone or internet required for the transfer itself.
            </Text>
          </View>
        )}

        {selectedId === 'wallet' && (
          <View style={[styles.noticeBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary }]}>
            <Text style={[styles.noticeText, { color: theme.text }]}>
              Charged instantly to your SEIRS wallet — no Flutterwave roundtrip.
            </Text>
          </View>
        )}

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
                Pay ₦{Number(price ?? 0).toLocaleString()}
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
