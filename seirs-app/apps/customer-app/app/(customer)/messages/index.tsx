import {
  View, Text, Pressable, StyleSheet, FlatList, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { CountBadge } from '@/components/ui/Badge';
import { MOCK_MESSAGES } from '@/constants/mockData';

export default function MessagesScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>Messages</Text>
        <View style={styles.headerRight}>
          <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
            <Text style={styles.unreadBadgeText}>
              {MOCK_MESSAGES.reduce((s, m) => s + m.unread, 0)}
            </Text>
          </View>
        </View>
      </View>

      {MOCK_MESSAGES.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceSecond }]}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.textThird} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No messages yet</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
            Messages from your drivers will appear here during and after trips.
          </Text>
        </View>
      ) : (
        <FlatList
          data={MOCK_MESSAGES}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.surface },
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => router.push({ pathname: '/(customer)/messages/[chatId]', params: { chatId: item.id } })}
            >
              <View style={styles.avatarWrap}>
                <Avatar name={item.driver.name} size={52} />
                <View style={[styles.onlineDot, { backgroundColor: '#22C55E', borderColor: theme.surface }]} />
              </View>
              <View style={styles.msgInfo}>
                <View style={styles.msgTop}>
                  <Text style={[styles.msgName, { color: theme.text }]}>{item.driver.name}</Text>
                  <Text style={[styles.msgTime, { color: theme.textSecond }]}>{item.lastTime}</Text>
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
  headerRight:     { flexDirection: 'row', alignItems: 'center' },
  unreadBadge:     { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  list:    { paddingVertical: Spacing.xs },
  divider: { height: 1, marginLeft: 76 },

  row:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  avatarWrap: { position: 'relative' },
  onlineDot:  { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },

  msgInfo:   { flex: 1 },
  msgTop:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  msgName:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  msgTime:   { fontSize: FontSize.xs },
  msgBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  msgPreview:{ flex: 1, fontSize: FontSize.sm },

  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm },
  emptyTitle:{ fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  emptyDesc: { fontSize: FontSize.base, textAlign: 'center', lineHeight: 22 },
});
