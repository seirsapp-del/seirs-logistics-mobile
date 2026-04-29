import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { MOCK_DRIVER_EARNINGS } from '@/constants/driverMockData';

export default function DriverTransactionDetailScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const tx = MOCK_DRIVER_EARNINGS.find(e => e.id === id);

  if (!tx) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.textSecond }}>Transaction not found</Text>
      </SafeAreaView>
    );
  }

  const isCredit  = tx.type === 'credit';
  const amtColor  = isCredit ? '#22C55E' : '#EF4444';
  const amtSign   = isCredit ? '+' : '−';
  const iconName  = isCredit ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline';
  const iconBg    = isCredit ? '#22C55E18' : '#EF444418';
  const iconColor = isCredit ? '#22C55E' : '#EF4444';

  const rows = [
    { label: 'Transaction ID', value: `TXN-${tx.id.toUpperCase()}-2026` },
    { label: 'Date',           value: new Date(tx.date).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
    { label: 'Type',           value: tx.label },
    { label: 'Status',         value: tx.status === 'success' ? 'Successful' : tx.status },
    ...(tx.tripId ? [{ label: 'Trip Reference', value: tx.tripId }] : []),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
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
          <Text style={[styles.heroAmount, { color: amtColor }]}>{amtSign}₦{tx.amount.toLocaleString()}</Text>
          <Text style={[styles.heroLabel, { color: theme.textSecond }]}>{tx.label}</Text>
          <View style={[styles.statusPill, { backgroundColor: '#22C55E18' }]}>
            <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
            <Text style={[styles.statusText, { color: '#22C55E' }]}>Successful</Text>
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
        {tx.tripId && (
          <Pressable
            style={[styles.tripLink, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
            onPress={() => router.push({ pathname: '/(driver)/delivery/[id]', params: { id: tx.tripId! } })}
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
