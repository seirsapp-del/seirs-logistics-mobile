import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { MOCK_DRIVER_MESSAGES } from '@/constants/driverMockData';

export default function DriverMessagesScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>Messages</Text>
        {MOCK_DRIVER_MESSAGES.some(m => m.unread > 0) && (
          <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
            <Text style={styles.unreadCount}>
              {MOCK_DRIVER_MESSAGES.reduce((s, m) => s + m.unread, 0)}
            </Text>
          </View>
        )}
      </View>

      <FlatList
        data={MOCK_DRIVER_MESSAGES}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
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
            onPress={() => router.push({ pathname: '/(driver)/messages/[chatId]', params: { chatId: item.id } })}
          >
            <View style={styles.avatarWrap}>
              <Avatar name={item.customer.name} size={48} />
              {item.unread > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                  <Text style={styles.badgeText}>{item.unread}</Text>
                </View>
              )}
            </View>

            <View style={styles.chatBody}>
              <View style={styles.chatTopRow}>
                <Text style={[styles.chatName, { color: theme.text }]} numberOfLines={1}>{item.customer.name}</Text>
                <Text style={[styles.chatTime, { color: theme.textThird }]}>{item.lastTime}</Text>
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
              <Text style={[styles.tripTag, { color: theme.textThird }]}>Trip #{item.tripId}</Text>
            </View>

            <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs },
  title:       { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  unreadBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  unreadCount: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },

  chatCard:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  avatarWrap:   { position: 'relative' },
  badge:        { position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
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
