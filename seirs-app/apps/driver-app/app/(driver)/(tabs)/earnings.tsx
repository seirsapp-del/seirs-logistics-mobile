import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell, TrendingUp, ArrowUpCircle, Landmark, Ribbon,
  ArrowDownCircle, Receipt, ChevronRight, Target, Calendar,
} from 'lucide-react-native';
import { HamburgerButton } from '@/components/HamburgerButton';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { earningsApi } from '@/services/api';
import { EarningsCalendar } from '@/components/EarningsCalendar';
import { naira, nairaShort } from '@/utils/money';

type Period = 'today' | 'week' | 'month';

// Default weekly target; each driver can set their own (founder note
// 2026-08-09: hard workers and high-demand regions outgrow a fixed
// number). Stored per device; purely motivational, no money attached.
const GOAL_DEFAULT = 50000;
const GOAL_STORAGE_KEY = 'seirs_weekly_goal_ngn';
// D-10.4: this used to be a fixed ['Mon'..'Sat','Today'] run laid over a
// ROLLING 7-day window, so on a Wednesday the bar labelled 'Sat' held
// Tuesday's money. Only correct if today happened to be Sunday. Labels are
// now derived from the same dates the buckets are built from: index 6 is
// today, index 0 is six days ago.
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
function rollingDayLabels(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (i === 6) { out.push('Today'); continue; }
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    out.push(WEEKDAY_SHORT[d.getDay()]);
  }
  return out;
}

