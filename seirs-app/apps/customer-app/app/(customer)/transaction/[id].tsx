import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { MOCK_TRANSACTIONS } from '@/constants/mockData';

const TYPE_CONFIG = {
  credit: { color: '#22C55E', icon: 'arrow-down-circle', sign: '+' },
  debit:  { color: '#EF4444', icon: 'arrow-up-circle',   sign: '−' },
};
const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  success: { color: '#22C55E', label: 'Successful' },
  pending: { color: '#FFBE0B', label: 'Pending'    },
  failed:  { color: '#EF4444', label: 'Failed'     },
};

export default function TransactionDetailsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { id } = useLocalSearchParams<{ id: string }>();

  const tx = MOCK_TRANSACTIONS.find(t => t.id === id) ?? MOCK_TRANSACTIONS[0];
  const tc = TYPE_CONFIG[tx.type as keyof typeof TYPE_CONFIG];
  const sc = STATUS_CONFIG[tx.status] ?? { color: '#A1A1AA', label: tx.status };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Transaction Details</Text>
          <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}>
            <Ionicons name="share-outline" size={20} color={theme.text} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          {/* Amount hero */}
          <View style={[styles.hero, { backgroundColor: tc.color + '12', borderColor: tc.color + '25' }]}>
            <View style={[styles.heroIcon, { backgroundColor: tc.color + '20' }]}>
              <Ionicons name={tc.icon as any} size={36} color={tc.color} />
            </View>
            <Text style={[styles.heroAmount, { color: tc.color }]}>
              {tc.sign}₦{tx.amount.toLocaleString()}
            </Text>
            <Text style={[styles.heroLabel, { color: theme.textSecond }]}>{tx.label}</Text>
            <View style={[styles.statusPill, { backgroundColor: sc.color + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: sc.color }]} />
              <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
            </View>
          </View>

          {/* Details card */}
          <View style={[styles.detailsCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            {[
              { label: 'Transaction ID', value: tx.id.toUpperCase() },
              { label: 'Date',           value: new Date(tx.date).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) },
              { label: 'Payment Method', value: tx.method },
              { label: 'Type',           value: tx.type === 'credit' ? 'Money In' : 'Money Out' },
              { label: 'Status',         value: sc.label },
            ].map((row, i, arr) => (
              <View key={row.label} style={[styles.detailRow, i < arr.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                <Text style={[styles.detailLabel, { color: theme.textSecond }]}>{row.label}</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>{row.value}</Text>
              </View>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={[styles.actionBtn, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              <Ionicons name="download-outline" size={20} color={theme.text} />
              <Text style={[styles.actionBtnText, { color: theme.text }]}>Download Receipt</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Ionicons name="flag-outline" size={20} color="#EF4444" />
              <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Report Issue</Text>
            </Pressable>
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  hero:      { alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl, borderRadius: Radius.xxl, borderWidth: 1 },
  heroIcon:  { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  heroAmount:{ fontSize: 36, fontWeight: FontWeight.bold, letterSpacing: -0.5 },
  heroLabel: { fontSize: FontSize.base },
  statusPill:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, marginTop: Spacing.xs },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  detailsCard:{ borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  detailRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  detailLabel:{ fontSize: FontSize.sm },
  detailValue:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold, maxWidth: '55%', textAlign: 'right' },

  actions:       { gap: Spacing.sm },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  actionBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
