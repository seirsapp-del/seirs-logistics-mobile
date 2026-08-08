import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Alert, ActivityIndicator, AppState, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { paymentsApi } from '@/services/api';

/**
 * Add payment method screen.
 *
 * Cards can't be entered directly in the app (PCI-DSS + Flutterwave rules).
 * Instead we run the standard "verify + refund" pattern used by Bolt, Uber,
 * Kuda, Piggyvest etc.:
 *   1. Server initiates a ₦100 Flutterwave charge
 *   2. User completes it on Flutterwave's hosted page
 *   3. On return, server verifies, saves the card token, refunds the ₦100
 *
 * User sees ₦100 briefly on their statement then immediately refunded.
 * Card lands in the saved cards list ready for one-tap reuse on future
 * deliveries.
 */
export default function AddPaymentScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [busy,     setBusy]     = useState<'idle' | 'starting' | 'verifying'>('idle');
  const [error,    setError]    = useState<string | null>(null);
  const pendingTxRef = useRef<string | null>(null);

  const handleAddCard = () => {
    Alert.alert(
      'Add card',
      'We\'ll charge ₦100 to verify your card, then refund it immediately. Total cost to you: ₦0. You\'ll see the refund on your bank statement within 5-10 business days.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: startAddCard },
      ],
    );
  };

  const startAddCard = async () => {
    setError(null);
    setBusy('starting');
    try {
      const res = await paymentsApi.addCardStart();
      pendingTxRef.current = res.reference;

      // Watch for the user returning to the app after paying on
      // Flutterwave's page. Same pattern as the delivery-checkout flow.
      const sub = AppState.addEventListener('change', async (state) => {
        if (state === 'active' && pendingTxRef.current) {
          sub.remove();
          const tx = pendingTxRef.current;
          pendingTxRef.current = null;
          setBusy('verifying');
          try {
            const result = await paymentsApi.addCardVerify(tx);
            if (result?.saved) {
              Alert.alert(
                'Card saved',
                `Your ${result.brand ?? 'card'} ending in ${result.last4 ?? '****'} is ready.${result.refunded ? ' ₦100 refund is on its way to your bank.' : ' Refund is being processed manually.'}`,
                [{ text: 'OK', onPress: () => router.replace('/(customer)/payment-methods' as any) }],
              );
            }
          } catch (e: any) {
            setError(e?.message ?? 'Card verification failed. Any charge will be refunded.');
          } finally {
            setBusy('idle');
          }
        }
      });

      await Linking.openURL(res.authorizationUrl);
    } catch (e: any) {
      setBusy('idle');
      setError(e?.message ?? 'Could not start card verification. Try again.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Add payment method</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Primary explainer card */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.primary + '15' }]}>
            <Ionicons name="shield-checkmark-outline" size={32} color={theme.primary} />
          </View>
          <Text style={[styles.h1, { color: theme.text }]}>Save a card securely</Text>
          <Text style={[styles.p, { color: theme.textSecond }]}>
            SEIRS never sees your full card number. When you tap Add card, we open
            Flutterwave (Nigerian PCI-DSS certified processor). You enter your card
            there, they issue us a one-way token, we store only the last 4 digits +
            brand.
          </Text>
          <Text style={[styles.p, { color: theme.textSecond, marginTop: 8 }]}>
            To confirm the card is real, we charge ₦100 and{' '}
            <Text style={{ fontWeight: FontWeight.bold, color: theme.text }}>refund it immediately</Text>.
            Total cost to you: ₦0.
          </Text>
        </View>

        {/* Error message */}
        {error && (
          <View style={[styles.errorCard, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
            <Ionicons name="alert-circle-outline" size={18} color="#991B1B" />
            <Text style={[styles.errorText, { color: '#991B1B' }]}>{error}</Text>
          </View>
        )}

        {/* Primary CTA */}
        <Pressable
          onPress={handleAddCard}
          disabled={busy !== 'idle'}
          style={[styles.cta, { backgroundColor: theme.primary, opacity: busy !== 'idle' ? 0.6 : 1 }]}
        >
          {busy === 'starting' ? (
            <ActivityIndicator color="#fff" />
          ) : busy === 'verifying' ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={styles.ctaText}>Verifying card…</Text>
            </>
          ) : (
            <>
              <Ionicons name="card-outline" size={18} color="#fff" />
              <Text style={styles.ctaText}>Add card (₦100 verify + refund)</Text>
            </>
          )}
        </Pressable>

        {/* Payment methods available in Nigeria via Flutterwave */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.h2, { color: theme.text }]}>Other options at checkout</Text>
          <Text style={[styles.pSmall, { color: theme.textSecond, marginBottom: 4 }]}>
            You don't need to save a card. These payment options appear automatically when
            you book a delivery.
          </Text>
          {[
            { icon: 'business-outline',   label: 'Bank transfer',           sub: 'One-time virtual account per delivery' },
            { icon: 'keypad-outline',     label: 'USSD',                    sub: 'Dial the code on your registered phone number' },
            { icon: 'globe-outline',      label: 'Pay with bank',           sub: 'Log in to your bank in the Flutterwave modal' },
          ].map((row) => (
            <View key={row.label} style={[styles.optionRow, { borderTopColor: theme.border }]}>
              <View style={[styles.optionIcon, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name={row.icon as any} size={18} color={theme.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: theme.text }]}>{row.label}</Text>
                <Text style={[styles.optionSub, { color: theme.textSecond }]}>{row.sub}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },

  card:    { padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, gap: Spacing.sm },
  iconWrap:{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  h1:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, marginTop: 4 },
  h2:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: 4 },
  p:       { fontSize: FontSize.sm, lineHeight: 22 },
  pSmall:  { fontSize: FontSize.xs, lineHeight: 18 },

  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  errorText: { flex: 1, fontSize: FontSize.xs, lineHeight: 17 },

  optionRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1 },
  optionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  optionLabel:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  optionSub:  { fontSize: FontSize.xs, marginTop: 2 },

  cta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.md, borderRadius: Radius.lg },
  ctaText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
