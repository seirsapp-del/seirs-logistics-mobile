/**
 * Bell with a live unread badge, matching the driver hub's (founder
 * 2026-08-22: every app shows WHETHER there is something unread, not
 * just a door to go look). Polls the unread count on mount and then
 * every 60s; the count also refreshes whenever the bell is tapped,
 * since opening the centre is what clears it.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { useColors } from '@/context/ThemeContext';
import { notificationsApi } from '@/services/api';
import { tx } from '@/i18n/tx';

interface NotificationBellProps {
  size?:  number;
  /** Icon color. Pass '#fff' on the navy header. */
  color?: string;
}

export function NotificationBell({ size = 20, color }: NotificationBellProps = {}) {
  const router = useRouter();
  const colors = useColors();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    notificationsApi.unreadCount()
      .then((r: any) => setUnread(Number(r?.count ?? r ?? 0)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <Pressable
      onPress={() => { router.push('/(business)/notifications' as any); setTimeout(refresh, 1500); }}
      style={styles.wrap}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : tx('auto.settings.notifications', 'Notifications')}
    >
      <Icon name="Bell" size={size} color={color ?? colors.text} strokeWidth={1.5} />
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap:      { position: 'relative', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' },
  badge:     { position: 'absolute', top: 2, right: 2, minWidth: 17, height: 17, borderRadius: 9, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
