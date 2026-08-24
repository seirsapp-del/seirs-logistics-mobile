import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/context/ThemeContext';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface StoreSettings {
  storeName:       string;
  storeAddress:    string;
  phone:           string;
  maxCapacity:     number;
  operatingDays:   string[];
  openTime:        string;
  closeTime:       string;
  notifyNewPackage: boolean;
  notifyPickup:    boolean;
  notifyPayout:    boolean;
}

export default function PartnerSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, logout } = useAuth();

  const [settings, setSettings] = useState<StoreSettings>({
    storeName:        user?.storeName ?? '',
    storeAddress:     '',
    phone:            '',
    maxCapacity:      50,
    operatingDays:    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    openTime:         '08:00',
    closeTime:        '18:00',
    notifyNewPackage: true,
    notifyPickup:     true,
    notifyPayout:     true,
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    partnerApi.getSettings?.()
      .then((d: any) => {
        if (d) setSettings((prev) => ({ ...prev, ...d }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof StoreSettings>(key: K, val: StoreSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: val }));

  const toggleDay = (day: string) => {
    setSettings((s) => ({
      ...s,
      operatingDays: s.operatingDays.includes(day)
        ? s.operatingDays.filter((d) => d !== day)
        : [...s.operatingDays, day],
    }));
  };

  const handleSave = async () => {
    if (!settings.storeName.trim()) {
      Alert.alert('Validation', 'Store name is required.');
      return;
    }
    setSaving(true);
    try {
      await partnerApi.updateSettings(settings);
      Alert.alert('Saved', 'Your store settings have been updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save settings.');
    } finally { setSaving(false); }
  };

  if (loading) {
    return <View style={[styles.centered, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Store Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecond }]}>Store Information</Text>

          <Text style={[styles.label, { color: colors.textSecond }]}>Store Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={settings.storeName}
            onChangeText={(v) => set('storeName', v)}
            placeholder="My Partner Store"
            placeholderTextColor={colors.textThird}
          />

          <Text style={[styles.label, { color: colors.textSecond }]}>Store Address</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={settings.storeAddress}
            onChangeText={(v) => set('storeAddress', v)}
            placeholder="123 Lagos Street, Ikeja"
            placeholderTextColor={colors.textThird}
            multiline
            numberOfLines={2}
          />

          <Text style={[styles.label, { color: colors.textSecond }]}>Phone Number</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={settings.phone}
            onChangeText={(v) => set('phone', v)}
            placeholder="08012345678"
            placeholderTextColor={colors.textThird}
            keyboardType="phone-pad"
          />

          <Text style={[styles.label, { color: colors.textSecond }]}>Max Capacity (packages)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={String(settings.maxCapacity)}
            onChangeText={(v) => set('maxCapacity', parseInt(v, 10) || 0)}
            keyboardType="number-pad"
            placeholder="50"
            placeholderTextColor={colors.textThird}
          />
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecond }]}>Operating Hours</Text>

          <Text style={[styles.label, { color: colors.textSecond }]}>Operating Days</Text>
          <View style={styles.daysRow}>
            {DAYS.map((day) => {
              const active = settings.operatingDays.includes(day);
              return (
                <Pressable
                  key={day}
                  style={[
                    styles.dayBtn,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    active && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => toggleDay(day)}
                >
                  <Text style={[styles.dayBtnText, { color: colors.textSecond }, active && { color: '#fff' }]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textSecond }]}>Opens At</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={settings.openTime}
                onChangeText={(v) => set('openTime', v)}
                placeholder="08:00"
                placeholderTextColor={colors.textThird}
                // 08:00 is digits and a colon: the alpha keyboard was wrong
                // for both opening-hours fields (B-5.2).
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textSecond }]}>Closes At</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={settings.closeTime}
                onChangeText={(v) => set('closeTime', v)}
                placeholder="18:00"
                placeholderTextColor={colors.textThird}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
        </View>

        {/* B-10.7: three per-event switches used to live here while the
            Profile tab had deliberately REMOVED its Notifications row on
            the grounds that everything always sends, and notifications.tsx
            records that push has not shipped. A partner could switch off
            "Payout Processed" and nothing changed. One position, stated
            once: put the switches back when there is something behind
            them. The notify* fields stay on StoreSettings so the saved
            record round-trips unchanged. */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecond }]}>Notifications</Text>
          <View style={[styles.notifRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.notifLabel, { color: colors.text }]}>Every store alert is on</Text>
              <Text style={[styles.notifSub, { color: colors.textThird }]}>
                Package arrivals, pickups and payouts all reach you. There is nothing to switch off yet.
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecond }]}>Account</Text>
          <View style={styles.accountRow}>
            <Icon name="User" size={16} color={colors.textSecond} />
            <View style={{ flex: 1 }}>
              {/* First name only for privacy. Full legal name lives in Edit Profile. */}
              <Text style={[styles.accountLabel, { color: colors.text }]}>
                {(user as any)?.firstName
                  ?? (user?.name ? String(user.name).trim().split(/\s+/)[0] : '')}
              </Text>
              <Text style={[styles.accountEmail, { color: colors.textSecond }]}>{user?.email}</Text>
              {(user as any)?.accountId && (
                <Text style={{ fontSize: 12, color: colors.textThird, marginTop: 2, letterSpacing: 0.5 }}>
                  SEIRS ID: {(user as any).accountId}
                </Text>
              )}
            </View>
          </View>
          {/* Messages and Language had NO entry point anywhere once they
              left the tab bar (founder 2026-08-16: "are you hiding the
              rest or organising it"). Hiding a screen without giving it a
              home is just orphaning it, so they live here, where a
              partner looks for account and preference settings. */}
          <Pressable
            style={[styles.linkRow, { borderTopColor: colors.border }]}
            onPress={() => router.push('/(partner)/messages' as any)}
          >
            <Icon name="MessageSquare" size={16} color={colors.textSecond} />
            <Text style={[styles.linkRowText, { color: colors.text }]}>Messages &amp; support</Text>
            <Icon name="ChevronRight" size={16} color={colors.textThird} />
          </Pressable>
          <Pressable
            style={[styles.linkRow, { borderTopColor: colors.border }]}
            onPress={() => router.push('/(partner)/language' as any)}
          >
            <Icon name="Globe" size={16} color={colors.textSecond} />
            <Text style={[styles.linkRowText, { color: colors.text }]}>Language</Text>
            <Icon name="ChevronRight" size={16} color={colors.textThird} />
          </Pressable>

          <Pressable style={[styles.logoutBtn, { borderTopColor: colors.border }]} onPress={logout}>
            <Icon name="LogOut" size={16} color="#DC2626" />
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </Pressable>

        <ClosingSection storeId={user?.partnerStoreId ?? ''} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:        { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  heading:       { fontSize: 20, fontWeight: '800' },

  section:       { borderRadius: 14, padding: 16, borderWidth: 1, marginBottom: 12 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },

  label:         { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input:         {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, fontSize: 15, marginBottom: 14,
  },
  multiline:     { height: 68, textAlignVertical: 'top', paddingTop: 12 },

  daysRow:       { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  dayBtn:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  dayBtnText:    { fontSize: 13, fontWeight: '600' },

  timeRow:       { flexDirection: 'row', gap: 12 },

  notifRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1 },
  notifLabel:    { fontSize: 15, fontWeight: '600' },
  notifSub:      { fontSize: 13, marginTop: 2 },

  accountRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  accountLabel:  { fontSize: 15, fontWeight: '700' },
  accountEmail:  { fontSize: 13, marginTop: 1 },

  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 1,
  },
  linkRowText: { flex: 1, fontSize: 15, fontWeight: '600' },
  logoutBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderTopWidth: 1 },
  logoutText:    { fontSize: 15, fontWeight: '600', color: '#DC2626' },

  saveBtn:       { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText:   { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Closing section. red semantic colors retained for destructive action
  closingSection: { backgroundColor: '#FFFBFB', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#FCA5A5', marginTop: 24 },
  closingTitle:   { fontSize: 15, fontWeight: '800', color: '#991B1B', marginBottom: 4 },
  closingSub:     { fontSize: 13, color: '#7F1D1D', lineHeight: 17, marginBottom: 12 },
  blockerCard:    { flexDirection: 'row', gap: 10, padding: 10, borderRadius: 10, backgroundColor: '#FEF3C7', marginBottom: 8, alignItems: 'flex-start' },
  blockerCount:   { fontSize: 12, fontWeight: '800', color: '#92400E', backgroundColor: '#FCD34D', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  blockerText:    { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 17 },
  closeBtn:       { backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  closeBtnDisabled: { backgroundColor: '#F3F4F6' },
  closeBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeBtnTextDisabled: { color: '#9CA3AF' },
  readyTip:       { fontSize: 13, color: '#16A34A', marginBottom: 8, fontWeight: '600' },
});

// ── Closing flow ──────────────────────────────────────────────────────────
function ClosingSection({ storeId }: { storeId: string }) {
  const [readiness, setReadiness] = useState<{
    ready: boolean;
    blockers: Array<{ type: string; count: number; action: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    partnerApi.storeDeletionReadiness(storeId)
      .then(r => setReadiness({ ready: r.ready, blockers: r.blockers ?? [] }))
      .catch(() => setReadiness({ ready: false, blockers: [] }))
      .finally(() => setLoading(false));
  }, [storeId]);

  const handleClose = () => {
    if (!readiness?.ready) return;
    Alert.alert(
      'Close partner store?',
      'This pauses incoming bookings, removes you from the customer map, and starts the offboarding workflow. Final wallet payout follows the next regular cycle.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Close store',
          style:   'destructive',
          onPress: async () => {
            try {
              await partnerApi.storeSetStatus(storeId, 'paused');
              Alert.alert('Store paused', 'Bookings are off. Contact ops to complete offboarding when ready.');
            } catch (e: any) {
              Alert.alert('Could not close', e?.message ?? 'Try again.');
            }
          },
        },
      ],
    );
  };

  if (!storeId) return null;

  return (
    <View style={styles.closingSection}>
      <Text style={styles.closingTitle}>Close This Store</Text>
      <Text style={styles.closingSub}>
        Permanently shut down this partner store. You cannot close while packages are still in your custody.
      </Text>

      {loading && <ActivityIndicator color="#DC2626" />}

      {readiness && readiness.ready && (
        <Text style={styles.readyTip}>✓ Store is empty. safe to close</Text>
      )}

      {readiness && !readiness.ready && readiness.blockers.length > 0 && (
        <>
          {readiness.blockers.map((b, i) => (
            <View key={i} style={styles.blockerCard}>
              <Text style={styles.blockerCount}>{b.count}</Text>
              <Text style={styles.blockerText}>{b.action}</Text>
            </View>
          ))}
        </>
      )}

      <Pressable
        style={[styles.closeBtn, !readiness?.ready && styles.closeBtnDisabled]}
        disabled={!readiness?.ready}
        onPress={handleClose}
      >
        <Text style={[styles.closeBtnText, !readiness?.ready && styles.closeBtnTextDisabled]}>
          {readiness?.ready ? 'Close store' : 'Resolve blockers first'}
        </Text>
      </Pressable>
    </View>
  );
}
