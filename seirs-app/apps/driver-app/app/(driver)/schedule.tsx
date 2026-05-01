import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft, Calendar, Clock, ChevronRight, Bell, BellOff,
  MapPin, Package, ChevronDown,
} from 'lucide-react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

type DayId = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

interface DaySchedule { enabled: boolean; start: string; end: string; }

interface PreBookedJob {
  id: string;
  date: string;
  time: string;
  customer: string;
  pickup: string;
  dropoff: string;
  fare: number;
  vehicle: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h12  = i === 0 ? 12 : i > 12 ? i - 12 : i;
  const ampm = i < 12 ? 'AM' : 'PM';
  return { value: `${i.toString().padStart(2, '0')}:00`, label: `${h12}:00 ${ampm}` };
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

const MOCK_PREBOOKED: PreBookedJob[] = [
  {
    id: 'pb1',
    date: 'Today',
    time: '14:00',
    customer: 'Amaka Obi',
    pickup: '15 Adeola Odeku, Victoria Island',
    dropoff: 'Ikeja City Mall, Airport Road',
    fare: 4800,
    vehicle: 'Car',
  },
  {
    id: 'pb2',
    date: 'Tomorrow',
    time: '09:30',
    customer: 'Biodun Adeyemi',
    pickup: 'Lekki Phase 1 Roundabout',
    dropoff: 'Trade Fair Complex, Lagos',
    fare: 7200,
    vehicle: 'Van',
  },
  {
    id: 'pb3',
    date: 'Thu, 2 May',
    time: '11:00',
    customer: 'Chidinma Eze',
    pickup: 'Surulere Market',
    dropoff: 'Agege Stadium, Lagos',
    fare: 2500,
    vehicle: 'Motorcycle',
  },
];

export default function ScheduleScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [schedule,    setSchedule]    = useState<Record<DayId, DaySchedule>>(DEFAULT_SCHEDULE);
  const [reminders,   setReminders]   = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [pickerOpen,  setPickerOpen]  = useState<{ day: DayId; field: 'start' | 'end' } | null>(null);
  const [showSched,   setShowSched]   = useState(true);

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
    const [h] = t.split(':').map(Number);
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:00 ${ampm}`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} strokeWidth={1.75} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Schedule</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Pre-booked jobs */}
        <View style={styles.sectionRow}>
          <View style={styles.sectionLeft}>
            <Calendar size={18} color={theme.primary} strokeWidth={1.75} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Upcoming Jobs</Text>
          </View>
          <Text style={[styles.sectionCount, { color: theme.textThird }]}>{MOCK_PREBOOKED.length} scheduled</Text>
        </View>

        {MOCK_PREBOOKED.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Package size={32} color={theme.textThird} strokeWidth={1.5} />
            <Text style={[styles.emptyText, { color: theme.textSecond }]}>No scheduled jobs yet</Text>
          </View>
        ) : (
          MOCK_PREBOOKED.map(job => (
            <View key={job.id} style={[styles.jobCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              <View style={styles.jobTop}>
                <View style={[styles.timeBadge, { backgroundColor: theme.primary + '15' }]}>
                  <Clock size={12} color={theme.primary} strokeWidth={1.75} />
                  <Text style={[styles.timeText, { color: theme.primary }]}>{job.date} · {fmtTime(job.time)}</Text>
                </View>
                <Text style={[styles.jobFare, { color: theme.primary }]}>₦{job.fare.toLocaleString()}</Text>
              </View>
              <Text style={[styles.jobCustomer, { color: theme.text }]}>{job.customer}</Text>
              <View style={styles.addrRow}>
                <MapPin size={12} color="#16A34A" strokeWidth={1.75} />
                <Text style={[styles.addrText, { color: theme.textSecond }]} numberOfLines={1}>{job.pickup}</Text>
              </View>
              <View style={styles.addrRow}>
                <MapPin size={12} color="#EF4444" strokeWidth={1.75} />
                <Text style={[styles.addrText, { color: theme.textSecond }]} numberOfLines={1}>{job.dropoff}</Text>
              </View>
              <View style={styles.jobBottom}>
                <Text style={[styles.vehicleChip, { color: theme.textThird, borderColor: theme.border }]}>{job.vehicle}</Text>
                <Pressable style={[styles.remindBtn, { backgroundColor: theme.primary + '15' }]}>
                  <Bell size={12} color={theme.primary} strokeWidth={1.75} />
                  <Text style={[styles.remindText, { color: theme.primary }]}>Remind me</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        {/* 30-min reminders toggle */}
        <View style={[styles.reminderCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          <View style={styles.reminderLeft}>
            {reminders
              ? <Bell    size={20} color={theme.primary}    strokeWidth={1.75} />
              : <BellOff size={20} color={theme.textThird} strokeWidth={1.75} />
            }
            <View>
              <Text style={[styles.reminderTitle, { color: theme.text }]}>30-minute reminders</Text>
              <Text style={[styles.reminderSub, { color: theme.textThird }]}>Push alert before each scheduled job</Text>
            </View>
          </View>
          <Switch
            value={reminders}
            onValueChange={setReminders}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor="#fff"
          />
        </View>

        {/* Availability schedule */}
        <Pressable style={styles.sectionRow} onPress={() => setShowSched(v => !v)}>
          <View style={styles.sectionLeft}>
            <Clock size={18} color={theme.primary} strokeWidth={1.75} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Availability Hours</Text>
          </View>
          <View style={styles.sectionRight}>
            <Text style={[styles.sectionCount, { color: theme.textThird }]}>{activeDays} days active</Text>
            <ChevronDown size={16} color={theme.textThird} strokeWidth={1.75} style={{ transform: [{ rotate: showSched ? '180deg' : '0deg' }] }} />
          </View>
        </Pressable>

        {showSched && (
          <View style={[styles.schedCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            {DAYS.map((day, i) => (
              <View
                key={day}
                style={[styles.dayRow, i < DAYS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
              >
                <Switch
                  value={schedule[day].enabled}
                  onValueChange={() => toggle(day)}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor="#fff"
                  style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                />
                <Text style={[styles.dayLabel, { color: schedule[day].enabled ? theme.text : theme.textThird }]}>
                  {DAY_LABELS[day]}
                </Text>
                {schedule[day].enabled ? (
                  <View style={styles.timePickers}>
                    <Pressable
                      style={[styles.timePill, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}
                      onPress={() => setPickerOpen({ day, field: 'start' })}
                    >
                      <Text style={[styles.timePillText, { color: theme.text }]}>{fmtTime(schedule[day].start)}</Text>
                    </Pressable>
                    <Text style={[styles.timeSep, { color: theme.textThird }]}>–</Text>
                    <Pressable
                      style={[styles.timePill, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}
                      onPress={() => setPickerOpen({ day, field: 'end' })}
                    >
                      <Text style={[styles.timePillText, { color: theme.text }]}>{fmtTime(schedule[day].end)}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={[styles.dayOff, { color: theme.textThird }]}>Day off</Text>
                )}
              </View>
            ))}

            {/* Time picker dropdown */}
            {pickerOpen && (
              <View style={[styles.pickerOverlay, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.md]}>
                <Text style={[styles.pickerTitle, { color: theme.text }]}>
                  {DAY_LABELS[pickerOpen.day]} — {pickerOpen.field === 'start' ? 'Start' : 'End'} time
                </Text>
                <ScrollView style={{ maxHeight: 200 }}>
                  {HOURS.map(h => (
                    <Pressable
                      key={h.value}
                      style={[styles.pickerRow, schedule[pickerOpen.day][pickerOpen.field] === h.value && { backgroundColor: theme.primary + '18' }]}
                      onPress={() => setTime(pickerOpen.day, pickerOpen.field, h.value)}
                    >
                      <Text style={[styles.pickerItem, { color: schedule[pickerOpen.day][pickerOpen.field] === h.value ? theme.primary : theme.text }]}>
                        {h.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <Pressable
              style={[styles.saveBtn, { backgroundColor: theme.primary }, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : saved ? 'Saved!' : 'Save Schedule'}</Text>
            </Pressable>
          </View>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  content: { padding: Spacing.md, gap: Spacing.md },

  sectionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLeft:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  sectionCount: { fontSize: FontSize.sm },

  emptyCard: { alignItems: 'center', padding: Spacing.xl, borderRadius: Radius.xl, borderWidth: 1, gap: Spacing.sm },
  emptyText: { fontSize: FontSize.sm },

  jobCard:    { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  jobTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  timeText:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold as any },
  jobFare:    { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  jobCustomer:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  addrRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addrText:   { fontSize: FontSize.sm, flex: 1 },
  jobBottom:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  vehicleChip:{ fontSize: FontSize.xs, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  remindBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  remindText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold as any },

  reminderCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  reminderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  reminderTitle:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  reminderSub:  { fontSize: FontSize.xs, marginTop: 2 },

  schedCard: { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  dayRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  dayLabel:  { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium as any },
  dayOff:    { fontSize: FontSize.sm },
  timePickers:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  timePill:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.lg, borderWidth: 1 },
  timePillText:{ fontSize: FontSize.xs, fontWeight: FontWeight.medium as any },
  timeSep:    { fontSize: FontSize.sm },

  pickerOverlay: { margin: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', padding: Spacing.md },
  pickerTitle:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, marginBottom: Spacing.sm },
  pickerRow:     { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.md },
  pickerItem:    { fontSize: FontSize.base },

  saveBtn:     { margin: Spacing.md, marginTop: 0, height: 48, borderRadius: Radius.xl, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
});
