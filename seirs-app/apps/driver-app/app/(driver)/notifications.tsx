import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { notificationsApi } from '@/services/api';

type NotifType = 'job' | 'payment' | 'system' | 'rating';

interface Notif {
  id:     string;
  type:   NotifType;
  title:  string;
  body:   string;
  time:   string;
  read:   boolean;
}

const TYPE_CONFIG: Record<NotifType, { color: string; icon: string }> = {
  job:     { color: '#3A86FF', icon: 'briefcase-outline' },
  payment: { color: '#22C55E', icon: 'cash-outline' },
  system:  { color: '#8B5CF6', icon: 'megaphone-outline' },
  rating:  { color: '#FFBE0B', icon: 'star-outline' },
};

// Map backend notification.type → our 4 visual buckets.
function bucketType(t: string | undefined): NotifType {
  if (!t) return 'system';
  if (t.includes('payment') || t.includes('earning') || t.includes('payout')) return 'payment';
  if (t.includes('rating')  || t.includes('review'))                          return 'rating';
  if (t.includes('job')     || t.includes('delivery'))                        return 'job';
  return 'system';
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (!d) return '';
  const delta = (Date.now() - d) / 1000;
  if (delta < 60)     return 'Just now';
  if (delta < 3600)   return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400)  return new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
  if (delta < 172800) return 'Yesterday';
  if (delta < 604800) return `${Math.floor(delta / 86400)} days ago`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

export default function DriverNotificationsScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [notifs,     setNotifs]     = useState<Notif[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await notificationsApi.list(1);
      setNotifs((res.items ?? []).map((n: any) => ({
        id:    n.id,
        type:  bucketType(n.type),
        title: n.title ?? 'Notification',
        body:  n.body ?? n.message ?? '',
        time:  relativeTime(n.createdAt ?? n.timestamp ?? new Date().toISOString()),
        read:  !!n.readAt || !!n.read,
      })));
    } catch {
      setNotifs([]);
    }
  }, []);

  useEffect(() => {
    (async () => { await load(); setLoading(false); })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    try { await notificationsApi.markAllRead(); } catch {}
  };

  const markOneRead = async (id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try { await notificationsApi.markRead(id); } catch {}
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={markAllRead}>
            <Text style={[styles.markAll, { color: theme.primary }]}>Mark all read</Text>
          </Pressable>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      <FlatList
        data={notifs}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}><ActivityIndicator color={theme.primary} /></View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={48} color={theme.textThird} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No notifications</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const cfg = TYPE_CONFIG[item.type];
          return (
            <Pressable
              style={[
                styles.notifCard,
                { backgroundColor: item.read ? theme.surface : (isDark ? '#001020' : '#EFF6FF'), borderColor: item.read ? theme.border : theme.primary + '30' },
                Shadows.xs,
              ]}
              onPress={() => markOneRead(item.id)}
            >
              <View style={[styles.notifIcon, { backgroundColor: cfg.color + '18' }]}>
                <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
              </View>
              <View style={styles.notifBody}>
                <View style={styles.notifTitleRow}>
                  <Text style={[styles.notifTitle, { color: theme.text }]} numberOfLines={1}>{item.title}</Text>
                  {!item.read && <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />}
                </View>
                <Text style={[styles.notifBody2, { color: theme.textSecond }]} numberOfLines={2}>{item.body}</Text>
                <Text style={[styles.notifTime, { color: theme.textThird }]}>{item.time}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  markAll: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },

  notifCard:    { flexDirection: 'row', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  notifIcon:    { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  notifBody:    { flex: 1, gap: 3 },
  notifTitleRow:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  notifTitle:   { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  notifBody2:   { fontSize: FontSize.sm, lineHeight: 20 },
  notifTime:    { fontSize: FontSize.xs, marginTop: 2 },
  unreadDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },

  empty:      { paddingTop: Spacing.xl * 3, alignItems: 'center', gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
});
