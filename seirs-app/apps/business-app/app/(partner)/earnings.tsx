import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';

const PERIODS = ['week', 'month'] as const;
type Period = typeof PERIODS[number];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

interface EarningsDay {
  date: string;
  amount: number;
  packages: number;
}

interface Payout {
  id:        string;
  amount:    number;
  status:    'paid' | 'pending' | 'processing';
  period:    string;
  paidAt?:   string;
}

interface EarningsData {
  totalEarnings:    number;
  totalPackages:    number;
  pendingPayout:    number;
  nextPayoutDate:   string;
  perPackageRate:   number;
  days:             EarningsDay[];
  payouts:          Payout[];
}

const PAYOUT_COLOR: Record<string, string> = {
  paid:       '#16A34A',
  processing: '#D97706',
  pending:    '#9CA3AF',
};

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const [period,  setPeriod]  = useState<Period>('week');
  const [data,    setData]    = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    partnerApi.earnings(period)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const days    = data?.days ?? [];
  const maxAmt  = days.length ? Math.max(...days.map((d) => d.amount), 1) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.heading}>Earnings</Text>
        <View style={styles.periodToggle}>
          {PERIODS.map((p) => (
            <Pressable
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
                {p === 'week' ? 'This Week' : 'This Month'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color="#3A7BD5" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Summary cards */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { flex: 2 }]}>
              <Text style={styles.summaryLabel}>Total Earned</Text>
              <Text style={styles.summaryAmount}>{fmt(data?.totalEarnings ?? 0)}</Text>
              <View style={styles.summaryMeta}>
                <Icon name="Package" size={12} color="#9CA3AF" />
                <Text style={styles.summaryMetaText}>{data?.totalPackages ?? 0} packages</Text>
              </View>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Per Package</Text>
              <Text style={[styles.summaryAmount, { fontSize: 18 }]}>{fmt(data?.perPackageRate ?? 0)}</Text>
              <Text style={styles.summaryMetaText}>flat rate</Text>
            </View>
          </View>

          {/* Pending payout card */}
          <View style={styles.payoutCard}>
            <View style={styles.payoutLeft}>
              <Icon name="Wallet" size={20} color="#3A7BD5" />
              <View>
                <Text style={styles.payoutLabel}>Pending Payout</Text>
                <Text style={styles.payoutAmount}>{fmt(data?.pendingPayout ?? 0)}</Text>
              </View>
            </View>
            <View style={styles.payoutRight}>
              <Text style={styles.payoutDateLabel}>Next Transfer</Text>
              <Text style={styles.payoutDate}>{data?.nextPayoutDate ?? 'Monday'}</Text>
            </View>
          </View>

          {/* Bar chart */}
          {days.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Daily Earnings</Text>
              <View style={styles.chart}>
                {days.map((d) => {
                  const pct = (d.amount / maxAmt) * 100;
                  const label = new Date(d.date).toLocaleDateString('en-NG', { weekday: 'short' });
                  return (
                    <View key={d.date} style={styles.bar}>
                      <Text style={styles.barAmt}>{d.amount > 0 ? fmt(d.amount).replace('₦', '') : ''}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { height: `${Math.max(pct, 4)}%` as any }]} />
                      </View>
                      <Text style={styles.barLabel}>{label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Payout history */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payout History</Text>
          </View>

          {(data?.payouts ?? []).length === 0 ? (
            <View style={styles.empty}>
              <Icon name="Banknote" size={36} color="#D1D5DB" />
              <Text style={styles.emptyText}>No payouts yet</Text>
            </View>
          ) : (
            (data?.payouts ?? []).map((pay) => {
              const color = PAYOUT_COLOR[pay.status] ?? '#9CA3AF';
              return (
                <View key={pay.id} style={styles.payoutRow}>
                  <View style={[styles.payoutIcon, { backgroundColor: color + '18' }]}>
                    <Icon
                      name={pay.status === 'paid' ? 'CheckCircle2' : pay.status === 'processing' ? 'Clock' : 'Circle'}
                      size={18}
                      color={color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payoutPeriod}>{pay.period}</Text>
                    {pay.paidAt && (
                      <Text style={styles.payoutDate2}>
                        {new Date(pay.paidAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  <View style={styles.payoutRowRight}>
                    <Text style={styles.payoutRowAmt}>{fmt(pay.amount)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: color + '18' }]}>
                      <Text style={[styles.statusText, { color }]}>{pay.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:          {
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  heading:         { fontSize: 20, fontWeight: '800', color: '#0F2B4C' },
  periodToggle:    { flexDirection: 'row', gap: 8 },
  periodBtn:       { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F5F5F0', borderWidth: 1, borderColor: '#E5E7EB' },
  periodBtnActive: { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  periodBtnText:   { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  periodBtnTextActive: { color: '#fff' },

  summaryRow:      { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 0 },
  summaryCard:     {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  summaryLabel:    { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  summaryAmount:   { fontSize: 22, fontWeight: '800', color: '#0F2B4C', marginBottom: 6 },
  summaryMeta:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryMetaText: { fontSize: 11, color: '#9CA3AF' },

  payoutCard:      {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#EBF3FF', borderRadius: 14, margin: 16,
    padding: 16, borderWidth: 1, borderColor: '#BFDBFE',
  },
  payoutLeft:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payoutLabel:     { fontSize: 11, color: '#6B7280', marginBottom: 2 },
  payoutAmount:    { fontSize: 18, fontWeight: '800', color: '#0F2B4C' },
  payoutRight:     { alignItems: 'flex-end' },
  payoutDateLabel: { fontSize: 10, color: '#9CA3AF', marginBottom: 2 },
  payoutDate:      { fontSize: 13, fontWeight: '700', color: '#0F2B4C' },

  chartCard:       { backgroundColor: '#fff', borderRadius: 14, margin: 16, marginTop: 0, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  chartTitle:      { fontSize: 13, fontWeight: '700', color: '#0F2B4C', marginBottom: 16 },
  chart:           { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6 },
  bar:             { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 },
  barAmt:          { fontSize: 8, color: '#9CA3AF', textAlign: 'center' },
  barTrack:        { flex: 1, width: '100%', justifyContent: 'flex-end' },
  barFill:         { backgroundColor: '#3A7BD5', borderRadius: 4, width: '100%' },
  barLabel:        { fontSize: 9, color: '#9CA3AF', textAlign: 'center' },

  sectionHeader:   { paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle:    { fontSize: 15, fontWeight: '700', color: '#0F2B4C' },

  empty:           { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText:       { fontSize: 14, color: '#9CA3AF' },

  payoutRow:       {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 16, marginBottom: 10,
    padding: 14, borderWidth: 1, borderColor: '#F3F4F6',
  },
  payoutIcon:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  payoutPeriod:    { fontSize: 13, fontWeight: '700', color: '#0F2B4C' },
  payoutDate2:     { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  payoutRowRight:  { alignItems: 'flex-end', gap: 4 },
  payoutRowAmt:    { fontSize: 14, fontWeight: '800', color: '#0F2B4C' },
  statusBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText:      { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
});
