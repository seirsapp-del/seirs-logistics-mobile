import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize, Radius } from '@/constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  name,
  color,
  focused,
}: {
  name: IoniconsName;
  color: string;
  focused: boolean;
}) {
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IoniconsName)}
      size={24}
      color={color}
    />
  );
}

export default function CustomerLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: {
          backgroundColor: theme.navBackground,
          borderTopColor: theme.border,
          borderTopWidth: isDark ? 0 : 1,
          height: 64 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: (p) => <TabIcon name="home" color={p.color} focused={p.focused} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Bookings',
          tabBarIcon: (p) => <TabIcon name="receipt" color={p.color} focused={p.focused} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: (p) => <TabIcon name="wallet" color={p.color} focused={p.focused} />,
        }}
      />
      <Tabs.Screen
        name="track"
        options={{
          title: 'Track',
          tabBarIcon: (p) => <TabIcon name="location" color={p.color} focused={p.focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: (p) => <TabIcon name="person" color={p.color} focused={p.focused} />,
        }}
      />

      {/* Hidden from tab bar */}
      <Tabs.Screen name="send"     options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
      <Tabs.Screen name="business" options={{ href: null }} />
      <Tabs.Screen name="payment/[deliveryId]" options={{ href: null }} />
    </Tabs>
  );
}
