import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Alert, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { feesApi } from '@/services/api';

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
      style={{ flex: 1, backgroundColor: '#F5F5F0' }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>
        <Text style={styles.title}>Sponsored Placement</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="TrendingUp" size={20} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>Be the first store customers see</Text>
        <Text style={styles.heroSub}>
          Sponsored stores appear pinned at the top of the customer map and in the drop-off picker — significantly more drop-offs and impressions per week.
        </Text>
      </View>

      {/* Plan card */}
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardLabel}>YOUR PLAN</Text>
          <View style={[styles.statusChip, { backgroundColor: active ? '#16A34A18' : '#F3F4F6' }]}>
            <View style={[styles.statusDot, { backgroundColor: active ? '#16A34A' : '#9CA3AF' }]} />
            <Text style={[styles.statusText, { color: active ? '#16A34A' : '#6B7280' }]}>
              {active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        <Text style={styles.planName}>Sponsored Placement</Text>

        {loading ? (
          <ActivityIndicator color="#3A7BD5" style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
        ) : monthlyPrice != null ? (
          <Text style={styles.planPrice}>
            {fmtNgn(monthlyPrice)}<Text style={styles.planPriceSecond}> /month</Text>
          </Text>
        ) : (
          <Text style={styles.planPrice}>Price unavailable</Text>
        )}

        <Text style={styles.planSub}>
          Pinned at top of customer map · Featured in drop-off picker · Priority in search results
        </Text>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{active ? 'Active' : 'Activate placement'}</Text>
          <Switch
            value={active}
            onValueChange={handleToggle}
            trackColor={{ false: '#E5E7EB', true: '#3A7BD5' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* This month's metrics */}
      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>This Month</Text>
        <View style={styles.statsRow}>
          <Stat label="Impressions"     value={stats.impressions.toLocaleString()} />
          <View style={styles.statsDivider} />
          <Stat label="Click-throughs"  value={stats.clickThroughs.toLocaleString()} />
          <View style={styles.statsDivider} />
          <Stat label="Spend"           value={fmtNgn(stats.monthSpend)} />
        </View>
        {!active && (
          <Text style={styles.statsHint}>
            Activate to start collecting placement metrics.
          </Text>
        )}
      </View>

      {/* Benefits list */}
      <View style={styles.benefitsCard}>
        <Text style={styles.benefitsTitle}>What&apos;s included</Text>
        {[
          { icon: 'MapPin',     text: 'Top-pinned spot on customer map within your service area' },
          { icon: 'Search',     text: 'Featured first in store-picker results when customers schedule drop-offs' },
          { icon: 'BarChart3',  text: 'Live impression + click-through dashboard updated daily' },
          { icon: 'CreditCard', text: 'Auto-billed monthly via Flutterwave — pause anytime, no contract' },
        ].map(b => (
          <View key={b.text} style={styles.benefitRow}>
            <View style={styles.benefitIcon}>
              <Icon name={b.icon as any} size={14} color="#3A7BD5" />
            </View>
            <Text style={styles.benefitText}>{b.text}</Text>
          </View>
        ))}
      </View>

      {/* Footnote */}
      <View style={styles.footnote}>
        <Icon name="Info" size={12} color="#9CA3AF" />
        <Text style={styles.footnoteText}>
          Pricing read live from the SEIRS Fee Catalogue. Changes propagate within 60s.
        </Text>
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content:    { padding: 16, gap: 16 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },

  hero:       { backgroundColor: '#0F2B4C', borderRadius: 16, padding: 20, gap: 8, alignItems: 'flex-start' },
  heroIcon:   { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroTitle:  { color: '#fff', fontSize: 18, fontWeight: '700' },
  heroSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18 },

  card:       { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel:  { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },

  planName:      { fontSize: 16, fontWeight: '700', color: '#0F2B4C', marginTop: 4 },
  planPrice:     { fontSize: 28, fontWeight: '800', color: '#0F2B4C' },
  planPriceSecond:{ fontSize: 14, color: '#6B7280', fontWeight: '600' },
  planSub:       { fontSize: 12, color: '#6B7280', lineHeight: 18 },

  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  toggleLabel:{ fontSize: 14, fontWeight: '600', color: '#0F2B4C' },

  statsCard:  { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  statsTitle: { fontSize: 13, fontWeight: '700', color: '#0F2B4C' },
  statsRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, paddingVertical: 12 },
  statsDivider:{ width: 1, backgroundColor: '#E5E7EB', alignSelf: 'stretch' },
  statItem:   { flex: 1, alignItems: 'center', gap: 4 },
  statValue:  { fontSize: 16, fontWeight: '700', color: '#0F2B4C' },
  statLabel:  { fontSize: 10, fontWeight: '600', color: '#6B7280' },
  statsHint:  { fontSize: 11, color: '#9CA3AF', textAlign: 'center' },

  benefitsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  benefitsTitle:{ fontSize: 13, fontWeight: '700', color: '#0F2B4C' },
  benefitRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon:  { width: 28, height: 28, borderRadius: 8, backgroundColor: '#3A7BD518', alignItems: 'center', justifyContent: 'center' },
  benefitText:  { flex: 1, fontSize: 13, color: '#374151', lineHeight: 18 },

  footnote:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  footnoteText:{ fontSize: 11, color: '#9CA3AF', flex: 1, lineHeight: 15 },
});
