import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';

// Spec V8 §4.11 — partner store operating hours editor. Hits the
// existing /partner/settings endpoint (already accepts operatingDays
// + openTime + closeTime). Shows current schedule, lets staff toggle
// days and adjust open/close times. Affects customer drop-off picker
// and ops dispatcher.

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Settings {
  operatingDays?: string[];
  openTime?:      string;
  closeTime?:     string;
}

export default function PartnerHoursScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [days,      setDays]      = useState<string[]>(['Mon','Tue','Wed','Thu','Fri','Sat']);
  const [openTime,  setOpenTime]  = useState('08:00');
  const [closeTime, setCloseTime] = useState('18:00');
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    partnerApi.getSettings()
      .then((s: Settings) => {
        if (Array.isArray(s?.operatingDays)) setDays(s.operatingDays);
        if (s?.openTime)  setOpenTime(s.openTime);
        if (s?.closeTime) setCloseTime(s.closeTime);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleDay = (d: string) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const save = async () => {
    if (days.length === 0) {
      Alert.alert('Pick at least one day', 'Your store needs to be open at least one day a week.');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(openTime) || !/^\d{2}:\d{2}$/.test(closeTime)) {
      Alert.alert('Invalid time', 'Use 24-hour format like 08:00 or 18:30.');
      return;
    }
    setSaving(true);
    try {
      await partnerApi.updateSettings({ operatingDays: days, openTime, closeTime });
      Alert.alert('Saved', 'Hours updated. Customer drop-off picker will reflect within 60 seconds.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>
        <Text style={styles.title}>Store Hours</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {loading ? (
            <ActivityIndicator color="#3A7BD5" style={{ marginTop: 32 }} />
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>OPEN DAYS</Text>
                <View style={styles.daysRow}>
                  {DAYS.map(d => {
                    const on = days.includes(d);
                    return (
                      <Pressable
                        key={d}
                        onPress={() => toggleDay(d)}
                        style={[styles.dayChip, on && styles.dayChipOn]}
                      >
                        <Text style={[styles.dayText, on && styles.dayTextOn]}>{d}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardLabel}>OPENING TIME</Text>
                <TextInput
                  value={openTime}
                  onChangeText={setOpenTime}
                  placeholder="08:00"
                  placeholderTextColor="#9CA3AF"
                  style={styles.timeInput}
                  maxLength={5}
                />
                <Text style={styles.helper}>24-hour format. Example: 08:00 or 09:30</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardLabel}>CLOSING TIME</Text>
                <TextInput
                  value={closeTime}
                  onChangeText={setCloseTime}
                  placeholder="18:00"
                  placeholderTextColor="#9CA3AF"
                  style={styles.timeInput}
                  maxLength={5}
                />
              </View>

              <View style={styles.summary}>
                <Icon name="Clock" size={14} color="#3A7BD5" />
                <Text style={styles.summaryText}>
                  {days.length === 0
                    ? 'Pick at least one day to receive drop-offs.'
                    : `Open ${days.join(', ')} from ${openTime} to ${closeTime}`}
                </Text>
              </View>

              <Pressable
                disabled={saving || days.length === 0}
                onPress={save}
                style={[styles.primaryBtn, days.length === 0 && { opacity: 0.5 }]}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save hours</Text>}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:   { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },

  content:   { padding: 16, gap: 12 },

  card:      { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  cardLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 },

  daysRow:   { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dayChip:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: '#E5E7EB' },
  dayChipOn: { backgroundColor: '#3A7BD5', borderColor: '#3A7BD5' },
  dayText:   { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  dayTextOn: { color: '#fff' },

  timeInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: '700', color: '#0F2B4C', textAlign: 'center', letterSpacing: 4 },
  helper:    { fontSize: 11, color: '#9CA3AF' },

  summary:   { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#3A7BD518', borderRadius: 10 },
  summaryText:{ flex: 1, fontSize: 13, color: '#0F2B4C', fontWeight: '600' },

  primaryBtn:{ backgroundColor: '#0F2B4C', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
