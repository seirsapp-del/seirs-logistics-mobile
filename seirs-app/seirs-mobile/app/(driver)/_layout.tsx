import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize } from '@/constants/theme';

function TabIcon({ icon }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 22 }}>{icon}</Text>;
}

export default function DriverLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: {
          backgroundColor: theme.navBackground,
          borderTopColor: theme.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: FontSize.xs },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Jobs', tabBarIcon: (p) => <TabIcon icon="📋" {...p} /> }}
      />
      <Tabs.Screen
        name="active"
        options={{ title: 'Active', tabBarIcon: (p) => <TabIcon icon="🚀" {...p} /> }}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Earnings', tabBarIcon: (p) => <TabIcon icon="💰" {...p} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: (p) => <TabIcon icon="👤" {...p} /> }}
      />
    </Tabs>
  );
}
