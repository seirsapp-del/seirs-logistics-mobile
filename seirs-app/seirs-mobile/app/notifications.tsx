import {
  View, Text, Pressable, StyleSheet,
  FlatList, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useNotifications, AppNotification } from '@/hooks/useNotifications';

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  job_request:       { icon: 'briefcase-outline',        color: '#3B82F6' },
  delivery_assigned: { icon: 'navigate-outline',         color: '#F4600C' },
  status_update:     { icon: 'cube-outline',             color: '#8B5CF6' },
  delivery_complete: { icon: 'checkmark-circle-outline', color: '#22C55E' },
  payment_received:  { icon: 'cash-outline',             color: '#22C55E' },
  general:           { icon: 'notifications-outline',    color: '#00C2FF' },
};

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
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

  const renderItem = ({ item }: { item: AppNotification }) => {
    const typeConfig = TYPE_ICONS[item.type] ?? TYPE_ICONS.general;
    return (
      <Pressable
        style={[
          styles.item,
          { backgroundColor: item.isRead ? theme.surface : theme.primary + '0D' },
          Shadows.sm,
        ]}
        onPress={() => handlePress(item)}
      >
        <View style={[styles.iconWrap, { backgroundColor: typeConfig.color + '18' }]}>
          <Ionicons name={typeConfig.icon as any} size={22} color={typeConfig.color} />
        </View>
        <View style={styles.itemContent}>
          <Text style={[
            styles.itemTitle,
            { color: theme.text },
            !item.isRead && { fontWeight: FontWeight.bold },
          ]}>
            {item.title}
          </Text>
          <Text style={[styles.itemBody, { color: theme.textSecond }]} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={[styles.itemTime, { color: theme.textThird }]}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
        {!item.isRead && (
          <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      {/* Header */}
      <View style={[styles.headerBar, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.backCircle, { backgroundColor: theme.surface }]}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={markAllRead} style={[styles.markAllBtn, { backgroundColor: theme.surfaceSecond }]}>
            <Text style={[styles.markAll, { color: theme.primary }]}>Mark all read</Text>
          </Pressable>
        ) : (
          <View style={{ width: 88 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <View style={[styles.emptyIconWrap, { backgroundColor: theme.surface }]}>
            <Ionicons name="notifications-outline" size={52} color={theme.textThird} />
          </View>
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
  headerBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  markAllBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full },
  markAll:    { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  list:        { padding: Spacing.md, gap: Spacing.sm },
  item:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md },
  iconWrap:    { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  itemContent: { flex: 1, gap: 3 },
  itemTitle:   { fontSize: FontSize.base },
  itemBody:    { fontSize: FontSize.sm, lineHeight: 18 },
  itemTime:    { fontSize: FontSize.xs },
  unreadDot:   { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },

  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md, padding: Spacing.xl },
  emptyIconWrap:{ width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  emptyTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  emptyDesc:    { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 22 },
});
