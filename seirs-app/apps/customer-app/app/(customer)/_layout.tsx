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
      <Tabs.Screen name="request"          options={{ href: null }} />
      <Tabs.Screen name="vehicle-select"   options={{ href: null }} />
      <Tabs.Screen name="fare-breakdown"   options={{ href: null }} />
      <Tabs.Screen name="confirm-ride"     options={{ href: null }} />
      <Tabs.Screen name="trip-progress"    options={{ href: null }} />

      {/* Communication */}
      <Tabs.Screen name="messages/[chatId]" options={{ href: null }} />
      <Tabs.Screen name="call"              options={{ href: null }} />

      {/* Trip */}
      <Tabs.Screen name="trip/[id]"         options={{ href: null }} />

      {/* Wallet / Payments */}
      <Tabs.Screen name="add-payment"           options={{ href: null }} />
      <Tabs.Screen name="payment-methods"       options={{ href: null }} />
      <Tabs.Screen name="transaction/[id]"      options={{ href: null }} />
      <Tabs.Screen name="promo"                 options={{ href: null }} />
      <Tabs.Screen name="receipt/[id]"          options={{ href: null }} />
      <Tabs.Screen name="payment/[deliveryId]"  options={{ href: null }} />

      {/* Booking advanced */}
      <Tabs.Screen name="send"             options={{ href: null }} />
      <Tabs.Screen name="schedule"         options={{ href: null }} />
      <Tabs.Screen name="multi-stop"       options={{ href: null }} />
      <Tabs.Screen name="business"         options={{ href: null }} />

      {/* Trust & safety */}
      <Tabs.Screen name="rate/[driverId]"  options={{ href: null }} />
      <Tabs.Screen name="report"           options={{ href: null }} />
      <Tabs.Screen name="sos"              options={{ href: null }} />
      <Tabs.Screen name="share-trip"       options={{ href: null }} />

      {/* Growth */}
      <Tabs.Screen name="promotions"       options={{ href: null }} />
      <Tabs.Screen name="referral"         options={{ href: null }} />
      <Tabs.Screen name="rewards"          options={{ href: null }} />

      {/* Settings */}
      <Tabs.Screen name="notification-settings" options={{ href: null }} />
      <Tabs.Screen name="privacy"          options={{ href: null }} />
      <Tabs.Screen name="language"         options={{ href: null }} />
      <Tabs.Screen name="help"             options={{ href: null }} />

      {/* Track */}
      <Tabs.Screen name="track"            options={{ href: null }} />
    </Tabs>
  );
}
