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
        <Text style={{ color: theme.textSecond }}>Transaction not found</Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: theme.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 }}>
          <Text style={{ color: '#fff', fontWeight: FontWeight.bold }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const net       = Number(tx.driverNet);
  const gross     = Number(tx.grossAmount);
  const cut       = Number(tx.seirsCut);
  const isCredit  = true;
  const amtColor  = '#16A34A';
  const amtSign   = '+';
  const iconName  = 'arrow-down-circle-outline';
  const iconBg    = '#16A34A18';
  const iconColor = '#16A34A';
  const statusLabel = STATUS_LABEL[tx.status] ?? tx.status;
  const statusColor = tx.status === 'held' ? '#DC2626' : tx.status === 'pending' ? '#D97706' : '#16A34A';

  const rows = [
    { label: 'Entry ID',     value: tx.id.slice(0, 8).toUpperCase() },
    { label: 'Date',         value: new Date(tx.createdAt).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
    { label: 'Gross fare',   value: `₦${gross.toLocaleString()}` },
    { label: 'SEIRS fee',    value: `−₦${cut.toLocaleString()}` },
    { label: 'Your net',     value: `₦${net.toLocaleString()}` },
    { label: 'Status',       value: statusLabel },
    ...(tx.paidAt ? [{ label: 'Paid to bank', value: new Date(tx.paidAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) }] : []),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Transaction Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: isCredit ? (isDark ? '#001800' : '#F0FDF4') : (isDark ? '#1A0000' : '#FEF2F2'), borderColor: amtColor + '25' }]}>
          <View style={[styles.heroIcon, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName as any} size={36} color={iconColor} />
          </View>
          <Text style={[styles.heroAmount, { color: amtColor }]}>{amtSign}₦{net.toLocaleString()}</Text>
          <Text style={[styles.heroLabel, { color: theme.textSecond }]}>Delivery earnings</Text>
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

        {/* Trip link */}
        {tx.deliveryId && (
          <Pressable
            style={[styles.tripLink, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
            onPress={() => router.push({ pathname: '/(driver)/delivery/[id]', params: { id: tx.deliveryId } })}
          >
            <View style={[styles.tripLinkIcon, { backgroundColor: theme.primary + '15' }]}>
              <Ionicons name="navigate-outline" size={20} color={theme.primary} />
            </View>
            <Text style={[styles.tripLinkText, { color: theme.text }]}>View Trip Details</Text>
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
