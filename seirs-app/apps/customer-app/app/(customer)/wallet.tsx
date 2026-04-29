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
import { MOCK_USER, MOCK_TRANSACTIONS } from '@/constants/mockData';

type Tab = 'all' | 'credit' | 'debit';

const TX_ICONS: Record<string, string> = {
  credit: 'arrow-down-circle',
  debit:  'arrow-up-circle',
};
const TX_COLORS: Record<string, string> = {
  credit: '#22C55E',
  debit:  '#EF4444',
};
const STATUS_COLORS: Record<string, string> = {
  success: '#22C55E',
  pending: '#FFBE0B',
  failed:  '#EF4444',
};

export default function WalletScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [activeTab, setTab] = useState<Tab>('all');

  const filtered = MOCK_TRANSACTIONS.filter(tx =>
    activeTab === 'all' ? true : tx.type === activeTab
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xl * 2 }}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>My Wallet</Text>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: theme.surfaceSecond }]}
            onPress={() => router.push('/(customer)/payment-methods')}
          >
            <Ionicons name="card-outline" size={20} color={theme.text} />
          </Pressable>
        </View>

        {/* Balance card */}
        <View style={styles.cardWrap}>
          <LinearGradient
            colors={isDark ? [theme.walletCard, theme.walletCardEnd] : ['#3A86FF', '#1D6AE5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.balanceCard, isDark ? Shadows.orange : Shadows.blue]}
          >
            <View style={styles.cardTopRow}>
              <Text style={styles.balanceLabel}>Wallet Balance</Text>
              <View style={styles.tierBadge}>
                <Ionicons name="star" size={12} color="#FFBE0B" />
                <Text style={styles.tierText}>{MOCK_USER.tier}</Text>
              </View>
            </View>
            <Text style={styles.balanceAmount}>
              ₦{MOCK_USER.walletBalance.toLocaleString()}.00
            </Text>
            <Text style={styles.balanceSub}>{MOCK_USER.points.toLocaleString()} reward points</Text>

            {/* Actions */}
            <View style={styles.cardActions}>
              {[
                { icon: 'add-circle-outline', label: 'Top Up',   onPress: () => router.push('/(customer)/add-payment') },
                { icon: 'arrow-up-outline',    label: 'Withdraw', onPress: () => {} },
                { icon: 'card-outline',        label: 'Cards',    onPress: () => router.push('/(customer)/payment-methods') },
              ].map(a => (
                <Pressable key={a.label} style={styles.cardActionBtn} onPress={a.onPress}>
                  <View style={styles.cardActionIcon}>
                    <Ionicons name={a.icon as any} size={20} color="#fff" />
                  </View>
                  <Text style={styles.cardActionLabel}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* Quick stats */}
        <View style={[styles.statsRow, { backgroundColor: theme.surface }, Shadows.sm]}>
          {[
            { label: 'Total Spent',  value: `₦${MOCK_TRANSACTIONS.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0).toLocaleString()}` },
            { label: 'Total Earned', value: `₦${MOCK_TRANSACTIONS.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0).toLocaleString()}` },
            { label: 'Transactions', value: `${MOCK_TRANSACTIONS.length}` },
          ].map((stat, i) => (
            <View key={stat.label} style={[styles.statItem, i < 2 && { borderRightWidth: 1, borderRightColor: theme.border }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecond }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Transactions</Text>
          </View>

          {/* Tabs */}
          <View style={[styles.tabRow, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            {(['all', 'credit', 'debit'] as Tab[]).map(tab => (
              <Pressable
                key={tab}
                style={[styles.tab, activeTab === tab && { backgroundColor: theme.primary }]}
                onPress={() => setTab(tab)}
              >
                <Text style={[styles.tabText, { color: activeTab === tab ? '#fff' : theme.textSecond }]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {filtered.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
              <Ionicons name="receipt-outline" size={40} color={theme.textThird} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No transactions</Text>
            </View>
          ) : (
            filtered.map(tx => (
              <Pressable
                key={tx.id}
                style={[styles.txRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
                onPress={() => router.push({ pathname: '/(customer)/transaction/[id]', params: { id: tx.id } })}
              >
                <View style={[styles.txIcon, { backgroundColor: TX_COLORS[tx.type] + '15' }]}>
                  <Ionicons name={TX_ICONS[tx.type] as any} size={20} color={TX_COLORS[tx.type]} />
                </View>
                <View style={styles.txInfo}>
                  <Text style={[styles.txLabel, { color: theme.text }]}>{tx.label}</Text>
                  <Text style={[styles.txMeta, { color: theme.textSecond }]}>{tx.date} · {tx.method}</Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[styles.txAmount, { color: TX_COLORS[tx.type] }]}>
                    {tx.type === 'credit' ? '+' : '−'}₦{tx.amount.toLocaleString()}
                  </Text>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[tx.status] ?? '#A1A1AA' }]} />
                </View>
              </Pressable>
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  iconBtn:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  cardWrap:      { marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  balanceCard:   { borderRadius: Radius.xl, padding: Spacing.lg },
  cardTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  balanceLabel:  { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm },
  tierBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  tierText:      { color: '#FFBE0B', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: FontWeight.bold, letterSpacing: -0.5, marginBottom: 4 },
  balanceSub:    { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.xs, marginBottom: Spacing.lg },
  cardActions:   { flexDirection: 'row' },
  cardActionBtn: { flex: 1, alignItems: 'center', gap: 6 },
  cardActionIcon:{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  cardActionLabel:{ color: 'rgba(255,255,255,0.9)', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  statsRow:  { marginHorizontal: Spacing.md, borderRadius: Radius.xl, flexDirection: 'row', marginBottom: Spacing.lg },
  statItem:  { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  statValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  statLabel: { fontSize: FontSize.xs, marginTop: 2 },

  section:     { paddingHorizontal: Spacing.md },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle:{ fontSize: FontSize.md, fontWeight: FontWeight.bold },

  tabRow:  { flexDirection: 'row', borderRadius: Radius.full, borderWidth: 1, padding: 3, marginBottom: Spacing.md },
  tab:     { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.full },
  tabText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  emptyCard:  { alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl, borderRadius: Radius.xl },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.medium },

  txRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  txIcon:  { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  txInfo:  { flex: 1 },
  txLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, marginBottom: 2 },
  txMeta:  { fontSize: FontSize.xs },
  txRight: { alignItems: 'flex-end', gap: 4 },
  txAmount:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
  statusDot:{ width: 7, height: 7, borderRadius: 4 },
});
