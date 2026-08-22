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
 * Driver notification settings, rewritten honest (founder 2026-08-22:
 * "they could just toggle the off button on important notification...
 * it should just be automatic").
 *
 * A driver who switches off job offers or payout notices has broken
 * their own livelihood with one tap, and the backend never honoured
 * those switches anyway (only marketing is gated on the send path).
 * Operational categories now show as always-on rows with no toggle;
 * the one real choice is real.
 */

const ALWAYS_ON = [
  { icon: 'briefcase-outline',  label: 'Job offers',          sub: 'New jobs near you, assignments and cancellations' },
  { icon: 'cash-outline',       label: 'Earnings & payouts',  sub: 'Money landing in your ledger and withdrawal status' },
  { icon: 'chatbubble-outline', label: 'Customer messages',   sub: 'Chat from the sender during a trip' },
  { icon: 'navigate-outline',   label: 'Trip updates',        sub: 'Changes to a delivery you are carrying' },
  { icon: 'refresh-outline',    label: 'Service notices',     sub: 'App updates and changes that affect how SEIRS works' },
] as const;

export default function DriverNotificationSettingsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  // The one genuine choice. Key 'marketing' is what the send path reads;
  // the old screen's 'promos' key was never consulted by the backend.
  const [promos, setPromos] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { prefs } = await usersApi.getNotificationPrefs();
        if (prefs && typeof prefs.marketing === 'boolean') setPromos(prefs.marketing);
      } catch {}
    })();
  }, []);

  const togglePromos = (next: boolean) => {
    setPromos(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      usersApi.updateNotificationPrefs({ marketing: next }).catch(() => {});
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
              <Text style={[styles.rowLabel, { color: theme.text }]}>Promos &amp; news</Text>
              <Text style={[styles.rowSub, { color: theme.textSecond }]}>
                Bonuses, campaigns and SEIRS announcements
              </Text>
            </View>
            <Switch
              value={promos}
              onValueChange={togglePromos}
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
          These keep your jobs and your money working, so they can&apos;t be
          switched off. You can still swipe any notification away or clear
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