export default function EarningsScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [period, setPeriod]         = useState<Period>('week');
  const [dashboard, setDashboard]   = useState<any | null>(null);
  const [history, setHistory]       = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [goalTarget, setGoalTarget] = useState(GOAL_DEFAULT);
  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const [goalDraft, setGoalDraft]   = useState('');

  useEffect(() => {
    AsyncStorage.getItem(GOAL_STORAGE_KEY)
      .then(v => { const n = Number(v); if (Number.isFinite(n) && n >= 1000) setGoalTarget(n); })
      .catch(() => {});
  }, []);

  const saveGoal = async () => {
    const n = parseInt(goalDraft.replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n >= 1000) {
      setGoalTarget(n);
      AsyncStorage.setItem(GOAL_STORAGE_KEY, String(n)).catch(() => {});
    }
    setGoalEditOpen(false);
  };

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([
        earningsApi.dashboard().catch(() => null),
        earningsApi.history().catch(() => [] as any[]),
      ]);
      setDashboard(d);
      setHistory(h ?? []);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  // Build a 7-day rolling earnings series from history. Falls back to a
  // flat zero series when there's no data yet.
  const dayTotals = (() => {
    const totals = Array(7).fill(0);
    const now = Date.now();
    for (const e of history) {
      const t = new Date(e.createdAt ?? e.earnedAt ?? e.deliveredAt ?? 0).getTime();
      if (!t) continue;
      const daysAgo = Math.floor((now - t) / 86400000);
      if (daysAgo < 0 || daysAgo > 6) continue;
      // Ledger rows carry driverNet; older shapes used driverEarnings/amount.
      totals[6 - daysAgo] += Number(e.driverNet ?? e.driverEarnings ?? e.amount ?? 0);
    }
    return totals;
  })();
  // D-4.1: the header figures come from the server, which sums the WHOLE
  // ledger. history is capped at 50 rows, so a driver past 50 trips in a
  // week saw an understated week and an understated today. The rolling
  // series below is still history-derived: it only shapes the bars.
  const rollingTotal   = dayTotals.reduce((s, n) => s + n, 0);
  const weekTotal      = Number(dashboard?.week?.earned  ?? rollingTotal);
  const todayTotal     = Number(dashboard?.today?.earned ?? dayTotals[6] ?? 0);
  const totalEarned    = Number(dashboard?.allTime?.earned ?? dashboard?.totalEarnings ?? 0);
  const totalTrips     = Number(dashboard?.allTime?.deliveries ?? dashboard?.totalTrips ?? 0);
  // Withdrawable = cleared ledger balance. The old field names
  // (pendingBalance/balance) don't exist on the earnings dashboard, so
  // this permanently displayed ₦0.
  const balance        = Number(dashboard?.available ?? dashboard?.pendingBalance ?? dashboard?.balance ?? 0);
  const maxBar         = Math.max(1, ...dayTotals);
  const dayLabels      = rollingDayLabels();
  const goalPct        = Math.min((weekTotal / goalTarget) * 100, 100);
  const recentEarnings = history.slice(0, 5);

  const walletGradient: [string, string] = isDark
    ? ['#161B22', '#0D1117']
    : ['#0F2B4C', '#1A3A63'];

  // Month = the real calendar month from the backend dashboard (founder
  // finding 2026-08-09: the Month tab was silently showing all-time).
  // All-time stays visible in the stats grid as "Total Earned".
  const monthTotal    = Number(dashboard?.month?.earned ?? 0);
  const displayAmount = period === 'today' ? todayTotal : period === 'week' ? weekTotal : monthTotal;
  const displayLabel  = period === 'today' ? "Today's Earnings" : period === 'week' ? 'This Week' : 'This Month';

  const TABS: { id: Period; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week',  label: 'Week'  },
    { id: 'month', label: 'Month' },
  ];

  const STATS = [
    { label: 'This Week',    value: naira(weekTotal),                                                                 Icon: Calendar,   color: theme.primary },
    { label: 'Avg / Trip',   value: naira(totalEarned / Math.max(totalTrips, 1)),                                     Icon: TrendingUp, color: '#16A34A' },
    // Trips are a count, not money: they stay whole.
    { label: 'Total Trips',  value: totalTrips.toLocaleString(),                                                      Icon: Receipt,    color: '#0F2B4C' },
    { label: 'Total Earned', value: nairaShort(totalEarned),                                                          Icon: Ribbon,     color: '#FFBE0B' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >

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
                <Text style={styles.walletAmount}>{naira(displayAmount)}</Text>
              </View>
              <View style={styles.walletRight}>
                {/* "Withdrawable", not "Available": the founder read the
                    old label as a duplicate of the This Week figure. This
                    is the cleared cash-out balance, a different number. */}
                <Text style={styles.balanceLabel}>Withdrawable {naira(balance)}</Text>
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

        {/* Goal tracker: personal target, tap to edit. Copy is honest:
            no bonus program exists yet, so the banner never promises one. */}
        <Pressable
          onPress={() => { setGoalDraft(String(goalTarget)); setGoalEditOpen(true); }}
          style={[styles.goalCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
        >
          <View style={styles.goalTop}>
            <View style={styles.goalLabel}>
              <Target size={18} color="#D97706" strokeWidth={1.75} />
              <Text style={[styles.goalTitle, { color: theme.text }]}>My Weekly Goal</Text>
            </View>
            <Text style={[styles.goalPct, { color: goalPct >= 100 ? '#16A34A' : '#D97706' }]}>{Math.round(goalPct)}%</Text>
          </View>
          <View style={[styles.goalTrack, { backgroundColor: theme.surfaceSecond }]}>
            <View style={[styles.goalFill, { width: `${goalPct}%`, backgroundColor: goalPct >= 100 ? '#16A34A' : '#D97706' }]} />
          </View>
          <View style={styles.goalBottom}>
            <Text style={[styles.goalCurrent, { color: theme.textSecond }]}>{naira(weekTotal)}</Text>
            <Text style={[styles.goalTarget,  { color: theme.textThird }]}>Target {naira(goalTarget)} · tap to change</Text>
          </View>
          {goalPct >= 100 && (
            <View style={[styles.goalBanner, { backgroundColor: '#16A34A15' }]}>
              <Text style={[styles.goalBannerText, { color: '#16A34A' }]}>
                Goal reached! You beat your {naira(goalTarget)} target. Raise it and see how far you can go.
              </Text>
            </View>
          )}
        </Pressable>

        {/* Goal edit modal */}
        <Modal visible={goalEditOpen} transparent animationType="fade" onRequestClose={() => setGoalEditOpen(false)}>
          {/* D-5.3: autoFocus raises the keyboard the moment this opens and
              the Save/Cancel row sits UNDER the input, so on Android the
              buttons were hidden behind the keyboard. */}
          <KeyboardAvoidingView
            style={styles.goalModalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={[styles.goalModalCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.goalModalTitle, { color: theme.text }]}>Set your weekly goal</Text>
              <Text style={[styles.goalModalSub, { color: theme.textSecond }]}>
                Your personal target. Set it to match your hustle; you can change it any time.
              </Text>
              <View style={[styles.goalInputWrap, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <Text style={{ fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: theme.text }}>₦</Text>
                <TextInput
                  style={[styles.goalInput, { color: theme.text }]}
                  keyboardType="numeric"
                  value={goalDraft}
                  onChangeText={v => setGoalDraft(v.replace(/\D/g, ''))}
                  placeholder="50000"
                  placeholderTextColor={theme.textThird}
                  autoFocus
                />
              </View>
              <View style={styles.goalModalBtns}>
                <Pressable style={[styles.goalModalBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => setGoalEditOpen(false)}>
                  <Text style={{ color: theme.text, fontWeight: FontWeight.semibold as any }}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.goalModalBtn, { backgroundColor: theme.primary }]} onPress={saveGoal}>
                  <Text style={{ color: '#fff', fontWeight: FontWeight.bold as any }}>Save</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

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
            {/* Rolling window, not the calendar week: the bars cover the last
                7 days including today, so the title must not say "This Week". */}
            <Text style={[styles.cardTitle, { color: theme.text }]}>Last 7 days</Text>
            <Text style={[styles.chartTotal, { color: '#16A34A' }]}>{naira(rollingTotal)}</Text>
          </View>
          <View style={styles.barRow}>
            {dayTotals.map((amount, i) => {
              const pct   = (amount / maxBar) * 100;
              const isMax = amount === maxBar && amount > 0;
              const day   = dayLabels[i];
              return (
                <View key={i} style={styles.barCol}>
                  <Text style={[styles.barAmt, { color: isMax ? theme.primary : theme.textThird }]}>
                    {amount >= 1000 ? `${(amount / 1000).toFixed(0)}k` : amount}
                  </Text>
                  <View style={[styles.barTrack, { backgroundColor: theme.surfaceSecond }]}>
                    <View style={[styles.barFill, { height: `${Math.max(pct, 8)}%`, backgroundColor: isMax ? theme.primary : theme.primary + '45' }]} />
                  </View>
                  <Text style={[styles.barDay, { color: theme.textSecond }]}>{day}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Earnings calendar (Klarna-style): per-day amounts, tap a day
            for the trip breakdown, arrows scroll back through history. */}
        <EarningsCalendar history={history} theme={theme} currentMonthTotal={dashboard?.month?.earned != null ? Number(dashboard.month.earned) : null} />

        {/* Recent transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Recent Transactions</Text>
            <Pressable onPress={() => router.push('/(driver)/(tabs)/history' as any)}>
              <Text style={[styles.seeAll, { color: theme.primary }]}>See all</Text>
            </Pressable>
          </View>

          {recentEarnings.length === 0 ? (
            <View style={{ paddingVertical: Spacing.lg, alignItems: 'center' }}>
              <Text style={{ color: theme.textThird }}>No transactions yet.</Text>
            </View>
          ) : recentEarnings.map((tx: any) => {
            const amount   = Number(tx.driverNet ?? tx.driverEarnings ?? tx.amount ?? 0);
            const gross    = Number(tx.grossAmount ?? 0);
            const cut      = Number(tx.seirsCut ?? 0);
            const isCredit = tx.type !== 'debit' && tx.type !== 'payout' && tx.type !== 'withdrawal';
            const amtColor = isCredit ? '#16A34A' : '#EF4444';
            const label    = tx.label ?? (isCredit ? `Trip ${tx.trackingCode ?? ''}`.trim() : 'Withdrawal');
            const date     = new Date(tx.createdAt ?? tx.earnedAt ?? tx.deliveredAt ?? Date.now())
              .toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
            // Commission transparency (founder ask 2026-08-09): show the
            // gross fare + SEIRS cut per trip so drivers see exactly how
            // their net was computed. The cut never enters their balance.
            const sub = gross > 0
              ? `${date} · Fare ${naira(gross)} − SEIRS ${naira(cut)}`
              : date;
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
                  <Text style={[styles.txLabel, { color: theme.text }]}>{label}</Text>
                  <Text style={[styles.txDate,  { color: theme.textSecond }]} numberOfLines={1}>{sub}</Text>
                </View>
                <Text style={[styles.txAmount, { color: amtColor }]}>
                  {isCredit ? '+' : '−'}{naira(amount)}
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

  goalModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.lg },
  goalModalCard:    { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm },
  goalModalTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },
  goalModalSub:     { fontSize: FontSize.sm, lineHeight: 19 },
  goalInputWrap:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, height: 52, marginTop: Spacing.xs },
  goalInput:        { flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },
  goalModalBtns:    { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  goalModalBtn:     { flex: 1, height: 46, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },

  cardWrap:    { marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, overflow: 'hidden' },
  walletCard:  { padding: Spacing.lg, gap: Spacing.md },
  walletTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  walletRight: { alignItems: 'flex-end', gap: 6 },
  walletLabel: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm },
  walletAmount:{ color: '#fff', fontSize: FontSize['3xl'], fontWeight: FontWeight.bold as any, letterSpacing: -1, marginTop: 4 },
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
