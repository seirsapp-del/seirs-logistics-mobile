import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Briefcase, Receipt, Wallet, MessageCircle, User } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize } from '@/constants/theme';

/**
 * Inner Tabs navigator — only the 5 bottom-bar screens.
 * Detail screens (active, kyc, job/[id], delivery/[id], etc.) live at the
 * (driver) parent level inside a Stack so the Android back button works
 * naturally. Standard Expo Router "Tabs inside Stack" pattern.
 */
export default function DriverTabsLayout() {
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
          height:          64 + insets.bottom,
          paddingBottom:   10 + insets.bottom,
          paddingTop:      8,
        },
        tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Jobs', tabBarIcon: ({ color }) => <Briefcase size={22} color={color} strokeWidth={1.75} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'Trips', tabBarIcon: ({ color }) => <Receipt size={22} color={color} strokeWidth={1.75} /> }}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Earnings', tabBarIcon: ({ color }) => <Wallet size={22} color={color} strokeWidth={1.75} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarIcon: ({ color }) => <MessageCircle size={22} color={color} strokeWidth={1.75} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={22} color={color} strokeWidth={1.75} /> }}
      />
    </Tabs>
  );
}
