import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar, RefreshControl, ActivityIndicator,
  Alert,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { notificationsApi } from '@/services/api';

type NotifType = 'job' | 'payment' | 'system' | 'rating';

interface Notif {
  id:         string;
  type:       NotifType;
  rawType:    string;
  title:      string;
  body:       string;
  time:       string;
  read:       boolean;
  deliveryId: string | null;
}

// Brand palette only (founder 2026-08-10: the old purple system chip
// was off-brand): sky blue, green, navy, yellow.
const TYPE_CONFIG: Record<NotifType, { color: string; icon: string }> = {
  job:     { color: '#3A7BD5', icon: 'briefcase-outline' },
  payment: { color: '#16A34A', icon: 'cash-outline' },
  system:  { color: '#0F2B4C', icon: 'megaphone-outline' },
  rating:  { color: '#FFBE0B', icon: 'star-outline' },
};
// Navy is invisible on the dark theme; swap the system chip to the sky
// tone there. Everything else reads fine on both.
const SYSTEM_DARK = '#7FA8D9';

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
        id:         n.id,
        type:       bucketType(n.type),
        rawType:    String(n.type ?? ''),
        title:      n.title ?? 'Notification',
        body:       n.body ?? n.message ?? '',
        time:       relativeTime(n.createdAt ?? n.timestamp ?? new Date().toISOString()),
        read:       !!n.isRead || !!n.readAt || !!n.read,
        deliveryId: n.deliveryId ?? null,
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

  // Mass clear (founder 2026-08-10): one action instead of a hundred
  // individual swipes.
  const clearAll = () => {
    Alert.alert('Clear notifications', 'Which ones should go?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear read only',
        onPress: async () => {
          setNotifs(prev => prev.filter(n => !n.read));
          try { await notificationsApi.removeAll(true); } catch {}
        },
      },
      {
        text: 'Clear everything',
        style: 'destructive',
        onPress: async () => {
          setNotifs([]);
          try { await notificationsApi.removeAll(false); } catch {}
        },
      },
    ]);
  };

  const markOneRead = async (id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try { await notificationsApi.markRead(id); } catch {}
  };

  // Swipe-to-dismiss (founder 2026-08-10): removes the row immediately
  // and deletes server-side so it never comes back on refresh.
  const dismissOne = async (id: string) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
    try { await notificationsApi.remove(id); } catch {}
  };

  // Tapping a notification acts on it, not just marks it read (founder
  // ask 2026-08-09: "what action can they do by clicking?").
  const handleTap = (n: Notif) => {
    markOneRead(n.id);

    // Safety check-in: give real choices instead of a dead tap.
    if (n.title.startsWith('Are you OK')) {
      Alert.alert(
        'Are you OK?',
        'We could not see your location for a while. If everything is fine just confirm; if not, get help now.',
        [
          { text: "I'm OK", style: 'default' },
          { text: 'Contact support', onPress: () => router.push('/(driver)/support/new' as any) },
          { text: 'SOS Emergency', style: 'destructive', onPress: () => router.push('/(driver)/sos' as any) },
        ],
      );
      return;
    }
    if (n.rawType === 'sos_alert') { router.push('/(driver)/sos' as any); return; }
    if (n.title.toLowerCase().includes('document')) { router.push('/(driver)/tax-docs' as any); return; }
    switch (n.type) {
      case 'payment': router.push('/(driver)/(tabs)/earnings' as any); break;
      case 'rating':  router.push('/(driver)/ratings' as any); break;
      case 'job':     router.push(n.deliveryId ? ('/(driver)/active' as any) : ('/(driver)/(tabs)' as any)); break;
      default: break; // system/broadcast: nothing to open
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          {unreadCount > 0 && (
            <Pressable onPress={markAllRead}>
              <Text style={[styles.markAll, { color: theme.primary }]}>Mark all read</Text>
            </Pressable>
          )}
          {notifs.length > 0 && (
            <Pressable onPress={clearAll} hitSlop={8} accessibilityLabel="Clear notifications">
              <Ionicons name="trash-outline" size={20} color={theme.textSecond} />
            </Pressable>
          )}
        </View>
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
          const chipColor = item.type === 'system' && isDark ? SYSTEM_DARK : cfg.color;
          return (
            <Swipeable
              overshootRight={false}
              renderRightActions={() => (
                <Pressable style={styles.dismissAction} onPress={() => dismissOne(item.id)}>
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                  <Text style={styles.dismissText}>Dismiss</Text>
                </Pressable>
              )}
            >
              <Pressable
                style={[
                  styles.notifCard,
                  { backgroundColor: item.read ? theme.surface : (isDark ? '#001020' : '#EFF6FF'), borderColor: item.read ? theme.border : theme.primary + '30' },
                  Shadows.xs,
                ]}
                onPress={() => handleTap(item)}
              >
                <View style={[styles.notifIcon, { backgroundColor: chipColor + '18' }]}>
                  <Ionicons name={cfg.icon as any} size={20} color={chipColor} />
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
            </Swipeable>
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

  dismissAction: { backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center', width: 84, borderRadius: Radius.xl, marginLeft: Spacing.xs, gap: 2 },
  dismissText:   { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  empty:      { paddingTop: Spacing.xl * 3, alignItems: 'center', gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
});
