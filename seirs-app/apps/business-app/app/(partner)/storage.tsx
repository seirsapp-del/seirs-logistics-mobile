import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

// Spec V8 §4.10 — partner sees overstayed packages with accruing storage
// fees. Packages enter the list once they cross 24hr in-store. Tier_1
// (24-48h) and tier_2 (48-72h) accrue ₦200/day; >=72h triggers return
// and a ₦500 fee. Both numbers come from the live Fee Catalogue and
// the daily cron in PartnerStoreService.

type TierKey = 'all' | 'tier_1' | 'tier_2' | 'return_eligible';

interface Overstay {
  id:                    string;
  dropCode:              string;
  recipientName:         string;
  recipientPhone:        string;
  weightKg:              number;
  status:                string;
  arrivedAt:             string | null;
  hoursInStore:          number;
  storageFeesAccruedNgn: number;
  tier:                  'free' | 'tier_1' | 'tier_2' | 'return_eligible';
}

const TIER_META: Record<string, { label: string; color: string; sub: string }> = {
  tier_1:           { label: '24-48 hrs',  color: '#D97706', sub: '₦200/day accruing' },
  tier_2:           { label: '48-72 hrs',  color: '#EA580C', sub: '₦200/day + return imminent' },
  return_eligible:  { label: '>72 hrs',    color: '#DC2626', sub: 'Return triggered' },
};

const TABS: Array<{ key: TierKey; label: string }> = [
  { key: 'all',             label: 'All' },
  { key: 'tier_1',          label: '24-48h' },
  { key: 'tier_2',          label: '48-72h' },
  { key: 'return_eligible', label: '>72h' },
];

const fmtNgn = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function PartnerStorageScreen() {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { user } = useAuth();

  const [items,      setItems]      = useState<Overstay[]>([]);
  const [tab,        setTab]        = useState<TierKey>('all');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const storeId = user?.partnerStoreId ?? '';

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    try {
      const list = await partnerApi.storeOverstays(storeId);
      setItems(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = tab === 'all' ? items : items.filter(i => i.tier === tab);
  const totalAccrued = items.reduce((s, i) => s + (i.storageFeesAccruedNgn ?? 0), 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F5F5F0' }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>
        <Text style={styles.title}>Storage Fees</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Total accrued */}
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>OVERSTAY FEES THIS PERIOD</Text>
        <Text style={styles.summaryAmount}>{fmtNgn(totalAccrued)}</Text>
        <Text style={styles.summarySub}>
          Across {items.length} package{items.length === 1 ? '' : 's'} that have crossed the 24-hour free window.
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map(t => {
          const count = t.key === 'all'
            ? items.length
            : items.filter(i => i.tier === t.key).length;
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
              {count > 0 && (
                <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color="#3A7BD5" style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="Clock" size={32} color="#D1D5DB" />
          <Text style={styles.emptyText}>
            {tab === 'all'
              ? 'No overstayed packages right now — everything is within the 24h free window.'
              : 'No packages in this tier.'}
          </Text>
        </View>
      ) : (
        filtered.map(item => {
          const meta = TIER_META[item.tier] ?? { label: item.tier, color: '#9CA3AF', sub: '' };
          return (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemTop}>
                <View style={[styles.tierIcon, { backgroundColor: meta.color + '18' }]}>
                  <Icon name="Clock" size={16} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recipientName}>{item.recipientName}</Text>
                  <Text style={styles.dropCode}>{item.dropCode}</Text>
                </View>
                <Text style={[styles.tierBadge, { color: meta.color, borderColor: meta.color }]}>
                  {meta.label}
                </Text>
              </View>

              <View style={styles.itemMid}>
                <View style={styles.midItem}>
                  <Text style={styles.midLabel}>HOURS IN STORE</Text>
                  <Text style={styles.midValue}>{Math.floor(item.hoursInStore)}h</Text>
                </View>
                <View style={styles.midDivider} />
                <View style={styles.midItem}>
                  <Text style={styles.midLabel}>WEIGHT</Text>
                  <Text style={styles.midValue}>{item.weightKg} kg</Text>
                </View>
                <View style={styles.midDivider} />
                <View style={styles.midItem}>
                  <Text style={styles.midLabel}>FEES ACCRUED</Text>
                  <Text style={[styles.midValue, { color: meta.color }]}>{fmtNgn(item.storageFeesAccruedNgn)}</Text>
                </View>
              </View>

              <Text style={[styles.tierSub, { color: meta.color }]}>{meta.sub}</Text>
            </View>
          );
        })
      )}

      <View style={styles.footnote}>
        <Icon name="Info" size={12} color="#9CA3AF" />
        <Text style={styles.footnoteText}>
          Storage fees accrue daily at 1 AM via automated job. Sender is billed when collected or returned.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content:    { padding: 16, gap: 16 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },

  summary:    { backgroundColor: '#0F2B4C', borderRadius: 16, padding: 20 },
  summaryLabel:{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  summaryAmount:{ color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 6 },
  summarySub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6 },

  tabRow:     { flexDirection: 'row', gap: 6 },
  tab:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  tabActive:  { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  tabLabel:   { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  tabLabelActive:{ color: '#fff' },
  tabBadge:   { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeActive:{ backgroundColor: 'rgba(255,255,255,0.2)' },
  tabBadgeText:{ fontSize: 10, fontWeight: '700', color: '#6B7280' },
  tabBadgeTextActive:{ color: '#fff' },

  empty:      { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyText:  { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingHorizontal: 24 },

  itemCard:   { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  itemTop:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tierIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recipientName:{ fontSize: 14, fontWeight: '700', color: '#0F2B4C' },
  dropCode:   { fontSize: 11, color: '#6B7280', fontFamily: 'monospace', marginTop: 2 },
  tierBadge:  { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  itemMid:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, paddingVertical: 10 },
  midItem:    { flex: 1, alignItems: 'center', gap: 2 },
  midDivider: { width: 1, backgroundColor: '#E5E7EB', alignSelf: 'stretch' },
  midLabel:   { fontSize: 9, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 },
  midValue:   { fontSize: 14, fontWeight: '700', color: '#0F2B4C' },
  tierSub:    { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  footnote:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  footnoteText:{ fontSize: 11, color: '#9CA3AF', flex: 1, lineHeight: 15 },
});
