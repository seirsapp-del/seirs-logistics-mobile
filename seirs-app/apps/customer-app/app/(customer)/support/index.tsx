/**
 * Customer-side support inbox (Chat 5).
 *
 * Lists the user's own support tickets, recent-first. Tapping one
 * opens the thread. Floating "New ticket" CTA at the bottom opens
 * the /support/new form.
 *
 * Kept intentionally quiet visually: the visitor here is stressed
 * (they need help) so we avoid loud gradients + big illustrations.
 */
import {
  View, Text, StyleSheet, FlatList, Pressable, StatusBar, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { supportApi, type SupportTicketDTO } from '@/services/api';

const STATUS_META: Record<string, { label: string; color: string }> = {
  open:            { label: 'Open',            color: '#3A7BD5' },
  awaiting_agent:  { label: 'Awaiting agent',  color: '#D97706' },
  awaiting_user:   { label: 'Your reply',      color: '#7C3AED' },
  resolved:        { label: 'Resolved',        color: '#16A34A' },
  closed:          { label: 'Closed',          color: '#6B7280' },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)     return 'now';
  if (diff < 3600_000)   return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h`;
  return new Date(iso).toLocaleDateString();
}

export default function SupportInboxScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

  const [tickets, setTickets] = useState<SupportTicketDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await supportApi.listMine(undefined, 50);
      setTickets(list ?? []);
    } catch {
      setTickets([]);
    }
  }, []);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {t('support.title', { defaultValue: 'Support' })}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {loading && tickets.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={t => t.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color={theme.textThird} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('support.emptyTitle', { defaultValue: 'No support tickets yet' })}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecond }]}>
                {t('support.emptyBody', { defaultValue: 'Tap the button below to reach the SEIRS support team. We reply during 6am–10pm WAT.' })}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status] ?? STATUS_META.open;
            return (
              <Pressable
                onPress={() => router.push(`/(customer)/support/${item.id}` as any)}
                style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.subject, { color: theme.text }]} numberOfLines={1}>{item.subject}</Text>
                    <Text style={[styles.time, { color: theme.textThird }]}>{formatRelative(item.lastMessageAt)}</Text>
                  </View>
                  <View style={styles.rowMeta}>
                    <View style={[styles.pill, { backgroundColor: `${meta.color}20`, borderColor: `${meta.color}60` }]}>
                      <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={[styles.topic, { color: theme.textSecond }]}>{item.topic}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textThird} />
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        onPress={() => router.push('/(customer)/support/new' as any)}
        style={[styles.fab, { backgroundColor: theme.primary }]}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>{t('support.newTicket', { defaultValue: 'New ticket' })}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  emptyWrap:  { alignItems: 'center', paddingHorizontal: 40, paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, textAlign: 'center' },
  emptyBody:  { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },

  row:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  rowTop:     { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  subject:    { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  time:       { fontSize: 11 },
  rowMeta:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  pill:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  pillText:   { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  topic:      { fontSize: 11, fontWeight: FontWeight.medium, textTransform: 'capitalize' },

  fab:        { position: 'absolute', bottom: 24, right: 24, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999 },
  fabText:    { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});
