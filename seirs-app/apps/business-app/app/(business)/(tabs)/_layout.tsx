import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

function TabIcon({ name, focused }: { name: any; focused: boolean }) {
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Icon
        name={name}
        size={22}
        color={focused ? theme.accent : theme.tabIconDefault}
        strokeWidth={focused ? 2 : 1.75}
      />
    </View>
  );
}

/**
 * Inner Tabs navigator: only the 5 bottom-bar screens.
 * Detail screens (edit-profile, csv-upload, api-keys, etc.) live at the
 * (business) parent level inside a Stack so the Android back button pops
 * to the previous screen instead of resetting to Dashboard.
 */
export default function BusinessTabsLayout() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Founder QA 2026-08-15: the five tabs sat tiny and pressed
        // against the phone's own navigation. On button-nav Androids
        // insets.bottom is 0, so the old bar had no cushion at all; the
        // labels were 10px and the inactive tint too faint to read. The
        // bar now keeps an 8px floor under it, the labels step up to 12,
        // and inactive items use the secondary text colour instead of the
        // washed-out icon default.
        tabBarStyle: {
          backgroundColor: theme.navBackground,
          borderTopColor:  theme.border,
          height: 62 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarActiveTintColor:   theme.accent,
        tabBarInactiveTintColor: theme.textSecond ?? theme.tabIconDefault,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarIcon: ({ focused }) => <TabIcon name="LayoutDashboard" focused={focused} /> }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{ title: 'Deliveries', tabBarIcon: ({ focused }) => <TabIcon name="Package" focused={focused} /> }}
      />
      <Tabs.Screen
        name="new-delivery"
        // The booking wizard runs full-screen: keeping the tab bar there
        // wasted a row mid-flow and invited mid-booking tab-hopping that
        // dropped the draft (founder 2026-08-15, matching the customer
        // Send flow, which never shows a tab bar).
        options={{ title: 'Send', tabBarStyle: { display: 'none' }, tabBarIcon: () => (
          <View style={{
            width: 44, height: 44, borderRadius: 14, backgroundColor: theme.primary,
            alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <Icon name="Plus" size={24} color={theme.textOnPrimary} strokeWidth={2} />
          </View>
        )}}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarIcon: ({ focused }) => <TabIcon name="MessageSquare" focused={focused} /> }}
      />
      <Tabs.Screen
        name="wallet"
        options={{ title: 'Wallet', tabBarIcon: ({ focused }) => <TabIcon name="Wallet" focused={focused} /> }}
      />
      {/* Team is drawer-only now (founder 2026-08-10: six tabs felt
          cramped; team management is low-frequency). href: null hides
          it from the bar while keeping the route alive for the
          drawer's "Team Members" entry. */}
      <Tabs.Screen
        name="team"
        options={{ href: null }}
      />
    </Tabs>
  );
}
