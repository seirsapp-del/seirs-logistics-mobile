/**
 * Customer Messages tab — unified inbox.
 *
 * One list, two conversation types:
 *   1. Delivery chats: customer ↔ driver for a specific delivery.
 *      Data from GET /chats (chatApi.conversations()).
 *   2. Support tickets: customer ↔ SEIRS support agent.
 *      Data from GET /support/tickets (supportApi.listMine()).
 *
 * Both are shown together, sorted by lastMessageAt so recent activity
 * bubbles up regardless of type. A colored type chip on each row makes
 * the distinction obvious ("Driver" vs "Support").
 *
 * Includes:
 *   - Hamburger drawer trigger (was missing before)
 *   - Prominent "Start a support conversation" CTA in the empty state
 *   - Safe-area aware FAB (previously covered by system nav on gesture-nav phones)
 */
import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlignLeft, Bike, LifeBuoy, Plus } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { CountBadge } from '@/components/ui/Badge';
import { Drawer } from '@/components/Drawer';
import {
  chatApi, supportApi,
  type ChatConversationDTO, type SupportTicketDTO,
} from '@/services/api';

// A unified row for the merged inbox. Both conversation types coalesce
// into this shape so the FlatList renders one row template.
type InboxRow =
  | { kind: 'chat';    id: string; sortKey: number; unread: number; data: ChatConversationDTO }
  | { kind: 'support'; id: string; sortKey: number; unread: number; data: SupportTicketDTO };

const STATUS_LABEL: Record<string, string> = {
  open:            'Awaiting reply',
  awaiting_agent:  'Awaiting SEIRS',
  awaiting_user:   'Your reply needed',
  resolved:        'Resolved',
  closed:          'Closed',
};

function formatRelativeTime(iso: string): string {
  const ts   = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const day  = 24 * 60 * 60 * 1000;
  if (diff < 60 * 1000)         return 'now';
  if (diff < 60 * 60 * 1000)    return `${Math.floor(diff / (60 * 1000))}m`;
  if (diff < day)               return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (diff < 2 * day)           return 'Yesterday';
  if (diff < 7 * day)           return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function MessagesScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();
  const insets = useSafeAreaInsets();

  const [conversations, setConversations] = useState<ChatConversationDTO[]>([]);
  const [tickets,       setTickets]       = useState<SupportTicketDTO[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const load = useCallback(async () => {
    // Both requests fire in parallel; one failing does not blank the other.
    const [convs, tks] = await Promise.all([
      chatApi.conversations().catch(() => [] as ChatConversationDTO[]),
      supportApi.listMine(undefined, 50).catch(() => [] as SupportTicketDTO[]),
    ]);
    setConversations(convs ?? []);
    setTickets(tks ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Merge + sort recent-first. Support tickets carry a proxy "unread"
  // signal: 1 when the ticket is awaiting the user, 0 otherwise.
  const rows: InboxRow[] = useMemo(() => {
    const merged: InboxRow[] = [
      ...conversations.map((c): InboxRow => ({
        kind:    'chat',
        id:      `chat:${c.deliveryId}`,
        sortKey: new Date(c.lastMessageAt).getTime(),
        unread:  c.unread ?? 0,
        data:    c,
      })),
      ...tickets.map((t): InboxRow => ({
        kind:    'support',
        id:      `support:${t.id}`,
        sortKey: new Date(t.lastMessageAt).getTime(),
        unread:  t.status === 'awaiting_user' ? 1 : 0,
        data:    t,
      })),
    ];
    return merged.sort((a, b) => b.sortKey - a.sortKey);
  }, [conversations, tickets]);

  const totalUnread = rows.reduce((s, r) => s + r.unread, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header with hamburger */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => setDrawerVisible(true)}
          hitSlop={12}
          style={[styles.hamburgerBtn, { backgroundColor: theme.surfaceSecond }]}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <AlignLeft size={20} color={theme.text} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>{t('messages.title', { defaultValue: 'Messages' })}</Text>
        </View>
        {totalUnread > 0 && (
          <View style={[styles.unreadPill, { backgroundColor: theme.primary }]}>
            <Text style={styles.unreadPillText}>{totalUnread}</Text>
          </View>
        )}
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.centered}><ActivityIndicator color={theme.primary} /></View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceSecond }]}>
            <Ionicons name="chatbubbles-outline" size={40} color={theme.textThird} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {t('messages.emptyTitle', { defaultValue: 'No conversations yet' })}
          </Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
            {t('messages.emptyDesc2', { defaultValue: 'Driver chats appear here during a delivery. You can also start a conversation with our support team any time.' })}
          </Text>
          <Pressable
            onPress={() => router.push('/(customer)/support/new' as any)}
            style={[styles.emptyCta, { backgroundColor: theme.primary }]}
          >
            <LifeBuoy size={16} color="#fff" />
            <Text style={styles.emptyCtaText}>
              {t('messages.startSupport', { defaultValue: 'Start a support conversation' })}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.id}
          contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
          ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          renderItem={({ item }) =>
            item.kind === 'chat'
              ? <ChatRow    theme={theme} row={item.data} onPress={() => router.push({ pathname: '/(customer)/messages/[chatId]', params: { chatId: item.data.deliveryId } })} />
              : <SupportRow theme={theme} row={item.data} onPress={() => router.push(`/(customer)/support/${item.data.id}` as any)} />
          }
        />
      )}

      {/* Floating "Start support" CTA — safe-area aware so system nav
          doesn't cover it on gesture-nav phones (Pixel, newer Samsungs).
          Uses insets.bottom + tab-bar height (~64) so it sits comfortably
          above both. */}
      <Pressable
        onPress={() => router.push('/(customer)/support/new' as any)}
        style={[
          styles.fab,
          {
            backgroundColor: theme.primary,
            bottom: 80 + insets.bottom,
          },
          Shadows.sm,
        ]}
        accessibilityLabel="Start a support conversation"
      >
        <Plus size={18} color="#fff" strokeWidth={2.5} />
        <Text style={styles.fabText}>Support</Text>
      </Pressable>

      <Drawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </SafeAreaView>
  );
}

