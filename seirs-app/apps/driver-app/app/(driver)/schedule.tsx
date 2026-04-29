import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

type DayId = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

interface DaySchedule {
  enabled: boolean;
  start:   string;
  end:     string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h    = i.toString().padStart(2, '0');
  const ampm = i < 12 ? 'AM' : 'PM';
  const h12  = i === 0 ? 12 : i > 12 ? i - 12 : i;
  return { value: `${h}:00`, label: `${h12}:00 ${ampm}` };
});

const DEFAULT_SCHEDULE: Record<DayId, DaySchedule> = {
  Mon: { enabled: true,  start: '07:00', end: '19:00' },
  Tue: { enabled: true,  start: '07:00', end: '19:00' },
  Wed: { enabled: true,  start: '07:00', end: '19:00' },
  Thu: { enabled: true,  start: '07:00', end: '19:00' },
  Fri: { enabled: true,  start: '07:00', end: '22:00' },
  Sat: { enabled: true,  start: '08:00', end: '22:00' },
  Sun: { enabled: false, start: '10:00', end: '18:00' },
};

const DAYS: DayId[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS: Record<DayId, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

export default function ScheduleScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [schedule, setSchedule] = useState<Record<DayId, DaySchedule>>(DEFAULT_SCHEDULE);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [pickerOpen, setPickerOpen] = useState<{ day: DayId; field: 'start' | 'end' } | null>(null);

  const toggle = (day: DayId) =>
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));

  const setTime = (day: DayId, field: 'start' | 'end', value: string) => {
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
    setPickerOpen(null);
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); setSaved(true); }, 800);
    setTimeout(() => setSaved(false), 3000);
  };

  const activeDays = DAYS.filter(d => schedule[d].enabled).length;

  const fmtTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm   = h < 12 ? 'AM' : 'PM';
    const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>My Schedule</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Summary */}
        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '30' }]}>
          <Ionicons name="calendar-outline" size={20} color={theme.primary} />
          <Text style={[styles.summaryText, { color: theme.text }]}>
            Active <Text style={{ color: theme.primary, fontWeight: FontWeight.bold }}>{activeDays} days</Text> this week
          </Text>
        </View>

        {/* Day rows */}
        {DAYS.map(day => {
          const s = schedule[day];
          return (
            <View key={day} style={[styles.dayCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              <View style={styles.dayHeader}>
                <View style={styles.dayLeft}>
                  <Text style={[styles.dayName, { color: theme.text }]}>{DAY_LABELS[day]}</Text>
                  <Text style={[styles.dayShort, { color: theme.textThird }]}>{day}</Text>
                </View>
                <Switch
                  value={s.enabled}
                  onValueChange={() => toggle(day)}
                  trackColor={{ false: theme.border, true: theme.primary + '80' }}
                  thumbColor={s.enabled ? theme.primary : theme.textThird}
                />
              </View>

              {s.enabled && (
                <View style={[styles.timeRow, { borderTopColor: theme.border }]}>
                  <View style={styles.timePair}>
                    <Text style={[styles.timeLabel, { color: theme.textThird }]}>Start</Text>
                    <Pressable
                      style={[styles.timeChip, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}
                      onPress={() => setPickerOpen(prev => prev?.day === day && prev.field === 'start' ? null : { day, field: 'start' })}
                    >
                      <Ionicons name="time-outline" size={14} color={theme.textSecond} />
                      <Text style={[styles.timeChipText, { color: theme.text }]}>{fmtTime(s.start)}</Text>
                    </Pressable>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={theme.textThird} />
                  <View style={styles.timePair}>
                    <Text style={[styles.timeLabel, { color: theme.textThird }]}>End</Text>
                    <Pressable
                      style={[styles.timeChip, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}
                      onPress={() => setPickerOpen(prev => prev?.day === day && prev.field === 'end' ? null : { day, field: 'end' })}
                    >
                      <Ionicons name="time-outline" size={14} color={theme.textSecond} />
                      <Text style={[styles.timeChipText, { color: theme.text }]}>{fmtTime(s.end)}</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Inline hour picker */}
              {pickerOpen?.day === day && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourPicker}>
                  {HOURS.map(h => (
                    <Pressable
                      key={h.value}
                      style={[
                        styles.hourChip,
                        {
                          backgroundColor: schedule[day][pickerOpen.field] === h.value ? theme.primary : theme.surfaceSecond,
                          borderColor:     schedule[day][pickerOpen.field] === h.value ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => setTime(day, pickerOpen.field, h.value)}
                    >
                      <Text style={[styles.hourText, { color: schedule[day][pickerOpen.field] === h.value ? '#fff' : theme.textSecond }]}>
                        {h.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          );
        })}

        {saved && (
          <View style={[styles.savedBanner, { backgroundColor: '#22C55E18', borderColor: '#22C55E30' }]}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#22C55E" />
            <Text style={[styles.savedText, { color: '#22C55E' }]}>Schedule saved successfully.</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.ctaBar, { backgroundColor: theme.navBackground, borderTopColor: theme.border }]}>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: theme.primary }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Schedule'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.sm },

  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  summaryText: { fontSize: FontSize.base },

  dayCard:   { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayLeft:   { gap: 2 },
  dayName:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  dayShort:  { fontSize: FontSize.xs },

  timeRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 0.5 },
  timePair: { flex: 1, gap: 4 },
  timeLabel:{ fontSize: FontSize.xs },
  timeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 8, borderRadius: Radius.lg, borderWidth: 1 },
  timeChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  hourPicker: { gap: Spacing.sm, paddingTop: Spacing.sm },
  hourChip:   { paddingHorizontal: Spacing.sm, paddingVertical: 7, borderRadius: Radius.md, borderWidth: 1 },
  hourText:   { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  savedBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  savedText:   { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  ctaBar:      { padding: Spacing.md, borderTopWidth: 1 },
  saveBtn:     { height: 54, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
