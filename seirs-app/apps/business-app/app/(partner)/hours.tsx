import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Settings {
  operatingDays?: string[];
  openTime?:      string;
  closeTime?:     string;
}

export default function PartnerHoursScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

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
    } finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]}>
          <Icon name="ArrowLeft" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Store Hours</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardLabel, { color: colors.textSecond }]}>OPEN DAYS</Text>
                <View style={styles.daysRow}>
                  {DAYS.map(d => {
                    const on = days.includes(d);
                    return (
                      <Pressable
                        key={d}
                        onPress={() => toggleDay(d)}
                        style={[
                          styles.dayChip,
                          { borderColor: colors.border },
                          on && { backgroundColor: colors.accent, borderColor: colors.accent },
                        ]}
                      >
                        <Text style={[styles.dayText, { color: colors.textSecond }, on && { color: '#fff' }]}>{d}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardLabel, { color: colors.textSecond }]}>OPENING TIME</Text>
                <TextInput
                  value={openTime}
                  onChangeText={setOpenTime}
                  placeholder="08:00"
                  placeholderTextColor={colors.textThird}
                  style={[styles.timeInput, { borderColor: colors.border, color: colors.text }]}
                  maxLength={5}
                />
                <Text style={[styles.helper, { color: colors.textThird }]}>24-hour format. Example: 08:00 or 09:30</Text>
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardLabel, { color: colors.textSecond }]}>CLOSING TIME</Text>
                <TextInput
                  value={closeTime}
                  onChangeText={setCloseTime}
                  placeholder="18:00"
                  placeholderTextColor={colors.textThird}
                  style={[styles.timeInput, { borderColor: colors.border, color: colors.text }]}
                  maxLength={5}
                />
              </View>

              <View style={[styles.summary, { backgroundColor: colors.accent + '18' }]}>
                <Icon name="Clock" size={14} color={colors.accent} />
                <Text style={[styles.summaryText, { color: colors.text }]}>
                  {days.length === 0
                    ? 'Pick at least one day to receive drop-offs.'
                    : `Open ${days.join(', ')} from ${openTime} to ${closeTime}`}
                </Text>
              </View>

              <Pressable
                disabled={saving || days.length === 0}
                onPress={save}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }, days.length === 0 && { opacity: 0.5 }]}
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
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:   { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 18, fontWeight: '700' },

  content:   { padding: 16, gap: 12 },

  card:      { borderRadius: 12, padding: 14, gap: 8, borderWidth: 1 },
  cardLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  daysRow:   { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dayChip:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  dayText:   { fontSize: 13, fontWeight: '600' },

  timeInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 4 },
  helper:    { fontSize: 11 },

  summary:   { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  summaryText:{ flex: 1, fontSize: 13, fontWeight: '600' },

  primaryBtn:{ borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
