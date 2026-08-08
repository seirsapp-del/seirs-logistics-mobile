import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

/**
 * Payment methods "how to add a card" explainer.
 *
 * SEIRS never collects raw card numbers in the app. Cards are tokenized
 * by Flutterwave's hosted payment page during a real delivery checkout
 * (see payment/[deliveryId].tsx). The token comes back, backend saves
 * only { last4, brand, expiry, token } to the saved_cards table.
 *
 * This screen used to be a fake RN card form that pretended to save but
 * did nothing. Replaced with an informational card explaining the correct
 * flow. Matches Bolt / Uber / Amazon pattern.
 */
export default function AddPaymentScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

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
          <Text style={[styles.h1, { color: theme.text }]}>Cards save automatically</Text>
          <Text style={[styles.p,  { color: theme.textSecond }]}>
            The first time you pay for a delivery with a card, we ask if you want to save
            it for next time. Tap yes and the card lands here.
          </Text>
          <Text style={[styles.p,  { color: theme.textSecond, marginTop: 8 }]}>
            SEIRS never sees your full card number. Only Flutterwave (Nigerian PCI-DSS
            certified processor) touches the card. We store only the last 4 digits, the
            card brand, and a one-way token that only works with our account.
          </Text>
        </View>

        {/* Payment methods available in Nigeria via Flutterwave */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.h2, { color: theme.text }]}>Payment options at checkout</Text>
          {[
            { icon: 'card-outline',       label: 'Debit or credit card',   sub: 'Visa, Mastercard, Verve' },
            { icon: 'business-outline',   label: 'Bank transfer',           sub: 'One-time virtual account per delivery' },
            { icon: 'keypad-outline',     label: 'USSD',                    sub: 'Dial the code from your registered phone number' },
            { icon: 'globe-outline',      label: 'Pay with bank',           sub: 'Log in to your bank in the Flutterwave modal' },
          ].map((row) => (
            <View key={row.label} style={[styles.optionRow, { borderTopColor: theme.border }]}>
              <View style={[styles.optionIcon, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name={row.icon as any} size={18} color={theme.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: theme.text }]}>{row.label}</Text>
                <Text style={[styles.optionSub,   { color: theme.textSecond }]}>{row.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Primary CTA */}
        <Pressable
          onPress={() => router.push('/(customer)/send' as any)}
          style={[styles.cta, { backgroundColor: theme.primary }]}
        >
          <Ionicons name="paper-plane-outline" size={18} color="#fff" />
          <Text style={styles.ctaText}>Book a delivery</Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={[styles.secondaryCta]}
        >
          <Text style={[styles.secondaryCtaText, { color: theme.textSecond }]}>Back to saved cards</Text>
        </Pressable>

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

  optionRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1 },
  optionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  optionLabel:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  optionSub:  { fontSize: FontSize.xs, marginTop: 2 },

  cta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.md, borderRadius: Radius.lg },
  ctaText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  secondaryCta:    { alignItems: 'center', paddingVertical: Spacing.sm },
  secondaryCtaText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
