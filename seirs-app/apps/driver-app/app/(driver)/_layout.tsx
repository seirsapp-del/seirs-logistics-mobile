import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Briefcase, Receipt, Wallet, MessageCircle, User } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize } from '@/constants/theme';

export default function DriverLayout() {
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
        name="messages/index"
        options={{ title: 'Messages', tabBarIcon: ({ color }) => <MessageCircle size={22} color={color} strokeWidth={1.75} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={22} color={color} strokeWidth={1.75} /> }}
      />

      {/* Hidden routes — every file in this group must be listed here with
          href:null OR Expo Router auto-discovers them and renders one tab
          per route, flooding the tab bar. */}
      <Tabs.Screen name="active"                options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="kyc"                   options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="job/[id]"              options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="delivery/[id]"         options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="messages/[chatId]"     options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="notifications"         options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="ratings"               options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="withdrawal"            options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="add-bank"              options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="transaction/[id]"      options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="vehicle"               options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="schedule"              options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="help"                  options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="notification-settings" options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="privacy"               options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="change-password"       options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="delete-account"        options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="edit-profile"          options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="interstate"            options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="language"              options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="last-order"            options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="multi-leg"             options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="seirs-id"              options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="signature"             options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="status-broadcast"      options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="tax-docs"              options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="trunk-check"           options={{ href: null, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
    </Tabs>
  );
}
