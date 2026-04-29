import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

type NotifType = 'job' | 'payment' | 'system' | 'rating';

interface Notif {
  id:     string;
  type:   NotifType;
  title:  string;
  body:   string;
  time:   string;
  read:   boolean;
}

const MOCK_NOTIFS: Notif[] = [
  { id: 'n1', type: 'job',     title: 'New Job Available',         body: 'Instant delivery request — Victoria Island to Lekki. ₦1,920 earnings.',                  time: '10:32 AM', read: false },
  { id: 'n2', type: 'payment', title: 'Earnings Credited',         body: '₦1,920 has been credited to your SEIRS wallet for trip SRS-VT12AB34.',                    time: '10:30 AM', read: false },
  { id: 'n3', type: 'rating',  title: 'New Rating Received',       body: 'Adaeze O. gave you 5 stars! "Very professional and punctual!"',                            time: 'Yesterday', read: true },
  { id: 'n4', type: 'payment', title: 'Earnings Credited',         body: '₦2,480 has been credited to your SEIRS wallet for trip SRS-YB56CD78.',                    time: 'Yesterday', read: true },
  { id: 'n5', type: 'system',  title: 'Profile Verified',          body: 'Your KYC documents have been approved. You are now eligible for all job types.',          time: '2 days ago', read: true },
  { id: 'n6', type: 'job',     title: 'Job Assigned',              body: 'New delivery assigned: Surulere to Ajah, 18.6 km. Estimated ₦3,840 earnings.',             time: '3 days ago', read: true },
  { id: 'n7', type: 'system',  title: 'Weekend Bonus Active',      body: 'Earn an extra ₦500 bonus for every 5 trips completed this weekend!',                      time: '4 days ago', read: true },
];

const TYPE_CONFIG: Record<NotifType, { color: string; icon: string }> = {
  job:     { color: '#3A86FF', icon: 'briefcase-outline' },
  payment: { color: '#22C55E', icon: 'cash-outline' },
  system:  { color: '#8B5CF6', icon: 'megaphone-outline' },
  rating:  { color: '#FFBE0B', icon: 'star-outline' },
};

export default function DriverNotificationsScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [notifs, setNotifs] = useState<Notif[]>(MOCK_NOTIFS);

  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = () => setNotifs(prev => prev.map(n => ({ ...n, read: true })));

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
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color={theme.textThird} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No notifications</Text>
          </View>
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
              onPress={() => setNotifs(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n))}
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
