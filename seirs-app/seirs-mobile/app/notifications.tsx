import {
  View, Text, Pressable, StyleSheet,
  FlatList, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useNotifications, AppNotification } from '@/hooks/useNotifications';

const TYPE_ICONS: Record<string, string> = {
  job_request:       '🚀',
  delivery_assigned: '🎯',
  status_update:     '📦',
  delivery_complete: '✅',
  payment_received:  '💰',
  general:           '🔔',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function NotificationsScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];

  const { notifications, unreadCount, loading, refresh, markRead, markAllRead } =
    useNotifications();

  const handlePress = (notif: AppNotification) => {
    if (!notif.isRead) markRead(notif.id);
    if (notif.trackingCode) {
      router.push({ pathname: '/(customer)/track', params: { code: notif.trackingCode } } as any);
    } else if (notif.deliveryId) {
      router.push('/(customer)/history' as any);
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => (
    <Pressable
      style={[
        styles.item,
        { backgroundColor: item.isRead ? theme.surface : theme.primary + '10' },
        Shadows.sm,
      ]}
      onPress={() => handlePress(item)}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.surfaceSecond }]}>
        <Text style={styles.typeIcon}>{TYPE_ICONS[item.type] ?? '🔔'}</Text>
      </View>
      <View style={styles.itemBody}>
        <Text style={[styles.itemTitle, { color: theme.text }, !item.isRead && { fontWeight: FontWeight.bold }]}>
          {item.title}
        </Text>
        <Text style={[styles.itemBody2, { color: theme.textSecond }]} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={[styles.itemTime, { color: theme.textSecond }]}>
          {timeAgo(item.createdAt)}
        </Text>
      </View>
      {!item.isRead && (
        <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
      )}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.primary }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
        {unreadCount > 0 && (
          <Pressable onPress={markAllRead}>
            <Text style={[styles.markAll, { color: theme.primary }]}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No notifications yet</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
            You'll see delivery updates and alerts here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onRefresh={refresh}
          refreshing={loading}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  backBtn:    { minWidth: 60 },
  backText:   { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  title:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  markAll:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium, minWidth: 90, textAlign: 'right' },
  list:       { padding: Spacing.xl, gap: Spacing.sm },
  item:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md },
  iconWrap:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  typeIcon:   { fontSize: 20 },
  itemBody:   { flex: 1, gap: 2 },
  itemTitle:  { fontSize: FontSize.base },
  itemBody2:  { fontSize: FontSize.sm, lineHeight: 18 },
  itemTime:   { fontSize: FontSize.xs, marginTop: 2 },
  unreadDot:  { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md, padding: Spacing.xl },
  emptyIcon:  { fontSize: 56 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  emptyDesc:  { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 22 },
});
