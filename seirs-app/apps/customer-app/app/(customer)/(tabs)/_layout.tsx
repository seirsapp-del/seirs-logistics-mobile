import { Ionicons } from '@expo/vector-icons';
import { chatApi } from '@/services/api';
import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize } from '@/constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, focused }: { name: IoniconsName; color: string; focused: boolean }) {
  return <Ionicons name={focused ? name : (`${name}-outline` as IoniconsName)} size={24} color={color} />;
}

/**
 * Inner Tabs navigator: only the 5 bottom-bar screens live here.
 * Detail screens (request, send, edit-profile, payment, etc.) live at the
 * (customer) parent level inside a Stack so the Android back button pops
 * to the previous detail screen instead of resetting to the home tab.
 *
 * This is the standard Expo Router "Tabs inside Stack" pattern used by
 * Uber, Bolt, DoorDash, etc.
 */

// Unread chat badge (founder 2026-08-23): chat replaces phone numbers
// for rides, so a missed chat is a missed driver. 60s poll of the
// same endpoint the inbox uses.
function useChatBadge(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () => chatApi.unreadCount()
      .then((r: any) => { if (alive) setN(Number(r?.count ?? 0)); })
      .catch(() => {});
    tick();
    const t = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return n;
}

export default function CustomerTabsLayout() {
  const chatBadge = useChatBadge();
  const { t }  = useTranslation();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const insets = useSafeAreaInsets();
  const isDark = cs === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:   theme.primary,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: {
          backgroundColor: theme.navBackground,
          borderTopColor:  theme.border,
          borderTopWidth:  isDark ? 0 : 1,
          // edgeToEdgeEnabled is on and insets.bottom reports 0 on the
          // 3-button Android nav layout, which put the tab labels 10px from
          // the physical edge. The floor is the measured clearance.
          height:          64 + Math.max(insets.bottom, 12),
          paddingBottom:   10 + Math.max(insets.bottom, 12),
          paddingTop:      8,
        },
        tabBarLabelStyle: {
          fontSize:   FontSize.xs,
          fontWeight: '600',
          marginTop:  2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: (p) => <TabIcon name="home" color={p.color} focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: t('tabs.bookings'), tabBarIcon: (p) => <TabIcon name="receipt" color={p.color} focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="wallet"
        options={{ title: t('tabs.rewards'), tabBarIcon: (p) => <TabIcon name="gift" color={p.color} focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{ tabBarBadge: chatBadge > 0 ? (chatBadge > 99 ? '99+' : chatBadge) : undefined, title: t('tabs.messages'), tabBarIcon: (p) => <TabIcon name="chatbubbles" color={p.color} focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: (p) => <TabIcon name="person" color={p.color} focused={p.focused} /> }}
      />
    </Tabs>
  );
}
