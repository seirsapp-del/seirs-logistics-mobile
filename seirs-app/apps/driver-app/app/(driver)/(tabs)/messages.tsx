/**
 * Driver Messages tab — unified inbox.
 *
 * One list, two conversation types (same pattern as customer-app):
 *   1. Delivery chats (driver ↔ customer), from chatApi.conversations()
 *   2. Support tickets (driver ↔ SEIRS support), from supportApi.listMine()
 *
 * Sorted by lastMessageAt so recent activity bubbles up regardless of
 * type. Coloured type chips distinguish the two. Support entry point:
 * empty-state CTA when the list is empty, compact FAB when it has rows
 * (exactly one visible support CTA at any time).
 */
import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { LifeBuoy } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import {
  chatApi, supportApi,
  type ChatConversationDTO, type SupportTicketDTO,
} from '@/services/api';

type InboxRow =
  | { kind: 'chat';    id: string; sortKey: number; unread: number; data: ChatConversationDTO }
  | { kind: 'support'; id: string; sortKey: number; unread: number; data: SupportTicketDTO };

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

export default function DriverMessagesScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const insets  = useSafeAreaInsets();

  const [conversations, setConversations] = useState<ChatConversationDTO[]>([]);
  const [tickets,       setTickets]       = useState<SupportTicketDTO[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  const load = useCallback(async () => {
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

  const rows: InboxRow[] = useMemo(() => {
    const merged: InboxRow[] = [
      ...conversations.map((c): InboxRow => ({
        kind: 'chat',    id: `chat:${c.deliveryId}`, sortKey: new Date(c.lastMessageAt).getTime(), unread: c.unread ?? 0, data: c,
      })),
      ...tickets.map((t): InboxRow => ({
        kind: 'support', id: `support:${t.id}`,      sortKey: new Date(t.lastMessageAt).getTime(), unread: t.status === 'awaiting_user' ? 1 : 0, data: t,
      })),
    ];
    return merged.sort((a, b) => b.sortKey - a.sortKey);
  }, [conversations, tickets]);

  const totalUnread = rows.reduce((s, r) => s + r.unread, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>Messages</Text>
        {totalUnread > 0 && (
          <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
            <Text style={styles.unreadCount}>{totalUnread}</Text>
          </View>
        )}
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.id}
          contentContainerStyle={[styles.list, { paddingBottom: 100 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name="chatbubbles-outline" size={44} color={theme.textThird} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No messages yet</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
                Customer chats appear here during active trips. You can also reach SEIRS support any time.
              </Text>
              <Pressable
                onPress={() => router.push('/(driver)/support/new' as any)}
                style={[styles.emptyCta, { backgroundColor: theme.primary }]}
              >
                <LifeBuoy size={16} color="#fff" />
                <Text style={styles.emptyCtaText}>Contact SEIRS support</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) =>
            item.kind === 'chat' ? (
              <Pressable
                style={({ pressed }) => [
                  styles.chatCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  Shadows.sm,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() =>
                  router.push({ pathname: '/(driver)/messages/[chatId]', params: { chatId: item.data.deliveryId } })
                }
              >
                <View style={styles.avatarWrap}>
                  <Avatar name={item.data.otherParty.name} size={48} />
                  {item.data.unread > 0 && (
                    <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                      <Text style={styles.badgeText}>{item.data.unread}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.chatBody}>
                  <View style={styles.chatTopRow}>
                    <Text style={[styles.chatName, { color: theme.text }]} numberOfLines={1}>{item.data.otherParty.name}</Text>
                    <Text style={[styles.chatTime, { color: theme.textThird }]}>{formatRelativeTime(item.data.lastMessageAt)}</Text>
                  </View>
                  <View style={styles.chatBottomRow}>
                    <Text
                      style={[
                        styles.chatPreview,
                        { color: item.data.unread > 0 ? theme.text : theme.textSecond },
                        item.data.unread > 0 && { fontWeight: FontWeight.semibold },
                      ]}
                      numberOfLines={1}
                    >
                      {item.data.lastMessage}
                    </Text>
                  </View>
                  <Text style={[styles.tripTag, { color: theme.textThird }]}>Tracking #{item.data.trackingCode}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.chatCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  Shadows.sm,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => router.push(`/(driver)/support/${item.data.id}` as any)}
              >
                <View style={[styles.supportAvatar, { backgroundColor: theme.primary }]}>
                  <LifeBuoy size={22} color="#fff" strokeWidth={2} />
                </View>
                <View style={styles.chatBody}>
                  <View style={styles.chatTopRow}>
                    <Text style={[styles.chatName, { color: theme.text }]} numberOfLines={1}>SEIRS Support</Text>
                    <Text style={[styles.chatTime, { color: theme.textThird }]}>{formatRelativeTime(item.data.lastMessageAt)}</Text>
                  </View>
                  <View style={styles.chatBottomRow}>
                    <Text
                      style={[
                        styles.chatPreview,
                        { color: item.data.status === 'awaiting_user' ? theme.text : theme.textSecond },
                        item.data.status === 'awaiting_user' && { fontWeight: FontWeight.semibold },
                      ]}
                      numberOfLines={1}
                    >
                      {item.data.subject}
                    </Text>
                    {item.data.status === 'awaiting_user' && (
                      <View style={[styles.replyPill, { backgroundColor: theme.primary }]}>
                        <Text style={styles.replyPillText}>REPLY</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.tripTag, { color: theme.textThird }]}>Support · {item.data.topic}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
              </Pressable>
            )
          }
        />
      )}

      {rows.length > 0 && (
        <Pressable
          onPress={() => router.push('/(driver)/support/new' as any)}
          style={[styles.fab, { backgroundColor: theme.primary, bottom: 80 + insets.bottom }, Shadows.sm]}
          accessibilityLabel="Contact SEIRS support"
        >
          <LifeBuoy size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.fabText}>Support</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
  title:       { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  unreadBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  unreadCount: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  list: { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1 },

  chatCard:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  avatarWrap:    { position: 'relative' },
  supportAvatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  badge:         { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeText:     { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },
  chatBody:      { flex: 1, gap: 2 },
  chatTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatName:      { fontSize: FontSize.base, fontWeight: FontWeight.bold, flex: 1, marginRight: Spacing.sm },
  chatTime:      { fontSize: FontSize.xs },
  chatBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chatPreview:   { fontSize: FontSize.sm, flex: 1 },
  tripTag:       { fontSize: 10, marginTop: 2 },
  replyPill:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  replyPillText: { color: '#fff', fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5 },

  empty:      { paddingTop: Spacing.xl * 2, alignItems: 'center', gap: Spacing.md, paddingHorizontal: 32 },
  emptyIcon:  { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  emptyDesc:  { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  emptyCta:   { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999 },
  emptyCtaText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  fab:     { position: 'absolute', right: 20, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999 },
  fabText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});
