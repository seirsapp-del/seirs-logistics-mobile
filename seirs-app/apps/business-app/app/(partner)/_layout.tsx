import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { useColors } from '@/context/ThemeContext';

/** Hidden task screens: no tab button, and no tab bar over the content. */
const HIDDEN = { href: null, tabBarStyle: { display: 'none' } } as const;

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

      {/* Reachable screens that must NOT occupy a tab slot.

          href: null only removes the BUTTON. The bar itself still
          floated over these screens, and on Receive Drop-off it sat
          directly on top of the "Continue" button: tapping Continue hit
          the Scan tab, so a partner could weigh the parcel, photograph
          it, press Continue and never actually take it in (found on
          device 2026-08-18). These are focused tasks with their own
          close button, so the bar is hidden outright. */}
      <Tabs.Screen name="messages"         options={HIDDEN} />
      {/* Nested routes register as their own tabs too, so the raw path
          "messages/[chatId]" was showing in the bar's overflow as if it
          were a destination (founder QA 2026-08-17). */}
      <Tabs.Screen name="messages/[chatId]" options={HIDDEN} />
      <Tabs.Screen name="billing"          options={HIDDEN} />
      <Tabs.Screen name="capacity"         options={HIDDEN} />
      <Tabs.Screen name="storage"          options={HIDDEN} />
      <Tabs.Screen name="language"         options={HIDDEN} />
      <Tabs.Screen name="receive-dropoff"  options={HIDDEN} />
      <Tabs.Screen name="release-pickup"   options={HIDDEN} />
      {/* Added 2026-09-03 and immediately proved the comment above right.
          Both were created as route files without being registered here, so
          they became tabs six and seven: labels truncated to "docume..." and
          "stateme...", and no icon at all because a tab with no tabBarIcon
          renders the missing-glyph box. Documents is reached from Store
          Settings and the statement from Payout History. */}
      <Tabs.Screen name="documents"        options={HIDDEN} />
      <Tabs.Screen name="statement"        options={HIDDEN} />
    </Tabs>
  );
}
