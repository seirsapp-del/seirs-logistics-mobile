/**
 * Shared business/partner messages inbox.
 *
 * List of conversations (one per delivery the account has chatted in).
 * Same underlying endpoint as customer/driver: GET /chats. The only
 * difference from the customer/driver inboxes is a slightly more
 * restrained visual style consistent with the business-app "gold visual
 * restraint" reference: no big colored badges, no card shadows.
 *
 * The `threadRoutePrefix` prop lets each caller (business tab vs
 * partner tab) route to the correct per-mode thread screen without
 * this component having to know about route groups.
 */
import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
  RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import {
  chatApi, supportApi,
  type ChatConversationDTO, type SupportTicketDTO,
} from '@/services/api';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

// Unified inbox row: delivery chat OR support ticket, merged + sorted
// by recency so the tab shows one coherent conversation surface.
type InboxRow =
  | { kind: 'chat';    id: string; sortKey: number; unread: number; data: ChatConversationDTO }
  | { kind: 'support'; id: string; sortKey: number; unread: number; data: SupportTicketDTO };

function formatRelativeTime(iso: string): string {
  const ts   = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const day  = 24 * 60 * 60 * 1000;
  if (diff < 60 * 1000)      return 'now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m`;
  if (diff < day)            return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (diff < 2 * day)        return 'Yesterday';
  if (diff < 7 * day)        return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface MessagesInboxProps {
  /** Route prefix for a tapped thread, e.g. `/(business)/messages` or `/(partner)/messages`. */
  threadRoutePrefix: string;
  /** Route prefix for support tickets. Defaults to /(business)/support since
   *  business + partner modes share the same account (and tickets). */
  supportRoutePrefix?: string;
  /** When provided, renders a hamburger button in the header (opens the
   *  caller's Drawer). Kept optional so embedded usages stay chrome-free. */
  onMenuPress?: () => void;
}

export function MessagesInbox({ threadRoutePrefix, supportRoutePrefix = '/(business)/support', onMenuPress }: MessagesInboxProps) {
  const router     = useRouter();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];
  const { t }      = useTranslation();

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
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  const rows: InboxRow[] = [
    ...conversations.map((c): InboxRow => ({
      kind: 'chat',    id: `chat:${c.deliveryId}`, sortKey: new Date(c.lastMessageAt).getTime(), unread: c.unread ?? 0, data: c,
    })),
    ...tickets.map((tk): InboxRow => ({
      kind: 'support', id: `support:${tk.id}`,     sortKey: new Date(tk.lastMessageAt).getTime(), unread: tk.unread ?? (tk.status === 'awaiting_user' ? 1 : 0), data: tk,
    })),
  ].sort((a, b) => b.sortKey - a.sortKey);

  const totalUnread = rows.reduce((sum, r) => sum + r.unread, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {onMenuPress && (
          <Pressable onPress={onMenuPress} style={styles.menuBtn} accessibilityLabel={tx('auto.MessagesInbox.openMenu', 'Open menu')} hitSlop={8}>
            <Icon name="AlignLeft" size={20} color={theme.text} />
          </Pressable>
        )}
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {t('chat.messagesTitle', { defaultValue: 'Messages' })}
        </Text>
        {totalUnread > 0 && (
          <View style={[styles.unreadPill, { backgroundColor: theme.primary }]}>
            <Text style={styles.unreadPillText}>{totalUnread}</Text>
          </View>
        )}
        {/* Support stays reachable once threads exist; the empty-state CTA
            was the only entry before (parity with the customer/driver
            ports, 2026-08-22). */}
        <Pressable
          onPress={() => router.push(`${supportRoutePrefix}/new` as any)}
          hitSlop={8}
          accessibilityLabel={tx('auto.MessagesInbox.contactSeirsSupport', 'Contact SEIRS support')}
        >
          <Icon name="LifeBuoy" size={20} color={theme.textSecond} />
        </Pressable>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.id}
          contentContainerStyle={{ paddingVertical: 4, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Icon name="MessageSquare" size={48} color={theme.textSecond} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('chat.emptyInboxTitle', { defaultValue: 'No conversations yet' })}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecond }]}>
                {t('chat.emptyInboxBody2', { defaultValue: 'Driver chats appear once a delivery is assigned. You can also start a support conversation any time.' })}
              </Text>
              <Pressable
                onPress={() => router.push(`${supportRoutePrefix}/new` as any)}
                style={[styles.emptyCta, { backgroundColor: theme.primary }]}
              >
                <Icon name="LifeBuoy" size={15} color="#fff" />
                <Text style={styles.emptyCtaText}>
                  {t('chat.startSupport', { defaultValue: 'Contact SEIRS support' })}
                </Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === 'support') {
              const tk = item.data;
              const needsReply = tk.status === 'awaiting_user';
              return (
                <Pressable
                  onPress={() => router.push(`${supportRoutePrefix}/${tk.id}` as any)}
                  style={[styles.row, { borderBottomColor: theme.border }]}
                >
                  <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                    <Icon name="LifeBuoy" size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={[styles.name, { color: theme.text }, needsReply && { fontWeight: '700' }]} numberOfLines={1}>
                        {tr('auto.messagesinbox.seirsSupport', 'SEIRS Support')}
                      </Text>
                      <Text style={[styles.time, { color: theme.textSecond }]}>
                        {formatRelativeTime(tk.lastMessageAt)}
                      </Text>
                    </View>
                    <View style={styles.rowBottom}>
                      <Text
                        style={[styles.preview, { color: needsReply ? theme.text : theme.textSecond }, needsReply && { fontWeight: '600' }]}
                        numberOfLines={1}
                      >
                        {tk.subject}
                      </Text>
                      {needsReply && (
                        <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                          <Text style={styles.badgeText}>!</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.tracking, { color: theme.textSecond }]}>Support · {tk.topic}</Text>
                  </View>
                </Pressable>
              );
            }
            const c = item.data;
            const isUnread = (c.unread ?? 0) > 0;
            return (
              <Pressable
                onPress={() => router.push(`${threadRoutePrefix}/${c.deliveryId}?other=${encodeURIComponent(c.otherParty.name)}` as any)}
                style={[styles.row, { borderBottomColor: theme.border }]}
              >
                <View style={[styles.avatar, { backgroundColor: theme.surfaceSecond }]}>
                  <Icon
                    name={c.otherParty.role === 'driver' ? 'Bike' : 'User'}
                    size={18}
                    color={theme.text}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text
                      style={[styles.name, { color: theme.text }, isUnread && { fontWeight: '700' }]}
                      numberOfLines={1}
                    >
                      {c.otherParty.name}
                    </Text>
                    <Text style={[styles.time, { color: theme.textSecond }]}>
                      {formatRelativeTime(c.lastMessageAt)}
                    </Text>
                  </View>
                  <View style={styles.rowBottom}>
                    <Text
                      style={[
                        styles.preview,
                        { color: isUnread ? theme.text : theme.textSecond },
                        isUnread && { fontWeight: '600' },
                      ]}
                      numberOfLines={1}
                    >
                      {c.lastMessage || '(no messages)'}
                    </Text>
                    {isUnread && (
                      <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                        <Text style={styles.badgeText}>{c.unread}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.tracking, { color: theme.textSecond }]}>#{c.trackingCode}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  menuBtn:     { justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  unreadPill:  { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
  unreadPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },

  // Centred 2026-08-15 (founder: the support CTA sat at the top of a
  // dead page). flexGrow on the list content lets the wrap fill and centre.
  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyBody:  { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  emptyCta:   { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999 },
  emptyCtaText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  row:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  avatar:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  rowTop:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBottom:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  name:     { flex: 1, fontSize: 14, fontWeight: '600' },
  time:     { fontSize: 11 },
  preview:  { flex: 1, fontSize: 13 },
  tracking: { fontSize: 10, marginTop: 2, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as any },
  badge:    { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, justifyContent: 'center', alignItems: 'center' },
  badgeText:{ color: '#fff', fontSize: 10, fontWeight: '700' },
});

