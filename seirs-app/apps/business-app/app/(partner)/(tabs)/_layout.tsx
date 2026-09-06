import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { useColors } from '@/context/ThemeContext';
import { tx } from '@/i18n/tx';

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
          // 8px floor, matching the business tab bar (B-5.1). On button-nav
          // Androids insets.bottom reports 0, so the raw value left this bar
          // flush against the phone navigation with no cushion at all.
          height: 56 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarActiveTintColor:   colors.accent,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
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
        options={{ title: tx('auto.layout.dashboard', 'Dashboard'), tabBarIcon: ({ focused }) => <TabIcon name="LayoutDashboard" focused={focused} /> }}
      />
      <Tabs.Screen
        name="inventory"
        options={{ title: tx('auto.layout.inventory', 'Inventory'), tabBarIcon: ({ focused }) => <TabIcon name="Package" focused={focused} /> }}
      />
      <Tabs.Screen
        name="scan"
        options={{ title: tx('auto.layout.scan', 'Scan'), tabBarIcon: () => (
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
        options={{ title: tx('auto.earnings.earnings', 'Earnings'), tabBarIcon: ({ focused }) => <TabIcon name="TrendingUp" focused={focused} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: tx('auto.layout.store', 'Store'), tabBarIcon: ({ focused }) => <TabIcon name="Settings" focused={focused} /> }}
      />

      {/*
          The hidden-screen list that used to sit here is GONE, and so is
          the reason for it.

          Every route file in a Tabs folder becomes a tab, so billing,
          capacity, storage, language, receive-dropoff, release-pickup,
          documents, statement and payout-account all had to be declared
          with href: null to keep them out of the bar. Two of them slipped
          through anyway and shipped as tabs six and seven.

          They now live one level up, as siblings of this group inside the
          partner Stack, which is where a pushed detail screen belongs. A
          screen that is not in this folder cannot become a tab by
          accident, and the Android back button pops to the screen before
          it rather than to the dashboard.
      */}
    </Tabs>
  );
}
