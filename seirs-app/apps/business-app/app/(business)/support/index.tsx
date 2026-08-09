/**
 * Business + partner support inbox (Chat 5).
 *
 * Reachable from both the business drawer and the partner-mode drawer
 * since they share the same account and therefore the same tickets.
 * Kept restrained visually to match business-app "gold visual" tone.
 */
import {
  View, Text, StyleSheet, FlatList, Pressable, StatusBar, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { supportApi, type SupportTicketDTO } from '@/services/api';

const STATUS_META: Record<string, { label: string; color: string }> = {
  open:            { label: 'Open',           color: '#3A7BD5' },
  awaiting_agent:  { label: 'Awaiting agent', color: '#D97706' },
  awaiting_user:   { label: 'Your reply',     color: '#7C3AED' },
  resolved:        { label: 'Resolved',       color: '#16A34A' },
  closed:          { label: 'Closed',         color: '#6B7280' },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)     return 'now';
  if (diff < 3600_000)   return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h`;
  return new Date(iso).toLocaleDateString();
}

export default function BusinessSupportInboxScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  const [tickets,    setTickets]    = useState<SupportTicketDTO[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setTickets(await supportApi.listMine(undefined, 50)); }
    catch { setTickets([]); }
  }, []);
  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Support</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading && tickets.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={t => t.id}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Icon name="MessageSquare" size={48} color={theme.textSecond} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No support tickets yet</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecond }]}>
                Tap below to reach SEIRS support for anything related to your account, bookings, or partner store. We reply 6am–10pm WAT.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status] ?? STATUS_META.open;
            return (
              <Pressable
                onPress={() => router.push(`/(business)/support/${item.id}` as any)}
                style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.subject, { color: theme.text }]} numberOfLines={1}>{item.subject}</Text>
                    <Text style={[styles.time, { color: theme.textSecond }]}>{formatRelative(item.lastMessageAt)}</Text>
                  </View>
                  <View style={styles.rowMeta}>
                    <View style={[styles.pill, { backgroundColor: `${meta.color}20`, borderColor: `${meta.color}60` }]}>
                      <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={[styles.topic, { color: theme.textSecond }]}>{item.topic}</Text>
                  </View>
                </View>
                <Icon name="ChevronRight" size={18} color={theme.textSecond} />
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        onPress={() => router.push('/(business)/support/new' as any)}
        style={[styles.fab, { backgroundColor: theme.primary, bottom: 24 + insets.bottom }]}
      >
        <Icon name="Plus" size={20} color="#fff" />
        <Text style={styles.fabText}>New ticket</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap:   { alignItems: 'center', paddingHorizontal: 40, paddingTop: 80, gap: 10 },
  emptyTitle:  { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptyBody:   { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  rowTop:      { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  subject:     { flex: 1, fontSize: 14, fontWeight: '600' },
  time:        { fontSize: 11 },
  rowMeta:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  pill:        { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  pillText:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  topic:       { fontSize: 11, fontWeight: '500', textTransform: 'capitalize' },
  fab:         { position: 'absolute', right: 24, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999 },
  fabText:     { color: '#fff', fontSize: 13, fontWeight: '700' },
});
