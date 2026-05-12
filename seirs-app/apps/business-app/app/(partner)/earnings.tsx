import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';

const PERIODS = ['week', 'month'] as const;
type Period = typeof PERIODS[number];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

interface EarningsDay { date: string; amount: number; packages: number; }
interface Payout { id: string; amount: number; status: 'paid' | 'pending' | 'processing'; period: string; paidAt?: string; }
interface EarningsData {
  totalEarnings: number; totalPackages: number; pendingPayout: number;
  nextPayoutDate: string; perPackageRate: number;
  days: EarningsDay[]; payouts: Payout[];
}

const PAYOUT_COLOR: Record<string, string> = {
  paid: '#16A34A', processing: '#D97706', pending: '#9CA3AF',
};

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Earnings</Text>
        <View style={styles.periodToggle}>
          {PERIODS.map((p) => {
            const active = period === p;
            return (
              <Pressable
                key={p}
                style={[
                  styles.periodBtn,
                  { backgroundColor: colors.background, borderColor: colors.border },
                  active && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[styles.periodBtnText, { color: colors.textSecond }, active && { color: '#fff' }]}>
                  {p === 'week' ? 'This Week' : 'This Month'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { flex: 2, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.summaryLabel, { color: colors.textThird }]}>Total Earned</Text>
              <Text style={[styles.summaryAmount, { color: colors.text }]}>{fmt(data?.totalEarnings ?? 0)}</Text>
              <View style={styles.summaryMeta}>
                <Icon name="Package" size={12} color={colors.textThird} />
                <Text style={[styles.summaryMetaText, { color: colors.textThird }]}>{data?.totalPackages ?? 0} packages</Text>
              </View>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.summaryLabel, { color: colors.textThird }]}>Per Package</Text>
              <Text style={[styles.summaryAmount, { color: colors.text, fontSize: 18 }]}>{fmt(data?.perPackageRate ?? 0)}</Text>
              <Text style={[styles.summaryMetaText, { color: colors.textThird }]}>flat rate</Text>
            </View>
          </View>

          <View style={[styles.payoutCard, { backgroundColor: colors.primaryLight, borderColor: colors.accent + '40' }]}>
            <View style={styles.payoutLeft}>
              <Icon name="Wallet" size={20} color={colors.accent} />
              <View>
                <Text style={[styles.payoutLabel, { color: colors.textSecond }]}>Pending Payout</Text>
                <Text style={[styles.payoutAmount, { color: colors.text }]}>{fmt(data?.pendingPayout ?? 0)}</Text>
              </View>
            </View>
            <View style={styles.payoutRight}>
              <Text style={[styles.payoutDateLabel, { color: colors.textThird }]}>Next Transfer</Text>
              <Text style={[styles.payoutDate, { color: colors.text }]}>{data?.nextPayoutDate ?? 'Monday'}</Text>
            </View>
          </View>

          {days.length > 0 && (
            <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.chartTitle, { color: colors.text }]}>Daily Earnings</Text>
              <View style={styles.chart}>
                {days.map((d) => {
                  const pct = (d.amount / maxAmt) * 100;
                  const label = new Date(d.date).toLocaleDateString('en-NG', { weekday: 'short' });
                  return (
                    <View key={d.date} style={styles.bar}>
                      <Text style={[styles.barAmt, { color: colors.textThird }]}>{d.amount > 0 ? fmt(d.amount).replace('₦', '') : ''}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { height: `${Math.max(pct, 4)}%` as any, backgroundColor: colors.accent }]} />
                      </View>
                      <Text style={[styles.barLabel, { color: colors.textThird }]}>{label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Payout History</Text>
          </View>

          {(data?.payouts ?? []).length === 0 ? (
            <View style={styles.empty}>
              <Icon name="Banknote" size={36} color={colors.textThird} />
              <Text style={[styles.emptyText, { color: colors.textThird }]}>No payouts yet</Text>
            </View>
          ) : (
            (data?.payouts ?? []).map((pay) => {
              const color = PAYOUT_COLOR[pay.status] ?? colors.textThird;
              return (
                <View key={pay.id} style={[styles.payoutRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.payoutIcon, { backgroundColor: color + '18' }]}>
                    <Icon
                      name={pay.status === 'paid' ? 'CheckCircle2' : pay.status === 'processing' ? 'Clock' : 'Circle'}
                      size={18}
                      color={color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.payoutPeriod, { color: colors.text }]}>{pay.period}</Text>
                    {pay.paidAt && (
                      <Text style={[styles.payoutDate2, { color: colors.textThird }]}>
                        {new Date(pay.paidAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  <View style={styles.payoutRowRight}>
                    <Text style={[styles.payoutRowAmt, { color: colors.text }]}>{fmt(pay.amount)}</Text>
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
  header:          { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  heading:         { fontSize: 20, fontWeight: '800' },
  periodToggle:    { flexDirection: 'row', gap: 8 },
  periodBtn:       { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  periodBtnText:   { fontSize: 12, fontWeight: '600' },

  summaryRow:      { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 0 },
  summaryCard:     { flex: 1, borderRadius: 14, padding: 16, borderWidth: 1 },
  summaryLabel:    { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  summaryAmount:   { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  summaryMeta:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryMetaText: { fontSize: 11 },

  payoutCard:      {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 14, margin: 16, padding: 16, borderWidth: 1,
  },
  payoutLeft:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payoutLabel:     { fontSize: 11, marginBottom: 2 },
  payoutAmount:    { fontSize: 18, fontWeight: '800' },
  payoutRight:     { alignItems: 'flex-end' },
  payoutDateLabel: { fontSize: 10, marginBottom: 2 },
  payoutDate:      { fontSize: 13, fontWeight: '700' },

  chartCard:       { borderRadius: 14, margin: 16, marginTop: 0, padding: 16, borderWidth: 1 },
  chartTitle:      { fontSize: 13, fontWeight: '700', marginBottom: 16 },
  chart:           { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6 },
  bar:             { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 },
  barAmt:          { fontSize: 8, textAlign: 'center' },
  barTrack:        { flex: 1, width: '100%', justifyContent: 'flex-end' },
  barFill:         { borderRadius: 4, width: '100%' },
  barLabel:        { fontSize: 9, textAlign: 'center' },

  sectionHeader:   { paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle:    { fontSize: 15, fontWeight: '700' },

  empty:           { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText:       { fontSize: 14 },

  payoutRow:       {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, marginHorizontal: 16, marginBottom: 10, padding: 14, borderWidth: 1,
  },
  payoutIcon:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  payoutPeriod:    { fontSize: 13, fontWeight: '700' },
  payoutDate2:     { fontSize: 11, marginTop: 2 },
  payoutRowRight:  { alignItems: 'flex-end', gap: 4 },
  payoutRowAmt:    { fontSize: 14, fontWeight: '800' },
  statusBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText:      { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
});
