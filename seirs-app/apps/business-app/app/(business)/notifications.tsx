/**
 * Business/partner notification centre.
 *
 * Same data source as customer + driver apps (GET /notifications): admin
 * broadcasts and automatic delivery/payment events land here as rows, so
 * business users can see them even before push notifications ship.
 * Kept restrained visually per the business-app gold standard: flat rows,
 * no coloured cards.
 */
import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { notificationsApi } from '@/services/api';

import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
interface Notif {
  id:    string;
  type:  string;
  title: string;
  body:  string;
  time:  string;
  read:  boolean;
  // The notification row carries the delivery it is about. Without it the
  // row only un-bolded itself: a "package delivered" notification was a
  // dead end (B-1.4).
  deliveryId?: string;
}

// Brand palette only: green, sky blue, navy (dark mode gets the muted
// sky so navy stays readable). No purple: it is not a SEIRS colour.
function iconFor(type: string | undefined, isDark: boolean): { name: string; color: string } {
  const t = type ?? '';
  if (t.includes('payment') || t.includes('wallet'))   return { name: 'Banknote', color: '#16A34A' };
  if (t.includes('delivery') || t.includes('job'))     return { name: 'Package',  color: '#3A7BD5' };
  return { name: 'Megaphone', color: isDark ? '#7FA8D9' : '#0F2B4C' };
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (!d) return '';
  const delta = (Date.now() - d) / 1000;
  if (delta < 60)     return 'Just now';
  if (delta < 3600)   return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400)  return new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
  if (delta < 172800) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

export default function BusinessNotificationsScreen() {
  const router     = useRouter();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];

  const [notifs,     setNotifs]     = useState<Notif[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await notificationsApi.list(1);
      setNotifs((res.items ?? []).map((n: any) => ({
        id:    n.id,
        type:  n.type ?? '',
        title: n.title ?? 'Notification',
        body:  n.body ?? n.message ?? '',
        time:  relativeTime(n.createdAt ?? ''),
        read:  !!n.isRead || !!n.readAt || !!n.read,
        deliveryId: n.deliveryId ?? undefined,
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

  const dismissOne = async (id: string) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
    try { await notificationsApi.remove(id); } catch {}
  };

  const clearAll = () => {
    // Cancel LAST: three options stack vertically, and reading a list of
    // real choices with the way out at the top is backwards going down a
    // page. Android put it first; this dialog does not have to.
    alertDialog('Clear notifications', 'Which ones should go?', [
      {
        text: tr('auto.notifications.clearReadOnly', 'Clear read only'),
        onPress: async () => {
          setNotifs(prev => prev.filter(n => !n.read));
          try { await notificationsApi.removeAll(true); } catch {}
        },
      },
      {
        text: tr('auto.notifications.clearEverything', 'Clear everything'),
        style: 'destructive',
        onPress: async () => {
          setNotifs([]);
          try { await notificationsApi.removeAll(false); } catch {}
        },
      },
      { text: tr('auto.payoutAccount.cancel', 'Cancel'), style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel={tx('auto.notifications.back', 'Back')}>
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{tx('auto.notifications.notifications', 'Notifications')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {unreadCount > 0 && (
            <Pressable onPress={markAllRead} hitSlop={8}>
              <Text style={[styles.markAll, { color: theme.primary }]}>{tx('auto.notifications.markAllRead', 'Mark all read')}</Text>
            </Pressable>
          )}
          {notifs.length > 0 && (
            <Pressable onPress={clearAll} hitSlop={8} accessibilityLabel={tx('auto.notifications.clearNotifications', 'Clear notifications')}>
              <Icon name="Trash2" size={18} color={theme.textSecond} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingVertical: 4, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Icon name="BellOff" size={44} color={theme.textSecond} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{tx('auto.notifications.noNotifications', 'No notifications')}</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecond }]}>
                {tr('auto.notifications.deliveryUpdatesAndSeirsAnnouncements', 'Delivery updates and SEIRS announcements will appear here.')}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const ic = iconFor(`${item.type} ${item.title}`.toLowerCase(), isDark);
            return (
              <Swipeable
                overshootRight={false}
                renderRightActions={() => (
                  <Pressable style={styles.dismissAction} onPress={() => dismissOne(item.id)}>
                    <Icon name="Trash2" size={18} color="#fff" />
                    <Text style={styles.dismissText}>{tx('auto.notifications.dismiss', 'Dismiss')}</Text>
                  </Pressable>
                )}
              >
              <Pressable
                onPress={() => {
                  markOneRead(item.id);
                  // Open what the notification is ABOUT when the payload
                  // names a delivery (B-1.4). Announcements carry none and
                  // correctly stay put.
                  if (item.deliveryId) router.push(`/(business)/delivery/${item.deliveryId}` as any);
                }}
                style={[styles.row, { borderBottomColor: theme.border, backgroundColor: theme.background }]}
              >
                <View style={[styles.rowIcon, { backgroundColor: ic.color + '15' }]}>
                  <Icon name={ic.name as any} size={18} color={ic.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text
                      style={[styles.rowTitle, { color: theme.text }, !item.read && { fontWeight: '700' }]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    {!item.read && <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />}
                  </View>
                  <Text style={[styles.rowBody, { color: theme.textSecond }]} numberOfLines={2}>{item.body}</Text>
                  <Text style={[styles.rowTime, { color: theme.textSecond }]}>{item.time}</Text>
                </View>
              </Pressable>
              </Swipeable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  markAll:     { fontSize: 14, fontWeight: '600' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  dismissAction: { backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center', width: 80, gap: 2 },
  dismissText:   { color: '#fff', fontSize: 12, fontWeight: '700' },

  row:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  rowIcon:   { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  rowTop:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle:  { flex: 1, fontSize: 15, fontWeight: '600' },
  rowBody:   { fontSize: 14, lineHeight: 18, marginTop: 2 },
  rowTime:   { fontSize: 12, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },

  emptyWrap:  { alignItems: 'center', paddingHorizontal: 40, paddingTop: 90, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyBody:  { fontSize: 14, textAlign: 'center', lineHeight: 18 },
});
