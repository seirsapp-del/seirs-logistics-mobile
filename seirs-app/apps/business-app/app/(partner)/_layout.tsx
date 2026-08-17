import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { useColors } from '@/context/ThemeContext';

function TabIcon({ name, focused }: { name: any; focused: boolean }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Icon
        name={name}
        size={22}
        color={focused ? colors.accent : colors.tabIconDefault}
        strokeWidth={focused ? 2 : 1.75}
      />
    </View>
  );
}

export default function PartnerLayout() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.navBackground,
          borderTopColor:  colors.border,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor:   colors.accent,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
      }}
    >
      {/* FIVE tabs, no more (founder 2026-08-16: the footer was crammed).
          This is a Tabs layout, so EVERY route file in this folder was
          silently becoming a tab: billing, capacity, storage, language,
          receive-dropoff and release-pickup were all sitting in the bar.
          They are reachable from the dashboard and settings, so they are
          explicitly hidden with href: null rather than left to autoload.

          The five that earn a slot are the partner's daily loop: see the
          shelf, work the shelf, scan a handover, check the money, manage
          the store. */}
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarIcon: ({ focused }) => <TabIcon name="LayoutDashboard" focused={focused} /> }}
      />
      <Tabs.Screen
        name="inventory"
        options={{ title: 'Inventory', tabBarIcon: ({ focused }) => <TabIcon name="Package" focused={focused} /> }}
      />
      <Tabs.Screen
        name="scan"
        options={{ title: 'Scan', tabBarIcon: () => (
          <View style={{
            width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary,
            alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <Icon name="ScanLine" size={24} color={colors.textOnPrimary} strokeWidth={2} />
          </View>
        )}}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Earnings', tabBarIcon: ({ focused }) => <TabIcon name="TrendingUp" focused={focused} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Store', tabBarIcon: ({ focused }) => <TabIcon name="Settings" focused={focused} /> }}
      />

      {/* Reachable screens that must NOT occupy a tab slot. */}
      <Tabs.Screen name="messages"         options={{ href: null }} />
      {/* Nested routes register as their own tabs too, so the raw path
          "messages/[chatId]" was showing in the bar's overflow as if it
          were a destination (founder QA 2026-08-17). */}
      <Tabs.Screen name="messages/[chatId]" options={{ href: null }} />
      <Tabs.Screen name="billing"          options={{ href: null }} />
      <Tabs.Screen name="capacity"         options={{ href: null }} />
      <Tabs.Screen name="storage"          options={{ href: null }} />
      <Tabs.Screen name="language"         options={{ href: null }} />
      <Tabs.Screen name="receive-dropoff"  options={{ href: null }} />
      <Tabs.Screen name="release-pickup"   options={{ href: null }} />
    </Tabs>
  );
}
