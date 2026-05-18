/**
 * Customer Messages tab — list of conversations.
 *
 * Pulls live data from chatApi.conversations() (one entry per delivery
 * the user has chatted in). Pull-to-refresh re-fetches; tapping a row
 * opens the chat detail screen. The previous implementation showed
 * MOCK_MESSAGES; with the backend chat module live this now reflects
 * real customer ↔ driver threads.
 */
import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { CountBadge } from '@/components/ui/Badge';
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

export default function MessagesScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

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
        <Text style={[styles.title, { color: theme.text }]}>{t('messages.title')}</Text>
        {totalUnread > 0 && (
          <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
            <Text style={styles.unreadBadgeText}>{totalUnread}</Text>
          </View>
        )}
      </View>

      {loading && conversations.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceSecond }]}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.textThird} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('messages.empty')}</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
            {t('messages.emptyDesc')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.deliveryId}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.surface },
                pressed && { opacity: 0.8 },
              ]}
              onPress={() =>
                router.push({ pathname: '/(customer)/messages/[chatId]', params: { chatId: item.deliveryId } })
              }
            >
              <View style={styles.avatarWrap}>
                <Avatar name={item.otherParty.name} size={52} />
              </View>
              <View style={styles.msgInfo}>
                <View style={styles.msgTop}>
                  <Text style={[styles.msgName, { color: theme.text }]} numberOfLines={1}>
                    {item.otherParty.name}
                  </Text>
                  <Text style={[styles.msgTime, { color: theme.textSecond }]}>
                    {formatRelativeTime(item.lastMessageAt)}
                  </Text>
                </View>
                <View style={styles.msgBottom}>
                  <Text
                    style={[
                      styles.msgPreview,
                      { color: item.unread > 0 ? theme.text : theme.textSecond },
                      item.unread > 0 && { fontWeight: FontWeight.semibold },
                    ]}
                    numberOfLines={1}
                  >
                    {item.lastMessage}
                  </Text>
                  {item.unread > 0 && <CountBadge count={item.unread} />}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  title:           { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  unreadBadge:     { minWidth: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  unreadBadgeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  list:    { paddingVertical: Spacing.xs },
  divider: { height: 1, marginLeft: 76 },

  row:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  avatarWrap: { position: 'relative' },

  msgInfo:   { flex: 1 },
  msgTop:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, gap: Spacing.sm },
  msgName:   { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.bold },
  msgTime:   { fontSize: FontSize.xs },
  msgBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  msgPreview:{ flex: 1, fontSize: FontSize.sm },

  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm },
  emptyTitle:{ fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  emptyDesc: { fontSize: FontSize.base, textAlign: 'center', lineHeight: 22 },
});
