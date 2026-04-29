import {
  View, Text, Pressable, StyleSheet, ScrollView, Switch, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

type ToggleKey =
  | 'newJobs' | 'jobAssigned' | 'jobCancelled'
  | 'earningsCredited' | 'withdrawalStatus' | 'weeklyEarnings'
  | 'customerMessages' | 'tripUpdates'
  | 'promos' | 'appUpdates';

const SECTIONS: { title: string; items: { key: ToggleKey; label: string; sub: string; icon: string }[] }[] = [
  {
    title: 'Job Alerts',
    items: [
      { key: 'newJobs',      label: 'New Job Requests',  sub: 'Get notified when new jobs are available near you', icon: 'briefcase-outline' },
      { key: 'jobAssigned',  label: 'Job Assigned',      sub: 'Confirm when a job has been assigned to you',        icon: 'checkmark-circle-outline' },
      { key: 'jobCancelled', label: 'Job Cancelled',     sub: 'Alert when a customer cancels an order',             icon: 'close-circle-outline' },
    ],
  },
  {
    title: 'Earnings & Payments',
    items: [
      { key: 'earningsCredited', label: 'Earnings Credited',    sub: 'Notification when trip payout is added to your wallet', icon: 'cash-outline' },
      { key: 'withdrawalStatus', label: 'Withdrawal Updates',   sub: 'Track the status of your bank withdrawals',              icon: 'arrow-up-circle-outline' },
      { key: 'weeklyEarnings',   label: 'Weekly Summary',       sub: 'Receive a weekly earnings summary every Monday',         icon: 'bar-chart-outline' },
    ],
  },
  {
    title: 'Trips & Messages',
    items: [
      { key: 'customerMessages', label: 'Customer Messages',  sub: 'In-app chats from customers during active trips', icon: 'chatbubbles-outline' },
      { key: 'tripUpdates',      label: 'Trip Status Updates', sub: 'Route changes, delays, or customer arrivals',    icon: 'navigate-outline' },
    ],
  },
  {
    title: 'General',
    items: [
      { key: 'promos',      label: 'Promotions & Bonuses', sub: 'Weekend bonuses and surge pricing alerts',      icon: 'star-outline' },
      { key: 'appUpdates',  label: 'App Updates',          sub: 'New features and important platform changes',   icon: 'download-outline' },
    ],
  },
];

export default function DriverNotificationSettingsScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    newJobs: true, jobAssigned: true, jobCancelled: true,
    earningsCredited: true, withdrawalStatus: true, weeklyEarnings: false,
    customerMessages: true, tripUpdates: true,
    promos: false, appUpdates: true,
  });

  const allOn  = Object.values(toggles).every(Boolean);
  const allOff = Object.values(toggles).every(v => !v);

  const setAll = (val: boolean) =>
    setToggles(Object.fromEntries(Object.keys(toggles).map(k => [k, val])) as Record<ToggleKey, boolean>);

  const toggle = (key: ToggleKey) =>
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
        <Pressable onPress={() => setAll(!allOn)}>
          <Text style={[styles.allBtn, { color: theme.primary }]}>{allOn ? 'Turn off all' : 'Turn on all'}</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Push permission banner */}
        <View style={[styles.pushBanner, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '30' }]}>
          <Ionicons name="notifications-outline" size={18} color={theme.primary} />
          <Text style={[styles.pushText, { color: theme.textSecond }]}>Push notifications are <Text style={{ color: theme.primary, fontWeight: FontWeight.semibold }}>enabled</Text> on this device.</Text>
        </View>

        {SECTIONS.map(section => (
          <View key={section.title} style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
            {section.items.map((item, i) => (
              <View
                key={item.key}
                style={[
                  styles.row,
                  i < section.items.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 0.5 },
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: theme.surfaceSecond }]}>
                  <Ionicons name={item.icon as any} size={18} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: theme.text }]}>{item.label}</Text>
                  <Text style={[styles.rowSub, { color: theme.textSecond }]}>{item.sub}</Text>
                </View>
                <Switch
                  value={toggles[item.key]}
                  onValueChange={() => toggle(item.key)}
                  trackColor={{ false: theme.border, true: theme.primary + '80' }}
                  thumbColor={toggles[item.key] ? theme.primary : theme.textThird}
                />
              </View>
            ))}
          </View>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  allBtn:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  pushBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  pushText:   { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },

  section:      { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, padding: Spacing.md, paddingBottom: Spacing.sm },
  row:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  rowIcon:      { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  rowLabel:     { fontSize: FontSize.base, fontWeight: FontWeight.medium, marginBottom: 2 },
  rowSub:       { fontSize: FontSize.xs, lineHeight: 18 },
});
