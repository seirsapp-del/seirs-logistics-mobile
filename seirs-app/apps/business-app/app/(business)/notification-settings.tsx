/**
 * Notification preferences for a business account.
 *
 * The Profile row under PREFERENCES used to open the notification INBOX,
 * which is the same thing the header bell opens, so there was no way to
 * control which alerts you receive at all (founder 2026-08-16). The
 * inbox keeps its own route; this is the settings screen the section
 * promised.
 *
 * Toggles are written straight through to users.notificationPrefs and
 * applied optimistically: a sender flipping five switches should not wait
 * on five round trips, and a failed write simply leaves the server on its
 * previous value rather than blocking the UI.
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Icon } from '@/components/Icon';
import { usersApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';

type ToggleKey =
  | 'delivery_updates' | 'driver_assigned' | 'delivery_completed' | 'delivery_cancelled'
  | 'payment_success'  | 'payment_failed'
  | 'counter_dropoff'  | 'counter_payout'
  | 'rewards_update'   | 'promo_alerts'
  | 'app_updates'      | 'marketing';

const SECTIONS: { title: string; items: { key: ToggleKey; icon: string; label: string; sub: string }[] }[] = [
  {
    title: 'DELIVERIES',
    items: [
      { key: 'delivery_updates',   icon: 'Package',      label: 'Delivery updates',   sub: 'Every status change on a run you booked' },
      { key: 'driver_assigned',    icon: 'Bike',         label: 'Driver assigned',    sub: 'When a rider accepts and is on the way' },
      { key: 'delivery_completed', icon: 'CheckCircle2', label: 'Delivered',          sub: 'When a package reaches its receiver' },
      { key: 'delivery_cancelled', icon: 'AlertCircle',  label: 'Cancelled or failed', sub: 'Including auto-cancelled bookings and refunds' },
    ],
  },
  {
    title: 'PAYMENTS',
    items: [
      { key: 'payment_success', icon: 'CreditCard', label: 'Payment received', sub: 'Confirmation each time a booking is paid' },
      { key: 'payment_failed',  icon: 'XCircle',    label: 'Payment problems', sub: 'Declined cards and failed charges' },
    ],
  },
  {
    title: 'PARTNER COUNTER',
    items: [
      { key: 'counter_dropoff', icon: 'Store',    label: 'Counter handovers', sub: 'Parcels dropped at or collected from your counter' },
      { key: 'counter_payout',  icon: 'Banknote', label: 'Earnings and payouts', sub: 'When counter earnings are settled to your bank' },
    ],
  },
  {
    title: 'REWARDS',
    items: [
      { key: 'rewards_update', icon: 'Star', label: 'Points earned', sub: 'Points added after a paid delivery' },
      { key: 'promo_alerts',   icon: 'Gift', label: 'Offers',        sub: 'Discounts and seasonal campaigns' },
    ],
  },
  {
    title: 'GENERAL',
    items: [
      { key: 'app_updates', icon: 'RefreshCw', label: 'App updates', sub: 'New features and important changes' },
      { key: 'marketing',   icon: 'Megaphone', label: 'Marketing',   sub: 'News from SEIRS. Safety and account alerts always send.' },
    ],
  },
];

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const [prefs, setPrefs]   = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersApi.getNotificationPrefs()
      .then(({ prefs: p }) => setPrefs(p ?? {}))
      .catch(() => setPrefs({}))
      .finally(() => setLoading(false));
  }, []);

  // Anything the account has never touched is ON: a business would rather
  // be told too much than miss a failed payment.
  const isOn = (key: ToggleKey) => prefs[key] !== false;

  const toggle = (key: ToggleKey) => {
    const next = { ...prefs, [key]: !isOn(key) };
    setPrefs(next);
    usersApi.updateNotificationPrefs({ [key]: next[key] }).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notification Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
          <Text style={[styles.intro, { color: colors.textSecond }]}>
            Choose what SEIRS sends you. Safety and account-security alerts are always sent.
          </Text>

          {SECTIONS.map((section) => (
            <View key={section.title} style={{ marginTop: 18 }}>
              <Text style={[styles.sectionTitle, { color: colors.textThird }]}>{section.title}</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {section.items.map((item, idx) => (
                  <View
                    key={item.key}
                    style={[styles.row, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecond }]}>
                      <Icon name={item.icon as any} size={17} color={colors.textSecond} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, { color: colors.text }]}>{item.label}</Text>
                      <Text style={[styles.sub, { color: colors.textThird }]}>{item.sub}</Text>
                    </View>
                    <Switch
                      value={isOn(item.key)}
                      onValueChange={() => toggle(item.key)}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1,
  },
  back:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  intro:       { fontSize: 13, lineHeight: 19 },
  sectionTitle:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, marginLeft: 4 },
  card:        { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  iconWrap:    { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label:       { fontSize: 14, fontWeight: '600' },
  sub:         { fontSize: 12, marginTop: 2, lineHeight: 16 },
});
