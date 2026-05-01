import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';

function TabIcon({ name, focused }: { name: any; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Icon
        name={name}
        size={22}
        color={focused ? '#3A7BD5' : '#9CA3AF'}
        strokeWidth={focused ? 2 : 1.75}
      />
    </View>
  );
}

export default function PartnerLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#F3F4F6',
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor:   '#3A7BD5',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
      }}
    >
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
        options={{ title: 'Scan', tabBarIcon: ({ focused }) => (
          <View style={{
            width: 44, height: 44, borderRadius: 14, backgroundColor: '#0F2B4C',
            alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <Icon name="ScanLine" size={24} color="#fff" strokeWidth={2} />
          </View>
        )}}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Earnings', tabBarIcon: ({ focused }) => <TabIcon name="TrendingUp" focused={focused} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ focused }) => <TabIcon name="Settings" focused={focused} /> }}
      />
    </Tabs>
  );
}
