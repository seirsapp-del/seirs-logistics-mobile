import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize, Radius } from '@/constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, focused }: { name: IoniconsName; color: string; focused: boolean }) {
  return <Ionicons name={focused ? name : (`${name}-outline` as IoniconsName)} size={24} color={color} />;
}

export default function CustomerLayout() {
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
        tabBarLabelStyle: {
          fontSize:   FontSize.xs,
          fontWeight: '600',
          marginTop:  2,
        },
      }}
    >
      {/* ── Tab Bar Screens ─────────────────────────────────────────────── */}
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: (p) => <TabIcon name="home" color={p.color} focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'Bookings', tabBarIcon: (p) => <TabIcon name="receipt" color={p.color} focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="wallet"
        options={{ title: 'Wallet', tabBarIcon: (p) => <TabIcon name="wallet" color={p.color} focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="messages/index"
        options={{ title: 'Messages', tabBarIcon: (p) => <TabIcon name="chatbubbles" color={p.color} focused={p.focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: (p) => <TabIcon name="person" color={p.color} focused={p.focused} /> }}
      />

      {/* ── Hidden from tab bar ──────────────────────────────────────────── */}
      {/* Booking flow */}
      <Tabs.Screen name="request"          options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="vehicle-select"   options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="fare-breakdown"   options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="confirm-ride"     options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="trip-progress"    options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />

      {/* Communication */}
      <Tabs.Screen name="messages/[chatId]" options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />

      {/* Trip */}
      <Tabs.Screen name="trip/[id]"         options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />

      {/* Wallet / Payments */}
      <Tabs.Screen name="add-payment"           options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="payment-methods"       options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="transaction/[id]"      options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="promo"                 options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="receipt/[id]"          options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="payment/[deliveryId]"  options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />

      {/* Booking advanced */}
      <Tabs.Screen name="send"             options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="schedule"         options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="multi-stop"       options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="business"         options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />

      {/* Trust & safety */}
      <Tabs.Screen name="rate/[driverId]"  options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="report"           options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="sos"              options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="share-trip"       options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />

      {/* Growth */}
      <Tabs.Screen name="promotions"       options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="referral"         options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="rewards"          options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />

      {/* Settings */}
      <Tabs.Screen name="notification-settings" options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="privacy"          options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="language"         options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="help"             options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />

      {/* Track */}
      <Tabs.Screen name="track"            options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />

      {/* Other routes that exist as files but should not appear in tab bar */}
      <Tabs.Screen name="addresses"        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="change-password"  options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="delete-account"   options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="drop-at-store"    options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="edit-profile"     options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="pool-preferences" options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
      <Tabs.Screen name="recipient-id"     options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
    </Tabs>
  );
}
