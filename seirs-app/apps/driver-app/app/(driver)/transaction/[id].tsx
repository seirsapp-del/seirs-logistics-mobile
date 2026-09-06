import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { earningsApi, type DriverEarning } from '@/services/api';
import { naira } from '@/utils/money';
import { tx as tr } from '@/i18n/tx';
import { tx } from '@/i18n/tx';

const STATUS_LABEL: Record<string, string> = {
  pending:   'Clearing',
  available: 'Ready to withdraw',
  paid:      'Paid to bank',
  held:      'On hold (review)',
};

export default function DriverTransactionDetailScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  // Real ledger entry (production audit 2026-08-10: this screen used
  // to look transactions up in a mock array, so every real row 404'd).
  const [tx,      setTx]      = useState<DriverEarning | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * There is no GET /earnings/:id, so this pulls the recent list and
   * picks the row out of it. /earnings/history is capped at 50 rows
   * server-side, which means an older entry lands on the not-found
   * state below (2026-08-23 sweep, D-4.6). Handed back to the backend:
   * a single-earning route would make this one fetch and remove the
   * cliff. Until then the empty state says which case it is rather than
   * implying the entry does not exist.
   */
  useEffect(() => {
    earningsApi.history()
      .then(rows => setTx((rows ?? []).find(e => e.id === id) ?? null))
      .catch(() => setTx(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </SafeAreaView>
    );
  }

  if (!tx) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: theme.textSecond, textAlign: 'center', paddingHorizontal: 32 }}>
          {tr('auto.transactionDetail.thisEntryIsNotIn', 'This entry is not in your recent earnings. Older entries are not available on this screen yet.')}
        </Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: theme.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 }}>
          <Text style={{ color: '#fff', fontWeight: FontWeight.bold }}>{tr('auto.id.goBack2', 'Go back')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const net       = Number(tx.driverNet);
  // isCredit was a `const true` feeding a ternary on the hero card, so
  // the debit branch below it could never render (2026-08-23 sweep,
  // D-4.6). A driver_earning row is always a credit, so the branch is
  // gone rather than made reachable.
  const amtColor  = '#16A34A';
  const amtSign   = '+';
  const iconName  = 'arrow-down-circle-outline';
  const iconBg    = '#16A34A18';
  const iconColor = '#16A34A';
  const statusLabel = STATUS_LABEL[tx.status] ?? tx.status;
  const statusColor = tx.status === 'held' ? '#DC2626' : tx.status === 'pending' ? '#D97706' : '#16A34A';

  /**
   * A trip somebody else ended.
   *
   * The rider rode out and was paid a floor rather than the fare, so the
   * number on this screen is smaller than the one they accepted the job for.
   * Unexplained, that reads as being short-changed, and it is where "Seirs
   * cheated me" starts. The explanation costs one line and is the whole
   * point of showing this screen at all.
   */
  const dStatus = (tx as any).delivery?.status;
  const wasCancelled = dStatus === 'cancelled' || dStatus === 'failed';

  const rows = [
    { label: tr('auto.transactionDetail.entryId', 'Entry ID'),     value: tx.id.slice(0, 8).toUpperCase() },
    { label: tr('auto.transactionDetail.date', 'Date'),         value: new Date(tx.createdAt).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
    // Gross − fee = net, to the kobo. Rounding these three independently
    // is exactly how the arithmetic stopped adding up (founder 2026-08-24).
    { label: tr('auto.transactionDetail.yourNet', 'Your net'),     value: naira(net) },
    { label: tr('auto.transactionDetail.status', 'Status'),       value: statusLabel },
    ...(wasCancelled ? [{ label: tr('auto.transactionDetail.whatHappened', 'What happened'), value: 'The trip was cancelled after you set off' }] : []),
    ...(tx.paidAt ? [{ label: tr('auto.transactionDetail.paidToBank', 'Paid to bank'), value: new Date(tx.paidAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) }] : []),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{tr('auto.id.transactionDetails', 'Transaction Details')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: isDark ? '#001800' : '#F0FDF4', borderColor: amtColor + '25' }]}>
          <View style={[styles.heroIcon, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName as any} size={36} color={iconColor} />
          </View>
          <Text style={[styles.heroAmount, { color: amtColor }]}>{amtSign}{naira(net)}</Text>
          <Text style={[styles.heroLabel, { color: theme.textSecond }]}>{tr('auto.id.deliveryEarnings', 'Delivery earnings')}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Detail rows */}
        <View style={[styles.detailCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.detailRow, i < rows.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 0.5 }]}>
              <Text style={[styles.detailLabel, { color: theme.textThird }]}>{r.label}</Text>
              <Text style={[styles.detailValue, { color: theme.text }]}>{r.value}</Text>
            </View>
          ))}
        </View>

        {/* The sentence a rider actually needs when the number looks wrong. */}
        {wasCancelled && (
          <View style={[styles.detailCard, { backgroundColor: theme.surface, borderColor: theme.border, padding: 14 }, Shadows.sm]}>
            <Text style={{ color: theme.textSecond, fontSize: FontSize.sm, lineHeight: 20 }}>
              You were paid {naira(net)} {tr('auto.transactionDetail.forTheDistanceYouRode', 'for the distance you rode before it was cancelled. The customer\'s fare was returned to them. You did nothing wrong and this does not affect your rating.')}
            </Text>
          </View>
        )}

        {/* Trip link */}
        {tx.deliveryId && (
          <Pressable
            style={[styles.tripLink, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
            onPress={() => router.push({ pathname: '/(driver)/delivery/[id]', params: { id: tx.deliveryId } })}
          >
            <View style={[styles.tripLinkIcon, { backgroundColor: theme.primary + '15' }]}>
              <Ionicons name="navigate-outline" size={20} color={theme.primary} />
            </View>
            <Text style={[styles.tripLinkText, { color: theme.text }]}>{tr('auto.id.viewTripDetails', 'View Trip Details')}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
          </Pressable>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md },

  heroCard:   { alignItems: 'center', padding: Spacing.xl, borderRadius: Radius.xl, borderWidth: 1, gap: Spacing.sm },
  heroIcon:   { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  heroAmount: { fontSize: FontSize['3xl'], fontWeight: FontWeight.bold, letterSpacing: -1 },
  heroLabel:  { fontSize: FontSize.base },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, marginTop: 4 },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  detailCard:  { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md },
  detailLabel: { fontSize: FontSize.sm },
  detailValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, flex: 1, textAlign: 'right', marginLeft: Spacing.md },

  tripLink:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  tripLinkIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  tripLinkText: { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
