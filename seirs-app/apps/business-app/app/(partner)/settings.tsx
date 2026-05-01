import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, Switch,
  ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

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
  const insets = useSafeAreaInsets();
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
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#3A7BD5" /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.heading}>Store Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

        {/* Store info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Store Information</Text>

          <Text style={styles.label}>Store Name</Text>
          <TextInput
            style={styles.input}
            value={settings.storeName}
            onChangeText={(v) => set('storeName', v)}
            placeholder="My Partner Store"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Store Address</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={settings.storeAddress}
            onChangeText={(v) => set('storeAddress', v)}
            placeholder="123 Lagos Street, Ikeja"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={2}
          />

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={settings.phone}
            onChangeText={(v) => set('phone', v)}
            placeholder="08012345678"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Max Capacity (packages)</Text>
          <TextInput
            style={styles.input}
            value={String(settings.maxCapacity)}
            onChangeText={(v) => set('maxCapacity', parseInt(v, 10) || 0)}
            keyboardType="number-pad"
            placeholder="50"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Operating hours */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Operating Hours</Text>

          <Text style={styles.label}>Operating Days</Text>
          <View style={styles.daysRow}>
            {DAYS.map((day) => {
              const active = settings.operatingDays.includes(day);
              return (
                <Pressable
                  key={day}
                  style={[styles.dayBtn, active && styles.dayBtnActive]}
                  onPress={() => toggleDay(day)}
                >
                  <Text style={[styles.dayBtnText, active && styles.dayBtnTextActive]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Opens At</Text>
              <TextInput
                style={styles.input}
                value={settings.openTime}
                onChangeText={(v) => set('openTime', v)}
                placeholder="08:00"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Closes At</Text>
              <TextInput
                style={styles.input}
                value={settings.closeTime}
                onChangeText={(v) => set('closeTime', v)}
                placeholder="18:00"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          {([
            { key: 'notifyNewPackage', label: 'New Package Arrival',    sub: 'When a package arrives at your store' },
            { key: 'notifyPickup',     label: 'Package Pickup',         sub: 'When a customer collects a package' },
            { key: 'notifyPayout',     label: 'Payout Processed',       sub: 'When weekly earnings are transferred' },
          ] as const).map(({ key, label, sub }) => (
            <View key={key} style={styles.notifRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.notifLabel}>{label}</Text>
                <Text style={styles.notifSub}>{sub}</Text>
              </View>
              <Switch
                value={settings[key]}
                onValueChange={(v) => set(key, v)}
                trackColor={{ false: '#E5E7EB', true: '#3A7BD5' }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>

        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.accountRow}>
            <Icon name="User" size={16} color="#6B7280" />
            <View style={{ flex: 1 }}>
              <Text style={styles.accountLabel}>{user?.name}</Text>
              <Text style={styles.accountEmail}>{user?.email}</Text>
            </View>
          </View>
          <Pressable style={styles.logoutBtn} onPress={logout}>
            <Icon name="LogOut" size={16} color="#DC2626" />
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </View>

        {/* Save button */}
        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Save Changes</Text>
          }
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:        {
    paddingHorizontal: 20, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  heading:       { fontSize: 20, fontWeight: '800', color: '#0F2B4C' },

  section:       {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#F3F4F6', marginBottom: 12,
  },
  sectionTitle:  { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },

  label:         { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input:         {
    backgroundColor: '#F5F5F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#E5E7EB', fontSize: 15, color: '#0F2B4C', marginBottom: 14,
  },
  multiline:     { height: 68, textAlignVertical: 'top', paddingTop: 12 },

  daysRow:       { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  dayBtn:        {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#F5F5F0', borderWidth: 1, borderColor: '#E5E7EB',
  },
  dayBtnActive:  { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  dayBtnText:    { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  dayBtnTextActive: { color: '#fff' },

  timeRow:       { flexDirection: 'row', gap: 12 },

  notifRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  notifLabel:    { fontSize: 14, fontWeight: '600', color: '#0F2B4C' },
  notifSub:      { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  accountRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  accountLabel:  { fontSize: 14, fontWeight: '700', color: '#0F2B4C' },
  accountEmail:  { fontSize: 12, color: '#6B7280', marginTop: 1 },

  logoutBtn:     {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  logoutText:    { fontSize: 14, fontWeight: '600', color: '#DC2626' },

  saveBtn:       { backgroundColor: '#0F2B4C', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText:   { color: '#fff', fontWeight: '700', fontSize: 16 },
});
