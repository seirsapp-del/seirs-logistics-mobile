import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import {
  MOCK_DRIVER, MOCK_DRIVER_EARNINGS, MOCK_DRIVER_DELIVERIES, WEEKLY_EARNINGS,
} from '@/constants/driverMockData';

type Period = 'week' | 'month' | 'all';

export default function EarningsScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [period, setPeriod] = useState<Period>('week');

  const totalEarned = MOCK_DRIVER_DELIVERIES
    .filter(d => d.status === 'delivered')
    .reduce((s, d) => s + d.driverEarnings, 0);

  const weekTotal = WEEKLY_EARNINGS.reduce((s, d) => s + d.amount, 0);
  const maxBar    = Math.max(...WEEKLY_EARNINGS.map(d => d.amount));

  const walletGradient: [string, string] = isDark
    ? ['#FF6B00', '#1A0A00']
    : ['#3A86FF', '#1D6AE5'];

  const STATS = [
    { label: 'This Week',     value: `₦${weekTotal.toLocaleString()}`,                                         icon: 'calendar-outline',    color: theme.primary },
    { label: 'Avg / Trip',    value: `₦${Math.round(totalEarned / MOCK_DRIVER.totalTrips)}`,                   icon: 'trending-up-outline', color: '#22C55E'     },
    { label: 'Total Trips',   value: MOCK_DRIVER.totalTrips.toLocaleString(),                                   icon: 'navigate-outline',    color: '#8B5CF6'     },
    { label: 'Total Earned',  value: `₦${(MOCK_DRIVER.totalEarned / 1000000).toFixed(1)}M`,                    icon: 'cash-outline',        color: '#FFBE0B'     },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Page header */}
        <View style={styles.pageHeader}>
          <Text style={[styles.pageTitle, { color: theme.text }]}>Earnings</Text>
          <Pressable
            style={[styles.headerBtn, { backgroundColor: theme.surfaceSecond }]}
            onPress={() => router.push('/(driver)/notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={theme.text} />
          </Pressable>
        </View>

        {/* Wallet card */}
        <View style={[styles.cardWrap, Shadows.md]}>
          <LinearGradient
            colors={walletGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.walletCard}
          >
            <View style={styles.walletTop}>
              <View>
                <Text style={styles.walletLabel}>Available Balance</Text>
                <Text style={styles.walletAmount}>₦{MOCK_DRIVER.balance.toLocaleString()}</Text>
              </View>
              <View style={[styles.tierChip, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Ionicons name="ribbon-outline" size={12} color="#fff" />
                <Text style={styles.tierChipText}>{MOCK_DRIVER.tier}</Text>
              </View>
            </View>
            <View style={styles.walletActions}>
              <Pressable
                style={styles.walletBtn}
                onPress={() => router.push('/(driver)/withdrawal')}
              >
                <Ionicons name="arrow-up-circle-outline" size={16} color="#fff" />
                <Text style={styles.walletBtnText}>Withdraw</Text>
              </Pressable>
              <Pressable
                style={styles.walletBtn}
                onPress={() => router.push('/(driver)/add-bank')}
              >
                <Ionicons name="business-outline" size={16} color="#fff" />
                <Text style={styles.walletBtnText}>Bank Accounts</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {STATS.map(s => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              <View style={[styles.statIcon, { backgroundColor: s.color + '18' }]}>
                <Ionicons name={s.icon as any} size={18} color={s.color} />
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
            <Text style={[styles.chartTotal, { color: '#22C55E' }]}>₦{weekTotal.toLocaleString()}</Text>
          </View>
          <View style={styles.barRow}>
            {WEEKLY_EARNINGS.map(d => {
              const pct = (d.amount / maxBar) * 100;
              const isMax = d.amount === maxBar;
              return (
                <View key={d.day} style={styles.barCol}>
                  <Text style={[styles.barAmt, { color: isMax ? theme.primary : theme.textThird }]}>
                    {d.amount >= 1000 ? `${(d.amount / 1000).toFixed(0)}k` : d.amount}
                  </Text>
                  <View style={[styles.barTrack, { backgroundColor: theme.surfaceSecond }]}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${Math.max(pct, 8)}%`,
                          backgroundColor: isMax ? theme.primary : theme.primary + '45',
                          borderRadius: 4,
                        },
                      ]}
                    />
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
            const isCredit  = tx.type === 'credit';
            const amtColor  = isCredit ? '#22C55E' : '#EF4444';
            const iconColor = isCredit ? '#22C55E' : '#EF4444';
            const iconBg    = isCredit ? '#22C55E18' : '#EF444418';
            const iconName  = isCredit ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline';
            return (
              <Pressable
                key={tx.id}
                style={[styles.txRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
                onPress={() => router.push({ pathname: '/(driver)/transaction/[id]', params: { id: tx.id } })}
              >
                <View style={[styles.txIcon, { backgroundColor: iconBg }]}>
                  <Ionicons name={iconName as any} size={22} color={iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txLabel, { color: theme.text }]}>{tx.label}</Text>
                  <Text style={[styles.txDate, { color: theme.textSecond }]}>{tx.date}</Text>
                </View>
                <Text style={[styles.txAmount, { color: amtColor }]}>
                  {isCredit ? '+' : '−'}₦{tx.amount.toLocaleString()}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={theme.textThird} style={{ marginLeft: 4 }} />
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
  scroll: { paddingBottom: Spacing.xl },

  pageHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  pageTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  headerBtn:   { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

  cardWrap:   { marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, overflow: 'hidden' },
  walletCard: { padding: Spacing.lg, gap: Spacing.md },
  walletTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  walletLabel:{ color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm },
  walletAmount:{ color: '#fff', fontSize: FontSize['3xl'], fontWeight: FontWeight.bold, letterSpacing: -1, marginTop: 4 },
  tierChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  tierChipText:{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  walletActions:{ flexDirection: 'row', gap: Spacing.sm },
  walletBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: Spacing.sm, borderRadius: Radius.xl },
  walletBtnText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  statCard:  { width: '47%', padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, gap: 6 },
  statIcon:  { width: 36, height: 36, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  statLabel: { fontSize: FontSize.xs },

  chartCard:   { marginHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  cardTitle:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  chartTotal:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  barRow:  { flexDirection: 'row', gap: Spacing.sm, height: 120 },
  barCol:  { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  barAmt:  { fontSize: 9, fontWeight: FontWeight.semibold },
  barTrack:{ flex: 1, width: '100%', justifyContent: 'flex-end', borderRadius: 4 },
  barFill: { width: '100%' },
  barDay:  { fontSize: FontSize.xs },

  section:       { paddingHorizontal: Spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  seeAll:        { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  txRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.sm },
  txIcon:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  txLabel:  { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  txDate:   { fontSize: FontSize.xs, marginTop: 2 },
  txAmount: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
