import { useCallback } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useNotifications } from '@/hooks/useNotifications';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { tx } from '@/i18n/tx';

interface NotificationBellProps {
  /** Bell icon size in pixels. Default 22. */
  size?:  number;
  /** Icon stroke color. Default falls back to current theme.text: pass
   *  '#fff' when rendering on a dark/coloured header. */
  color?: string;
}

export function NotificationBell({ size = 22, color }: NotificationBellProps = {}) {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const { unreadCount, refresh } = useNotifications();

  /**
   * Re-ask on every focus.
   *
   * The count lives in a shared store that only the notifications screen
   * ever refreshed, so the bell kept whatever number it last saw. The
   * founder cleared his notifications, the server went to zero, and the
   * badge sat on "99+" indefinitely (2026-08-31). Reading a stale number
   * is worse than reading none: it trains a rider to ignore the bell.
   */
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return (
    <Pressable
      onPress={() => router.push('/notifications' as any)}
      style={styles.wrap}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : tx('auto.notifications.notifications', 'Notifications')}
    >
      <Bell size={size} color={color ?? theme.text} strokeWidth={1.5} />
      {unreadCount > 0 && (
        <View style={[styles.badge, { backgroundColor: theme.primary }]}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap:      { position: 'relative', width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  badge:     { position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
