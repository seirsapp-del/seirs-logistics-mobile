import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { earningsApi, type EarningsDashboard, type DriverEarning } from '@/services/api';

/**
 * Live Earnings — real-data dashboard backed by the V8 Driver Earnings ledger
 * (docs/payments-spec.md §⑥). Shows today/week/all-time payouts, pending
 * + available balances, and a "Request Payout" button that triggers a
 * Flutterwave Transfer to the driver's verified bank account.
 *
 * Distinct from the legacy /earnings tab which uses mock chart data — this
 * screen is the authoritative real-money view.
 */
const fmt = (n: number) =>
  '₦' + new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(n);

export default function LiveEarningsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [dashboard, setDashboard] = useState<EarningsDashboard | null>(null);
  const [history,   setHistory]   = useState<DriverEarning[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paying,    setPaying]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([earningsApi.dashboard(), earningsApi.history()]);
      setDashboard(d);
      setHistory(h);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load earnings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handlePayout = async () => {
    if (!dashboard || dashboard.available < 1000) {
      Alert.alert('Below minimum', 'Available balance must be at least ₦1,000 to request a payout.');
      return;
    }
    Alert.alert(
      `Pay out ${fmt(dashboard.available)}?`,
      'Funds will be transferred to your registered bank account via Flutterwave (usually within a few minutes).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Out', style: 'default',
          onPress: async () => {
            setPaying(true);
            try {
              const res = await earningsApi.payout();
              Alert.alert('Payout sent', `${fmt(res.paidAmount)} is on its way to your bank account.`);
              await load();
            } catch (e: any) {
              Alert.alert('Payout failed', e?.message ?? 'Try again later.');
            } finally {
              setPaying(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Earnings</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
          <Pressable style={[styles.retryBtn, { backgroundColor: theme.primary }]} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Big balance card */}
          <View style={[styles.heroCard, { backgroundColor: theme.primary }]}>
            <Text style={styles.heroLabel}>Available to pay out</Text>
            <Text style={styles.heroAmount}>{fmt(dashboard?.available ?? 0)}</Text>
            <Pressable
              style={[styles.payoutBtn, paying && { opacity: 0.5 }]}
              onPress={handlePayout}
              disabled={paying || (dashboard?.available ?? 0) < 1000}
            >
              {paying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="cash-outline" size={18} color="#fff" />
                  <Text style={styles.payoutBtnText}>Pay Out Now</Text>
                </>
              )}
            </Pressable>
            <Text style={styles.heroFootnote}>Auto-payout: {dashboard?.nextPayoutEta}</Text>
          </View>

          {/* Pending earnings (still in dispute window) */}
          <View style={[styles.pendingRow, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Ionicons name="time-outline" size={18} color={theme.textSecond} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.pendingLabel, { color: theme.textSecond }]}>Pending (in 24h dispute window)</Text>
              <Text style={[styles.pendingValue, { color: theme.text }]}>{fmt(dashboard?.pending ?? 0)}</Text>
            </View>
          </View>

          {/* Three period stat cards */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.statLabel, { color: theme.textSecond }]}>Today</Text>
              <Text style={[styles.statAmount, { color: theme.text }]}>{fmt(dashboard?.today.earned ?? 0)}</Text>
              <Text style={[styles.statSub, { color: theme.textThird }]}>{dashboard?.today.deliveries ?? 0} deliveries</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.statLabel, { color: theme.textSecond }]}>This Week</Text>
              <Text style={[styles.statAmount, { color: theme.text }]}>{fmt(dashboard?.week.earned ?? 0)}</Text>
              <Text style={[styles.statSub, { color: theme.textThird }]}>{dashboard?.week.deliveries ?? 0} deliveries</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.statLabel, { color: theme.textSecond }]}>All Time</Text>
              <Text style={[styles.statAmount, { color: theme.text }]}>{fmt(dashboard?.allTime.earned ?? 0)}</Text>
              <Text style={[styles.statSub, { color: theme.textThird }]}>{dashboard?.allTime.deliveries ?? 0} deliveries</Text>
            </View>
          </View>

          {/* Recent earning entries */}
          <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Recent</Text>
          {history.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textThird }]}>No earnings yet — accept a delivery to get started.</Text>
          ) : history.slice(0, 20).map(e => (
            <View
              key={e.id}
              style={[styles.entryRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[e.status] }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.entryAmount, { color: theme.text }]}>{fmt(Number(e.driverNet))}</Text>
                <Text style={[styles.entrySub, { color: theme.textSecond }]}>
                  {STATUS_LABEL[e.status]} · {new Date(e.createdAt).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <Text style={[styles.entryStatus, { color: STATUS_COLOR[e.status] }]}>
                {e.status.toUpperCase()}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const STATUS_COLOR: Record<string, string> = {
  pending:   '#D97706',
  available: '#16A34A',
  paid:      '#3A7BD5',
  held:      '#DC2626',
};

const STATUS_LABEL: Record<string, string> = {
  pending:   'In dispute window',
  available: 'Ready to pay out',
  paid:      'Paid to bank',
  held:      'On hold (review)',
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    flex: 1, textAlign: 'center',
    fontSize: FontSize.lg, fontWeight: FontWeight.bold,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorText: { fontSize: FontSize.base, textAlign: 'center' },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md },
  retryBtnText: { color: '#fff', fontWeight: FontWeight.bold },

  content: { padding: Spacing.lg, gap: Spacing.md },

  heroCard: {
    padding: Spacing.lg, borderRadius: Radius.lg, gap: Spacing.sm,
  },
  heroLabel: { color: '#fff', fontSize: FontSize.sm, opacity: 0.85 },
  heroAmount: { color: '#fff', fontSize: 36, fontWeight: FontWeight.bold, marginTop: 4 },
  payoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12, borderRadius: Radius.md, marginTop: Spacing.sm,
  },
  payoutBtnText: { color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.base },
  heroFootnote: { color: '#fff', fontSize: FontSize.sm, opacity: 0.7, marginTop: 4, textAlign: 'center' },

  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
  },
  pendingLabel: { fontSize: FontSize.xs },
  pendingValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  statCard: { flex: 1, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  statLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase' },
  statAmount: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, marginTop: 4 },
  statSub: { fontSize: FontSize.xs, marginTop: 2 },

  sectionLabel: {
    fontSize: FontSize.sm, fontWeight: FontWeight.semibold,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.sm,
  },
  emptyText: { fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.lg },

  entryRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  entryAmount: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, fontFamily: 'monospace' },
  entrySub: { fontSize: FontSize.xs, marginTop: 2 },
  entryStatus: { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
});
