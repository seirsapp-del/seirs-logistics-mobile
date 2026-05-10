/**
 * Driver Messages tab — list of conversations.
 *
 * Pulls live data from chatApi.conversations() (one entry per delivery
 * the driver has chatted in). Pull-to-refresh re-fetches; tapping a
 * row opens the chat detail screen at /(driver)/messages/[chatId].
 */
import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { chatApi, type ChatConversationDTO } from '@/services/api';

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

  const [conversations, setConversations] = useState<ChatConversationDTO[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await chatApi.conversations();
      setConversations(list);
    } catch {
      setConversations([]);
    }
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

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

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

      {loading && conversations.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.deliveryId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name="chatbubbles-outline" size={44} color={theme.textThird} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No messages yet</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>Customer chats appear here during active trips.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.chatCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
                Shadows.sm,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() =>
                router.push({ pathname: '/(driver)/messages/[chatId]', params: { chatId: item.deliveryId } })
              }
            >
              <View style={styles.avatarWrap}>
                <Avatar name={item.otherParty.name} size={48} />
                {item.unread > 0 && (
                  <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.badgeText}>{item.unread}</Text>
                  </View>
                )}
              </View>

              <View style={styles.chatBody}>
                <View style={styles.chatTopRow}>
                  <Text style={[styles.chatName, { color: theme.text }]} numberOfLines={1}>{item.otherParty.name}</Text>
                  <Text style={[styles.chatTime, { color: theme.textThird }]}>{formatRelativeTime(item.lastMessageAt)}</Text>
                </View>
                <View style={styles.chatBottomRow}>
                  <Text
                    style={[
                      styles.chatPreview,
                      { color: item.unread > 0 ? theme.text : theme.textSecond },
                      item.unread > 0 && { fontWeight: FontWeight.semibold },
                    ]}
                    numberOfLines={1}
                  >
                    {item.lastMessage}
                  </Text>
                </View>
                <Text style={[styles.tripTag, { color: theme.textThird }]}>Tracking #{item.trackingCode}</Text>
              </View>

              <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
            </Pressable>
          )}
        />
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

  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl, flexGrow: 1 },

  chatCard:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  avatarWrap:   { position: 'relative' },
  badge:        { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  badgeText:    { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },
  chatBody:     { flex: 1, gap: 2 },
  chatTopRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatName:     { fontSize: FontSize.base, fontWeight: FontWeight.bold, flex: 1, marginRight: Spacing.sm },
  chatTime:     { fontSize: FontSize.xs },
  chatBottomRow:{ flexDirection: 'row', alignItems: 'center' },
  chatPreview:  { fontSize: FontSize.sm, flex: 1 },
  tripTag:      { fontSize: 10, marginTop: 2 },

  empty:      { paddingTop: Spacing.xl * 2, alignItems: 'center', gap: Spacing.md },
  emptyIcon:  { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  emptyDesc:  { fontSize: FontSize.base, textAlign: 'center' },
});
