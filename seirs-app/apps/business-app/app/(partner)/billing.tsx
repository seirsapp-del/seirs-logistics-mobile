import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Alert, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { feesApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';

// Spec V8 §4.11 — partner sponsored-placement billing view. Live monthly
// fee is read from the Fee Catalogue (admin-editable, propagates within
// 60s) so the displayed price always matches what would actually be
// charged. The actual subscribe/unsubscribe wire-up routes through
// Flutterwave when the partner taps Activate — placeholder for now.

const fmtNgn = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function PartnerBillingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const [monthlyPrice, setMonthlyPrice] = useState<number | null>(null);
  const [loading,      setLoading]      = useState(true);

  // Local-only campaign state until the subscription backend lands. The
  // toggle visually confirms the change and the next batch will hook it
  // up to a real PartnerSubscription entity.
  const [active,       setActive]       = useState(false);

  useEffect(() => {
    feesApi.get('partner_sponsored_placement')
      .then(res => setMonthlyPrice(Number(res.value)))
      .catch(() => setMonthlyPrice(null))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = (next: boolean) => {
    if (next) {
      Alert.alert(
        'Activate Sponsored Placement',
        `You'll be billed ${monthlyPrice != null ? fmtNgn(monthlyPrice) : '—'} every month and your store will appear pinned at the top of the customer map.\n\nThis is a placeholder — Flutterwave subscription will be wired up in the next batch. Toggling here today does not bill you.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Activate', onPress: () => setActive(true) },
        ],
      );
    } else {
      Alert.alert(
        'Pause Sponsored Placement',
        'Your store will return to standard map ranking. Active customers in current sessions will still see you pinned until they refresh.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Pause', style: 'destructive', onPress: () => setActive(false) },
        ],
      );
    }
  };

  // Mock metrics — real numbers will come from the placement_impressions
  // table once the customer map starts emitting view events. Numbers are
  // rendered conservatively to set realistic expectations.
  const stats = active
    ? { impressions: 2840, clickThroughs: 312, monthSpend: monthlyPrice ?? 0 }
    : { impressions: 0,    clickThroughs: 0,   monthSpend: 0 };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.surface }]}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Sponsored Placement</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Brand-navy hero stays constant */}
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="TrendingUp" size={20} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>Be the first store customers see</Text>
        <Text style={styles.heroSub}>
          Sponsored stores appear pinned at the top of the customer map and in the drop-off picker — significantly more drop-offs and impressions per week.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardLabel, { color: colors.textSecond }]}>YOUR PLAN</Text>
          <View style={[styles.statusChip, { backgroundColor: active ? '#16A34A18' : colors.surfaceSecond }]}>
            <View style={[styles.statusDot, { backgroundColor: active ? '#16A34A' : colors.textThird }]} />
            <Text style={[styles.statusText, { color: active ? '#16A34A' : colors.textSecond }]}>
              {active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        <Text style={[styles.planName, { color: colors.text }]}>Sponsored Placement</Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
        ) : monthlyPrice != null ? (
          <Text style={[styles.planPrice, { color: colors.text }]}>
            {fmtNgn(monthlyPrice)}<Text style={[styles.planPriceSecond, { color: colors.textSecond }]}> /month</Text>
          </Text>
        ) : (
          <Text style={[styles.planPrice, { color: colors.text }]}>Price unavailable</Text>
        )}

        <Text style={[styles.planSub, { color: colors.textSecond }]}>
          Pinned at top of customer map · Featured in drop-off picker · Priority in search results
        </Text>

        <View style={[styles.toggleRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>{active ? 'Active' : 'Activate placement'}</Text>
          <Switch
            value={active}
            onValueChange={handleToggle}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.statsTitle, { color: colors.text }]}>This Month</Text>
        <View style={[styles.statsRow, { backgroundColor: colors.surfaceSecond }]}>
          <Stat label="Impressions"     value={stats.impressions.toLocaleString()} />
          <View style={[styles.statsDivider, { backgroundColor: colors.border }]} />
          <Stat label="Click-throughs"  value={stats.clickThroughs.toLocaleString()} />
          <View style={[styles.statsDivider, { backgroundColor: colors.border }]} />
          <Stat label="Spend"           value={fmtNgn(stats.monthSpend)} />
        </View>
        {!active && (
          <Text style={[styles.statsHint, { color: colors.textThird }]}>
            Activate to start collecting placement metrics.
          </Text>
        )}
      </View>

      <View style={[styles.benefitsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.benefitsTitle, { color: colors.text }]}>What&apos;s included</Text>
        {[
          { icon: 'MapPin',     text: 'Top-pinned spot on customer map within your service area' },
          { icon: 'Search',     text: 'Featured first in store-picker results when customers schedule drop-offs' },
          { icon: 'BarChart3',  text: 'Live impression + click-through dashboard updated daily' },
          { icon: 'CreditCard', text: 'Auto-billed monthly via Flutterwave — pause anytime, no contract' },
        ].map(b => (
          <View key={b.text} style={styles.benefitRow}>
            <View style={[styles.benefitIcon, { backgroundColor: colors.accent + '18' }]}>
              <Icon name={b.icon as any} size={14} color={colors.accent} />
            </View>
            <Text style={[styles.benefitText, { color: colors.textSecond }]}>{b.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footnote}>
        <Icon name="Info" size={12} color={colors.textThird} />
        <Text style={[styles.footnoteText, { color: colors.textThird }]}>
          Pricing read live from the SEIRS Fee Catalogue. Changes propagate within 60s.
        </Text>
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecond }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content:    { padding: 16, gap: 16 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:    { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 18, fontWeight: '700' },

  hero:       { backgroundColor: '#0F2B4C', borderRadius: 16, padding: 20, gap: 8, alignItems: 'flex-start' },
  heroIcon:   { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroTitle:  { color: '#fff', fontSize: 18, fontWeight: '700' },
  heroSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18 },

  card:       { borderRadius: 16, padding: 16, gap: 8, borderWidth: 1 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },

  planName:      { fontSize: 16, fontWeight: '700', marginTop: 4 },
  planPrice:     { fontSize: 28, fontWeight: '800' },
  planPriceSecond:{ fontSize: 14, fontWeight: '600' },
  planSub:       { fontSize: 12, lineHeight: 18 },

  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 12, borderTopWidth: 1 },
  toggleLabel:{ fontSize: 14, fontWeight: '600' },

  statsCard:  { borderRadius: 16, padding: 16, gap: 12, borderWidth: 1 },
  statsTitle: { fontSize: 13, fontWeight: '700' },
  statsRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingVertical: 12 },
  statsDivider:{ width: 1, alignSelf: 'stretch' },
  statItem:   { flex: 1, alignItems: 'center', gap: 4 },
  statValue:  { fontSize: 16, fontWeight: '700' },
  statLabel:  { fontSize: 10, fontWeight: '600' },
  statsHint:  { fontSize: 11, textAlign: 'center' },

  benefitsCard: { borderRadius: 16, padding: 16, gap: 10, borderWidth: 1 },
  benefitsTitle:{ fontSize: 13, fontWeight: '700' },
  benefitRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon:  { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  benefitText:  { flex: 1, fontSize: 13, lineHeight: 18 },

  footnote:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  footnoteText:{ fontSize: 11, flex: 1, lineHeight: 15 },
});
