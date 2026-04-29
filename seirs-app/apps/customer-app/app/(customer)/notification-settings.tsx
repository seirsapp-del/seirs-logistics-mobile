import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

type ToggleKey =
  | 'trip_updates' | 'driver_assigned' | 'trip_completed' | 'trip_cancelled'
  | 'payment_success' | 'payment_failed' | 'wallet_topup'
  | 'promo_alerts' | 'referral_bonus' | 'rewards_update'
  | 'app_updates' | 'safety_alerts' | 'marketing';

const SECTIONS: { title: string; items: { key: ToggleKey; icon: string; label: string; sub: string }[] }[] = [
  {
    title: 'Trip Notifications',
    items: [
      { key: 'trip_updates',    icon: 'car-outline',            label: 'Trip Updates',          sub: 'Live status changes during your trip' },
      { key: 'driver_assigned', icon: 'navigate-outline',       label: 'Driver Assigned',       sub: 'When a driver accepts your request' },
      { key: 'trip_completed',  icon: 'checkmark-circle-outline', label: 'Trip Completed',     sub: 'Confirmation when you arrive' },
      { key: 'trip_cancelled',  icon: 'close-circle-outline',   label: 'Trip Cancelled',        sub: 'If your trip is cancelled' },
    ],
  },
  {
    title: 'Payment Notifications',
    items: [
      { key: 'payment_success', icon: 'card-outline',          label: 'Payment Successful',     sub: 'Every time a payment goes through' },
      { key: 'payment_failed',  icon: 'alert-circle-outline',  label: 'Payment Failed',         sub: 'Failed or declined transactions' },
      { key: 'wallet_topup',    icon: 'wallet-outline',        label: 'Wallet Top-up',          sub: 'When your wallet balance is funded' },
    ],
  },
  {
    title: 'Rewards & Promos',
    items: [
      { key: 'promo_alerts',    icon: 'ticket-outline',        label: 'Promo Alerts',           sub: 'New discount codes & offers' },
      { key: 'referral_bonus',  icon: 'gift-outline',          label: 'Referral Bonus',         sub: 'When someone uses your code' },
      { key: 'rewards_update',  icon: 'star-outline',          label: 'Rewards Update',         sub: 'Points earned and tier changes' },
    ],
  },
  {
    title: 'General',
    items: [
      { key: 'app_updates',     icon: 'refresh-outline',       label: 'App Updates',            sub: 'New features and improvements' },
      { key: 'safety_alerts',   icon: 'shield-outline',        label: 'Safety Alerts',          sub: 'Account security and SOS events' },
      { key: 'marketing',       icon: 'megaphone-outline',     label: 'Marketing Messages',     sub: 'News, surveys and product updates' },
    ],
  },
];

const DEFAULTS: Record<ToggleKey, boolean> = {
  trip_updates: true, driver_assigned: true, trip_completed: true, trip_cancelled: true,
  payment_success: true, payment_failed: true, wallet_topup: true,
  promo_alerts: true, referral_bonus: true, rewards_update: false,
  app_updates: false, safety_alerts: true, marketing: false,
};

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [settings, setSettings] = useState<Record<ToggleKey, boolean>>(DEFAULTS);

  const toggle = (key: ToggleKey) =>
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));

  const allOn  = Object.values(settings).every(Boolean);
  const toggleAll = () => {
    const next = !allOn;
    setSettings(Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, next])) as Record<ToggleKey, boolean>);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
        <Pressable onPress={toggleAll}>
          <Text style={[styles.toggleAll, { color: theme.primary }]}>{allOn ? 'Turn off all' : 'Turn on all'}</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Push notification banner */}
        <View style={[styles.pushBanner, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '30' }]}>
          <Ionicons name="notifications" size={20} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.pushTitle, { color: theme.text }]}>Push Notifications Enabled</Text>
            <Text style={[styles.pushDesc, { color: theme.textSecond }]}>
              Change this in your device settings if needed.
            </Text>
          </View>
          <View style={[styles.enabledDot, { backgroundColor: '#22C55E' }]} />
        </View>

        {SECTIONS.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>{section.title}</Text>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              {section.items.map((item, i, arr) => (
                <View
                  key={item.key}
                  style={[styles.row, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: settings[item.key] ? theme.primary + '15' : theme.surfaceSecond }]}>
                    <Ionicons name={item.icon as any} size={18} color={settings[item.key] ? theme.primary : theme.textThird} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: theme.text }]}>{item.label}</Text>
                    <Text style={[styles.rowSub, { color: theme.textSecond }]}>{item.sub}</Text>
                  </View>
                  <Switch
                    value={settings[item.key]}
                    onValueChange={() => toggle(item.key)}
                    trackColor={{ false: theme.border, true: theme.primary + '80' }}
                    thumbColor={settings[item.key] ? theme.primary : (isDark ? '#555' : '#ddd')}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:     { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  toggleAll: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  pushBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  pushTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  pushDesc:   { fontSize: FontSize.xs, marginTop: 2 },
  enabledDot: { width: 9, height: 9, borderRadius: 5 },

  section:      { gap: Spacing.xs },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: Spacing.xs },
  card:         { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
  rowIcon:      { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  rowLabel:     { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  rowSub:       { fontSize: FontSize.xs, marginTop: 2 },
});
