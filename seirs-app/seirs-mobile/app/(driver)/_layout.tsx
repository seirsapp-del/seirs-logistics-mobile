import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize } from '@/constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, focused }: { name: IoniconsName; color: string; focused: boolean }) {
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IoniconsName)}
      size={24}
      color={color}
    />
  );
}

export default function DriverLayout() {
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const insets      = useSafeAreaInsets();
  const isDark      = colorScheme === 'dark';

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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Jobs',
          tabBarIcon: (p) => <TabIcon name="briefcase" color={p.color} focused={p.focused} />,
        }}
      />
      <Tabs.Screen
        name="active"
        options={{
          title: 'Active',
          tabBarIcon: (p) => <TabIcon name="navigate" color={p.color} focused={p.focused} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          tabBarIcon: (p) => <TabIcon name="cash" color={p.color} focused={p.focused} />,
        }}
      />
      <Tabs.Screen
        name="kyc"
        options={{
          title: 'Verify',
          tabBarIcon: (p) => <TabIcon name="shield-checkmark" color={p.color} focused={p.focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: (p) => <TabIcon name="person" color={p.color} focused={p.focused} />,
        }}
      />
    </Tabs>
  );
}
