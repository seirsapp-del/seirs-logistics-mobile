import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';

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
  /**
   * Senders have REWARDS, not a wallet: SEIRS holds no money for them
   * (founder, restated 2026-08-16). Only an approved partner counter has
   * a real balance in here, its EARNINGS, so only they see "Wallet".
   */
  const { user, businessRole } = useAuth();
  const isPartner = !!user?.capabilities?.canPartner || businessRole === 'partner';
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
          height: 64 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        },
        tabBarActiveTintColor:   theme.accent,
        tabBarInactiveTintColor: theme.textSecond ?? theme.tabIconDefault,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
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
      {/* The centre + tab is gone (founder 2026-08-15): booking starts
          from the dashboard's Send a Package card, the way the customer
          app books from its home cards. The wizard itself moved up to the
          (business) stack level, so it is full-screen by construction and
          the tab bar no longer needs a display:none hack. Profile takes
          the freed slot: every SEIRS app now ends its bar with Profile. */}
      {/* Wallet holds the centre slot (founder 2026-08-16): money and
          rewards are the anchor between work (left) and people (right). */}
      <Tabs.Screen
        name="wallet"
        options={{ title: isPartner ? 'Wallet' : 'Rewards', tabBarIcon: ({ focused }) => <TabIcon name={isPartner ? 'Wallet' : 'Gift'} focused={focused} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarIcon: ({ focused }) => <TabIcon name="MessageSquare" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ focused }) => <TabIcon name="User" focused={focused} /> }}
      />
    </Tabs>
  );
}
