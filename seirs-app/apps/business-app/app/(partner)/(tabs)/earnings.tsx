import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';

import { naira } from '@/utils/money';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

const PERIODS = ['week', 'month'] as const;
type Period = typeof PERIODS[number];


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
  const router = useRouter();
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
        <Text style={[styles.heading, { color: colors.text }]}>{tx('auto.earnings.earnings', 'Earnings')}</Text>
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
                  {p === 'week' ? tx9('auto.earnings.thisWeek', 'This Week') : tx9('auto.billing.thisMonth', 'This Month')}
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
              <Text style={[styles.summaryLabel, { color: colors.textThird }]}>{tx('auto.earnings.totalEarned', 'Total Earned')}</Text>
              <Text style={[styles.summaryAmount, { color: colors.text }]}>{naira(data?.totalEarnings ?? 0)}</Text>
              <View style={styles.summaryMeta}>
                <Icon name="Package" size={12} color={colors.textThird} />
                <Text style={[styles.summaryMetaText, { color: colors.textThird }]}>{data?.totalPackages ?? 0} packages</Text>
              </View>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.summaryLabel, { color: colors.textThird }]}>{tx('auto.earnings.perPackage', 'Per Package')}</Text>
              {/* The handling fee is tiered by weight and split with the
                  platform, so a single "flat rate" figure told partners
                  they keep the whole fee when they keep a share of it
                  (found on device 2026-08-19). Show the range and be
                  explicit that it is their share. */}
              <Text style={[styles.summaryAmount, { color: colors.text, fontSize: 18 }]}>
                {naira(data?.perPackageRate ?? 0)}
              </Text>
              <Text style={[styles.summaryMetaText, { color: colors.textThird }]}>
                {tr('auto.earnings.yourShareByWeight', 'your share, by weight')}
              </Text>
            </View>
          </View>

          <View style={[styles.payoutCard, { backgroundColor: colors.primaryLight, borderColor: colors.accent + '40' }]}>
            <View style={styles.payoutLeft}>
              <Icon name="Wallet" size={20} color={colors.accent} />
              <View>
                <Text style={[styles.payoutLabel, { color: colors.textSecond }]}>{tx('auto.earnings.pendingPayout', 'Pending Payout')}</Text>
                <Text style={[styles.payoutAmount, { color: colors.text }]}>{naira(data?.pendingPayout ?? 0)}</Text>
              </View>
            </View>
            <View style={styles.payoutRight}>
              <Text style={[styles.payoutDateLabel, { color: colors.textThird }]}>{tx('auto.earnings.nextTransfer', 'Next Transfer')}</Text>
              <Text style={[styles.payoutDate, { color: colors.text }]}>{data?.nextPayoutDate ?? tx9('auto.earnings.monday', 'Monday')}</Text>
            </View>
          </View>

          {/*
            Where the money actually goes (founder 2026-09-05).

            The card above says an amount and a day and stops there, so a
            shop reading "Next Transfer: Monday" had no way to see which
            account it lands in, and no way to correct it if the account
            was wrong. payout-account.tsx has existed for a while and was
            reachable only from the drawer, which is the wrong place to
            put it: the question is always asked here, looking at money
            that is about to move.
          */}
          <Pressable
            onPress={() => router.push('/(partner)/payout-account' as any)}
            style={({ pressed }) => [
              styles.destRow,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Icon name="Banknote" size={18} color={colors.textSecond} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.destLabel, { color: colors.textSecond }]}>{tr('auto.earnings.paidInto', 'PAID INTO')}</Text>
              <Text style={[styles.destValue, { color: colors.text }]}>
                {(data as any)?.payoutAccountLabel ?? tx9('auto.earnings.yourPayoutAccount', 'Your payout account')}
              </Text>
            </View>
            <Text style={[styles.destAction, { color: colors.primary }]}>{tx('auto.earnings.change', 'Change')}</Text>
            <Icon name="ChevronRight" size={16} color={colors.textThird} />
          </Pressable>

          {days.length > 0 && (
            <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.chartTitle, { color: colors.text }]}>{tx('auto.earnings.dailyEarnings', 'Daily Earnings')}</Text>
              <View style={styles.chart}>
                {days.map((d) => {
                  const pct = (d.amount / maxAmt) * 100;
                  const label = new Date(d.date).toLocaleDateString('en-NG', { weekday: 'short' });
                  return (
                    <View key={d.date} style={styles.bar}>
                      <Text style={[styles.barAmt, { color: colors.textThird }]}>{d.amount > 0 ? naira(d.amount).replace('₦', '') : ''}</Text>
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

          <View style={[styles.sectionHeader, styles.sectionHeaderRow]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{tx('auto.earnings.payoutHistory', 'Payout History')}</Text>
            {/* The way out to a statement you can hand an accountant.
                The windowed route and its PDF have existed since 10 and
                19 August and were reachable from nowhere, so a shop
                asking which packages made up a figure had no answer
                inside the app (2026-09-02). */}
            <Pressable onPress={() => router.push('/(partner)/statement' as any)} style={styles.stmtLink}>
              <Text style={[styles.stmtLinkText, { color: colors.primary }]}>{tx('auto.earnings.fullStatement', 'Full statement')}</Text>
              <Icon name="ChevronRight" size={16} color={colors.primary} />
            </Pressable>
          </View>

          {(data?.payouts ?? []).length === 0 ? (
            <View style={styles.empty}>
              <Icon name="Banknote" size={36} color={colors.textThird} />
              <Text style={[styles.emptyText, { color: colors.textThird }]}>{tx('auto.earnings.noPayoutsYet', 'No payouts yet')}</Text>
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
                    <Text style={[styles.payoutRowAmt, { color: colors.text }]}>{naira(pay.amount)}</Text>
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
  // Only this section header carries a trailing action, so the row
  // layout is additive rather than applied to every other one.
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stmtLink:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stmtLinkText: { fontSize: 13, fontWeight: '700' },
  header:          { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  heading:         { fontSize: 20, fontWeight: '800' },
  periodToggle:    { flexDirection: 'row', gap: 8 },
  periodBtn:       { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  periodBtnText:   { fontSize: 13, fontWeight: '600' },

  summaryRow:      { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 0 },
  summaryCard:     { flex: 1, borderRadius: 14, padding: 16, borderWidth: 1 },
  summaryLabel:    { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  summaryAmount:   { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  summaryMeta:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summaryMetaText: { fontSize: 12 },

  payoutCard:      {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 14, margin: 16, padding: 16, borderWidth: 1,
  },
  payoutLeft:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payoutLabel:     { fontSize: 12, marginBottom: 2 },
  payoutAmount:    { fontSize: 18, fontWeight: '800' },
  payoutRight:     { alignItems: 'flex-end' },
  payoutDateLabel: { fontSize: 11, marginBottom: 2 },
  payoutDate:      { fontSize: 14, fontWeight: '700' },

  // Where the payout lands, sitting directly under the amount and the day
  // rather than buried in the drawer.
  destRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14,
                     borderWidth: 1, padding: 14, marginHorizontal: 16, marginBottom: 16 },
  destLabel:       { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  destValue:       { fontSize: 14, fontWeight: '600', marginTop: 2 },
  destAction:      { fontSize: 13, fontWeight: '700' },
  chartCard:       { borderRadius: 14, margin: 16, marginTop: 0, padding: 16, borderWidth: 1 },
  chartTitle:      { fontSize: 14, fontWeight: '700', marginBottom: 16 },
  chart:           { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6 },
  bar:             { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 },
  barAmt:          { fontSize: 8, textAlign: 'center' },
  barTrack:        { flex: 1, width: '100%', justifyContent: 'flex-end' },
  barFill:         { borderRadius: 4, width: '100%' },
  barLabel:        { fontSize: 10, textAlign: 'center' },

  sectionHeader:   { paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle:    { fontSize: 15, fontWeight: '700' },

  empty:           { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText:       { fontSize: 15 },

  payoutRow:       {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, marginHorizontal: 16, marginBottom: 10, padding: 14, borderWidth: 1,
  },
  payoutIcon:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  payoutPeriod:    { fontSize: 14, fontWeight: '700' },
  payoutDate2:     { fontSize: 12, marginTop: 2 },
  payoutRowRight:  { alignItems: 'flex-end', gap: 4 },
  payoutRowAmt:    { fontSize: 15, fontWeight: '800' },
  statusBadge:     { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText:      { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
