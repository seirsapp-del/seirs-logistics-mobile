import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell, TrendingUp, ArrowUpCircle, Landmark, Ribbon,
  ArrowDownCircle, Receipt, ChevronRight, Target, Calendar,
} from 'lucide-react-native';
import { HamburgerButton } from '@/components/HamburgerButton';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import {
  MOCK_DRIVER, MOCK_DRIVER_EARNINGS, MOCK_DRIVER_DELIVERIES, WEEKLY_EARNINGS,
} from '@/constants/driverMockData';

type Period = 'today' | 'week' | 'month';

const GOAL_TARGET = 50000;

export default function EarningsScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [period, setPeriod] = useState<Period>('week');

  const totalEarned = MOCK_DRIVER_DELIVERIES
    .filter(d => d.status === 'delivered')
    .reduce((s, d) => s + d.driverEarnings, 0);

  const weekTotal  = WEEKLY_EARNINGS.reduce((s, d) => s + d.amount, 0);
  const todayTotal = WEEKLY_EARNINGS.find(d => d.day === 'Today')?.amount ?? WEEKLY_EARNINGS[WEEKLY_EARNINGS.length - 1].amount;
  const maxBar     = Math.max(...WEEKLY_EARNINGS.map(d => d.amount));
  const goalPct    = Math.min((weekTotal / GOAL_TARGET) * 100, 100);

  const walletGradient: [string, string] = isDark
    ? ['#161B22', '#0D1117']
    : ['#0F2B4C', '#1A3A63'];

  const displayAmount = period === 'today' ? todayTotal : period === 'week' ? weekTotal : totalEarned;
  const displayLabel  = period === 'today' ? "Today's Earnings" : period === 'week' ? 'This Week' : 'All Time';

  const TABS: { id: Period; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week',  label: 'Week'  },
    { id: 'month', label: 'Month' },
  ];

  const STATS = [
    { label: 'This Week',    value: `₦${weekTotal.toLocaleString()}`,  Icon: Calendar,   color: theme.primary },
    { label: 'Avg / Trip',   value: `₦${Math.round(totalEarned / Math.max(MOCK_DRIVER.totalTrips, 1))}`, Icon: TrendingUp, color: '#16A34A' },
    { label: 'Total Trips',  value: MOCK_DRIVER.totalTrips.toLocaleString(), Icon: Receipt,    color: '#8B5CF6' },
    { label: 'Total Earned', value: `₦${(MOCK_DRIVER.totalEarned / 1_000_000).toFixed(1)}M`, Icon: Ribbon, color: '#FFBE0B' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        <View style={styles.pageHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <HamburgerButton />
            <Text style={[styles.pageTitle, { color: theme.text }]}>Earnings</Text>
          </View>
          <Pressable style={[styles.headerBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.push('/(driver)/notifications' as any)}>
            <Bell size={20} color={theme.text} strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* Period tabs */}
        <View style={[styles.tabRow, { backgroundColor: theme.surfaceSecond }]}>
          {TABS.map(t => (
            <Pressable
              key={t.id}
              style={[styles.tab, period === t.id && { backgroundColor: theme.surface }, period === t.id && Shadows.xs]}
              onPress={() => setPeriod(t.id)}
            >
              <Text style={[styles.tabText, { color: period === t.id ? theme.primary : theme.textSecond }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Wallet card */}
        <View style={[styles.cardWrap, Shadows.md]}>
          <LinearGradient colors={walletGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.walletCard}>
            <View style={styles.walletTop}>
              <View>
                <Text style={styles.walletLabel}>{displayLabel}</Text>
                <Text style={styles.walletAmount}>₦{displayAmount.toLocaleString()}</Text>
              </View>
              <View style={styles.walletRight}>
                <View style={[styles.tierChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Ribbon size={12} color="#fff" strokeWidth={1.75} />
                  <Text style={styles.tierChipText}>{MOCK_DRIVER.tier}</Text>
                </View>
                <Text style={styles.balanceLabel}>Balance ₦{MOCK_DRIVER.balance.toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.walletActions}>
              <Pressable style={styles.walletBtn} onPress={() => router.push('/(driver)/withdrawal' as any)}>
                <ArrowUpCircle size={16} color="#fff" strokeWidth={1.75} />
                <Text style={styles.walletBtnText}>Withdraw</Text>
              </Pressable>
              <Pressable style={styles.walletBtn} onPress={() => router.push('/(driver)/add-bank' as any)}>
                <Landmark size={16} color="#fff" strokeWidth={1.75} />
                <Text style={styles.walletBtnText}>Bank Accounts</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>

        {/* Goal tracker */}
        <View style={[styles.goalCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={styles.goalTop}>
            <View style={styles.goalLabel}>
              <Target size={18} color="#D97706" strokeWidth={1.75} />
              <Text style={[styles.goalTitle, { color: theme.text }]}>Weekly Goal</Text>
            </View>
            <Text style={[styles.goalPct, { color: goalPct >= 100 ? '#16A34A' : '#D97706' }]}>{Math.round(goalPct)}%</Text>
          </View>
          <View style={[styles.goalTrack, { backgroundColor: theme.surfaceSecond }]}>
            <View style={[styles.goalFill, { width: `${goalPct}%`, backgroundColor: goalPct >= 100 ? '#16A34A' : '#D97706' }]} />
          </View>
          <View style={styles.goalBottom}>
            <Text style={[styles.goalCurrent, { color: theme.textSecond }]}>₦{weekTotal.toLocaleString()}</Text>
            <Text style={[styles.goalTarget,  { color: theme.textThird }]}>Target ₦{GOAL_TARGET.toLocaleString()}</Text>
          </View>
          {goalPct >= 100 && (
            <View style={[styles.goalBanner, { backgroundColor: '#16A34A15' }]}>
              <Text style={[styles.goalBannerText, { color: '#16A34A' }]}>Goal reached! Keep going to earn bonuses.</Text>
            </View>
          )}
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {STATS.map(s => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <View style={[styles.statIcon, { backgroundColor: s.color + '18' }]}>
                <s.Icon size={18} color={s.color} strokeWidth={1.75} />
              </View>
              <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textThird }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Weekly chart */}
        <View style={[styles.chartCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>This Week</Text>
            <Text style={[styles.chartTotal, { color: '#16A34A' }]}>₦{weekTotal.toLocaleString()}</Text>
          </View>
          <View style={styles.barRow}>
            {WEEKLY_EARNINGS.map(d => {
              const pct   = (d.amount / maxBar) * 100;
              const isMax = d.amount === maxBar;
              return (
                <View key={d.day} style={styles.barCol}>
                  <Text style={[styles.barAmt, { color: isMax ? theme.primary : theme.textThird }]}>
                    {d.amount >= 1000 ? `${(d.amount / 1000).toFixed(0)}k` : d.amount}
                  </Text>
                  <View style={[styles.barTrack, { backgroundColor: theme.surfaceSecond }]}>
                    <View style={[styles.barFill, { height: `${Math.max(pct, 8)}%`, backgroundColor: isMax ? theme.primary : theme.primary + '45' }]} />
                  </View>
                  <Text style={[styles.barDay, { color: theme.textSecond }]}>{d.day}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Recent transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Recent Transactions</Text>
            <Pressable onPress={() => {}}>
              <Text style={[styles.seeAll, { color: theme.primary }]}>See all</Text>
            </Pressable>
          </View>

          {MOCK_DRIVER_EARNINGS.slice(0, 5).map(tx => {
            const isCredit = tx.type === 'credit';
            const amtColor = isCredit ? '#16A34A' : '#EF4444';
            return (
              <Pressable
                key={tx.id}
                style={[styles.txRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
                onPress={() => router.push({ pathname: '/(driver)/transaction/[id]', params: { id: tx.id } })}
              >
                <View style={[styles.txIcon, { backgroundColor: amtColor + '18' }]}>
                  {isCredit
                    ? <ArrowDownCircle size={22} color={amtColor} strokeWidth={1.75} />
                    : <ArrowUpCircle   size={22} color={amtColor} strokeWidth={1.75} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txLabel, { color: theme.text }]}>{tx.label}</Text>
                  <Text style={[styles.txDate,  { color: theme.textSecond }]}>{tx.date}</Text>
                </View>
                <Text style={[styles.txAmount, { color: amtColor }]}>
                  {isCredit ? '+' : '−'}₦{tx.amount.toLocaleString()}
                </Text>
                <ChevronRight size={14} color={theme.textThird} strokeWidth={1.75} style={{ marginLeft: 4 }} />
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll:      { paddingBottom: Spacing.xl },
  pageHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  pageTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any },
  headerBtn:   { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

  tabRow:  { flexDirection: 'row', marginHorizontal: Spacing.md, borderRadius: Radius.xl, padding: 4, marginBottom: Spacing.md },
  tab:     { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.lg },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },

  cardWrap:    { marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, overflow: 'hidden' },
  walletCard:  { padding: Spacing.lg, gap: Spacing.md },
  walletTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  walletRight: { alignItems: 'flex-end', gap: 6 },
  walletLabel: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm },
  walletAmount:{ color: '#fff', fontSize: FontSize['3xl'], fontWeight: FontWeight.bold as any, letterSpacing: -1, marginTop: 4 },
  tierChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  tierChipText:{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  balanceLabel:{ color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs },
  walletActions:{ flexDirection: 'row', gap: Spacing.sm },
  walletBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: Spacing.sm, borderRadius: Radius.xl },
  walletBtnText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },

  goalCard:    { marginHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md, gap: Spacing.sm },
  goalTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalLabel:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  goalTitle:   { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  goalPct:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any },
  goalTrack:   { height: 8, borderRadius: 4, overflow: 'hidden' },
  goalFill:    { height: 8, borderRadius: 4 },
  goalBottom:  { flexDirection: 'row', justifyContent: 'space-between' },
  goalCurrent: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  goalTarget:  { fontSize: FontSize.sm },
  goalBanner:  { padding: Spacing.sm, borderRadius: Radius.md },
  goalBannerText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium as any, textAlign: 'center' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  statCard:  { width: '47%', padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, gap: 6 },
  statIcon:  { width: 36, height: 36, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },
  statLabel: { fontSize: FontSize.xs },

  chartCard:   { marginHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  cardTitle:   { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  chartTotal:  { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  barRow:      { flexDirection: 'row', gap: Spacing.sm, height: 120 },
  barCol:      { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  barAmt:      { fontSize: 9, fontWeight: FontWeight.semibold as any },
  barTrack:    { flex: 1, width: '100%', justifyContent: 'flex-end', borderRadius: 4 },
  barFill:     { width: '100%', borderRadius: 4 },
  barDay:      { fontSize: FontSize.xs },

  section:       { paddingHorizontal: Spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  seeAll:        { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  txRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.sm },
  txIcon:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  txLabel:  { fontSize: FontSize.base, fontWeight: FontWeight.medium as any },
  txDate:   { fontSize: FontSize.xs, marginTop: 2 },
  txAmount: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
