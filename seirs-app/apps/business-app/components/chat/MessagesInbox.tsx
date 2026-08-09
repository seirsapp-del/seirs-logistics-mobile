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
import { chatApi, type ChatConversationDTO } from '@/services/api';

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
}

export function MessagesInbox({ threadRoutePrefix }: MessagesInboxProps) {
  const router     = useRouter();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];
  const { t }      = useTranslation();

  const [conversations, setConversations] = useState<ChatConversationDTO[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await chatApi.conversations();
      setConversations(list ?? []);
    } catch {
      setConversations([]);
    }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {t('chat.messagesTitle', { defaultValue: 'Messages' })}
        </Text>
        {totalUnread > 0 && (
          <View style={[styles.unreadPill, { backgroundColor: theme.primary }]}>
            <Text style={styles.unreadPillText}>{totalUnread}</Text>
          </View>
        )}
      </View>

      {loading && conversations.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={c => c.deliveryId}
          contentContainerStyle={{ paddingVertical: 4 }}
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
                {t('chat.emptyInboxBody', { defaultValue: 'Chats appear here once a driver is assigned to one of your deliveries.' })}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isUnread = (item.unread ?? 0) > 0;
            return (
              <Pressable
                onPress={() => router.push(`${threadRoutePrefix}/${item.deliveryId}?other=${encodeURIComponent(item.otherParty.name)}` as any)}
                style={[styles.row, { borderBottomColor: theme.border }]}
              >
                <View style={[styles.avatar, { backgroundColor: theme.surfaceSecond }]}>
                  <Icon
                    name={item.otherParty.role === 'driver' ? 'Bike' : 'User'}
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
                      {item.otherParty.name}
                    </Text>
                    <Text style={[styles.time, { color: theme.textSecond }]}>
                      {formatRelativeTime(item.lastMessageAt)}
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
                      {item.lastMessage || '(no messages)'}
                    </Text>
                    {isUnread && (
                      <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                        <Text style={styles.badgeText}>{item.unread}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.tracking, { color: theme.textSecond }]}>#{item.trackingCode}</Text>
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
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  unreadPill:  { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
  unreadPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },

  emptyWrap:  { alignItems: 'center', paddingHorizontal: 40, paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyBody:  { fontSize: 13, textAlign: 'center', lineHeight: 18 },

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

