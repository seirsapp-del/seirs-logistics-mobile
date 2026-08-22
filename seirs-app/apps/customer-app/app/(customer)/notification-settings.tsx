import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { usersApi } from '@/services/api';

/**
 * Notification settings, rewritten honest (founder 2026-08-22: "some of
 * the notifications shouldn't be optional and shouldn't be shown").
 *
 * The old screen showed 12 switches; the backend has only ever gated
 * ONE of them (marketing, since 2026-08-16). Delivery status, payments,
 * safety and app notices always send because the service does not work
 * without them. Showing a switch that does nothing is worse than
 * showing no switch, so the operational categories are listed as
 * always-on rows with no toggle, and the single real choice is real.
 */

const ALWAYS_ON = [
  { icon: 'cube-outline',           label: 'Delivery updates',  sub: 'Driver assigned, picked up, delivered, cancelled' },
  { icon: 'card-outline',           label: 'Payments',          sub: 'Charges, refunds and receipts on your account' },
  { icon: 'shield-outline',         label: 'Safety alerts',     sub: 'Anything that affects your safety or your package' },
  { icon: 'refresh-outline',        label: 'Service notices',   sub: 'App updates and changes that affect how SEIRS works' },
] as const;

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  // The one genuine choice. Key 'marketing' is the key the send path
  // actually reads (NotificationsService.PREF_KEY_BY_TYPE).
  const [offers, setOffers] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { prefs } = await usersApi.getNotificationPrefs();
        if (prefs && typeof prefs.marketing === 'boolean') setOffers(prefs.marketing);
      } catch {}
    })();
  }, []);

  const toggleOffers = (next: boolean) => {
    setOffers(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      usersApi.saveNotificationPrefs({ marketing: next }).catch(() => {});
    }, 400);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>YOUR CHOICE</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: theme.surfaceSecond }]}>
              <Ionicons name="megaphone-outline" size={18} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>Offers &amp; promotions</Text>
              <Text style={[styles.rowSub, { color: theme.textSecond }]}>
                Discounts, referral offers and SEIRS news
              </Text>
            </View>
            <Switch
              value={offers}
              onValueChange={toggleOffers}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>ALWAYS ON</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {ALWAYS_ON.map((item, i) => (
            <View
              key={item.label}
              style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}
            >
              <View style={[styles.iconWrap, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name={item.icon as any} size={18} color={theme.textSecond} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>{item.label}</Text>
                <Text style={[styles.rowSub, { color: theme.textSecond }]}>{item.sub}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
            </View>
          ))}
        </View>
        <Text style={[styles.footnote, { color: theme.textThird }]}>
          These keep your deliveries and your money working, so they can&apos;t
          be switched off. You can still swipe any notification away or clear
          them all from the notification centre.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content:      { padding: Spacing.md, paddingBottom: Spacing.xl },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: 0.6, marginTop: Spacing.md, marginBottom: Spacing.sm },
  card:         { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  iconWrap:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  rowLabel:     { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  rowSub:       { fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },
  footnote:     { fontSize: FontSize.xs, lineHeight: 17, marginTop: Spacing.sm, paddingHorizontal: Spacing.xs },
});
