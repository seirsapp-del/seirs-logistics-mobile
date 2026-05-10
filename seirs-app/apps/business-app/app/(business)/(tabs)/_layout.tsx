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
 * Inner Tabs navigator — only the 5 bottom-bar screens.
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
        tabBarStyle: {
          backgroundColor: theme.navBackground,
          borderTopColor:  theme.border,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor:   theme.accent,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
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
        options={{ title: 'Send', tabBarIcon: () => (
          <View style={{
            width: 44, height: 44, borderRadius: 14, backgroundColor: theme.primary,
            alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <Icon name="Plus" size={24} color={theme.textOnPrimary} strokeWidth={2} />
          </View>
        )}}
      />
      <Tabs.Screen
        name="wallet"
        options={{ title: 'Wallet', tabBarIcon: ({ focused }) => <TabIcon name="Wallet" focused={focused} /> }}
      />
      <Tabs.Screen
        name="team"
        options={{ title: 'Team', tabBarIcon: ({ focused }) => <TabIcon name="Users" focused={focused} /> }}
      />
    </Tabs>
  );
}