function ChatRow({ theme, row, onPress }: { theme: any; row: ChatConversationDTO; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.surface, opacity: pressed ? 0.75 : 1 }]}
    >
      <Avatar name={row.otherParty.name} size={48} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{row.otherParty.name}</Text>
            <View style={[styles.typeChip, { backgroundColor: '#22C55E20', borderColor: '#22C55E60' }]}>
              <Bike size={9} color="#22C55E" />
              <Text style={[styles.typeChipText, { color: '#16A34A' }]}>Driver</Text>
            </View>
          </View>
          <Text style={[styles.time, { color: theme.textSecond }]}>{formatRelativeTime(row.lastMessageAt)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text
            numberOfLines={1}
            style={[
              styles.preview,
              { color: row.unread > 0 ? theme.text : theme.textSecond },
              row.unread > 0 && { fontWeight: FontWeight.semibold },
            ]}
          >
            {row.lastMessage || 'No messages yet'}
          </Text>
          {row.unread > 0 && <CountBadge count={row.unread} />}
        </View>
      </View>
    </Pressable>
  );
}

function SupportRow({ theme, row, onPress }: { theme: any; row: SupportTicketDTO; onPress: () => void }) {
  const status = STATUS_LABEL[row.status] ?? row.status;
  const isTerminal = row.status === 'closed' || row.status === 'resolved';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.surface, opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.supportAvatar, { backgroundColor: theme.primary }]}>
        <LifeBuoy size={22} color="#fff" strokeWidth={2} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>SEIRS Support</Text>
            <View style={[styles.typeChip, { backgroundColor: '#3A7BD520', borderColor: '#3A7BD560' }]}>
              <LifeBuoy size={9} color="#3A7BD5" />
              <Text style={[styles.typeChipText, { color: '#3A7BD5' }]}>Support</Text>
            </View>
          </View>
          <Text style={[styles.time, { color: theme.textSecond }]}>{formatRelativeTime(row.lastMessageAt)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text
            numberOfLines={1}
            style={[
              styles.preview,
              { color: row.unread > 0 || row.status === 'awaiting_user' ? theme.text : theme.textSecond },
              (row.status === 'awaiting_user') && { fontWeight: FontWeight.semibold },
            ]}
          >
            {row.subject}
          </Text>
          {row.status === 'awaiting_user' && !isTerminal && (
            <View style={[styles.smallPill, { backgroundColor: '#3A7BD5' }]}>
              <Text style={styles.smallPillText}>REPLY</Text>
            </View>
          )}
          {row.status === 'resolved' && (
            <Text style={[styles.doneChip, { color: '#16A34A' }]}>· {status}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1,
  },
  hamburgerBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  title:           { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  unreadPill:      { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
  unreadPillText:  { color: '#fff', fontSize: 11, fontWeight: FontWeight.bold },

  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:      { paddingVertical: Spacing.xs },
  divider:   { height: 1, marginLeft: 72 },

  row:            { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  supportAvatar:  { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  rowBody:        { flex: 1 },
  rowTop:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  name:           { fontSize: FontSize.base, fontWeight: FontWeight.bold, flexShrink: 1 },
  time:           { fontSize: 11 },
  rowBottom:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  preview:        { flex: 1, fontSize: FontSize.sm },
  typeChip:       { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  typeChipText:   { fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.4, textTransform: 'uppercase' },
  smallPill:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  smallPillText:  { color: '#fff', fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  doneChip:       { fontSize: 11, fontWeight: FontWeight.semibold },

  empty:      { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, paddingHorizontal: 32 },
  emptyIcon:  { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, textAlign: 'center' },
  emptyDesc:  { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  emptyCta:   { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999 },
  emptyCtaText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  fab: {
    position: 'absolute', right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999,
  },
  fabText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});
