import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert,
  ActivityIndicator, RefreshControl, TextInput, Switch, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';

// Spec V8 §4.2 — recurring delivery templates for business senders.
// Each row is a saved schedule that auto-creates a delivery on its
// cadence. Backend cron fires every 5 min and dispatches due rows.

type Cadence = 'daily' | 'weekly' | 'monthly';

interface Template {
  id:         string;
  name:       string;
  cadence:    Cadence;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  hour:       number;
  minute:     number;
  isActive:   boolean;
  lastRunAt:  string | null;
  nextRunAt:  string;
  fireCount:  number;
  errorCount: number;
  lastError:  string | null;
  payload:    any;
}

const CADENCE_LABEL: Record<Cadence, string> = {
  daily:   'Every day',
  weekly:  'Every week',
  monthly: 'Every month',
};

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const cadenceFullLabel = (t: Template) => {
  const time = `${pad(t.hour)}:${pad(t.minute)}`;
  if (t.cadence === 'daily')   return `Every day at ${time}`;
  if (t.cadence === 'weekly')  return `Every ${DOW_SHORT[t.dayOfWeek ?? 1]} at ${time}`;
  return `Day ${t.dayOfMonth ?? 1} of each month at ${time}`;
};

const pad = (n: number) => String(n).padStart(2, '0');

const fmtNext = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function RecurringScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const [templates,   setTemplates]   = useState<Template[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [showCreate,  setShowCreate]  = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await businessApi.recurringTemplates.list();
      setTemplates(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load templates');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (t: Template) => {
    try {
      await businessApi.recurringTemplates.toggle(t.id, !t.isActive);
      load();
    } catch (e: any) {
      Alert.alert('Could not update', e?.message ?? 'Try again.');
    }
  };

  const remove = (t: Template) => {
    Alert.alert(
      'Delete template?',
      `"${t.name}" will stop auto-firing. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try { await businessApi.recurringTemplates.remove(t.id); load(); }
          catch (e: any) { Alert.alert('Could not delete', e?.message ?? 'Try again.'); }
        } },
      ],
    );
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
        <Text style={[styles.title, { color: colors.text }]}>Recurring Deliveries</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="Repeat" size={20} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Set it and forget it</Text>
          <Text style={styles.heroSub}>
            Schedule deliveries that auto-create on a daily, weekly, or monthly cadence. Perfect for warehouse-to-client routes, Monday refills, or month-end runs.
          </Text>
        </View>

        {error && (
          <View style={styles.note}>
            <Icon name="AlertCircle" size={14} color="#DC2626" />
            <Text style={[styles.noteText, { color: '#DC2626' }]}>{error}</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : templates.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="Calendar" size={36} color={colors.textThird} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No recurring templates yet</Text>
            <Text style={[styles.emptySub, { color: colors.textSecond }]}>
              Tap below to create your first one from any past delivery.
            </Text>
          </View>
        ) : (
          templates.map(t => (
            <View key={t.id} style={[styles.templateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.templateRow}>
                <View style={[styles.templateIcon, { backgroundColor: t.isActive ? '#16A34A18' : '#9CA3AF18' }]}>
                  <Icon name="Repeat" size={18} color={t.isActive ? '#16A34A' : '#9CA3AF'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.templateName, { color: colors.text }]}>{t.name}</Text>
                  <Text style={[styles.templateMeta, { color: colors.textSecond }]}>{cadenceFullLabel(t)}</Text>
                  <Text style={[styles.templateMeta, { color: colors.textThird }]}>
                    Next: {fmtNext(t.nextRunAt)} · Fired {t.fireCount}×
                    {t.errorCount > 0 ? ` · ${t.errorCount} error${t.errorCount === 1 ? '' : 's'}` : ''}
                  </Text>
                  {t.lastError && (
                    <Text style={styles.errorLine}>Last error: {t.lastError}</Text>
                  )}
                </View>
                <Switch
                  value={t.isActive}
                  onValueChange={() => toggle(t)}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>
              <Pressable onPress={() => remove(t)} style={styles.deleteRow}>
                <Icon name="Trash2" size={13} color="#DC2626" />
                <Text style={styles.deleteText}>Delete template</Text>
              </Pressable>
            </View>
          ))
        )}

        <Pressable
          style={[styles.addBtn, { borderColor: colors.accent }]}
          onPress={() => setShowCreate(true)}
        >
          <Icon name="Plus" size={16} color={colors.accent} />
          <Text style={[styles.addBtnText, { color: colors.accent }]}>Create new template</Text>
        </Pressable>
      </ScrollView>

      <CreateTemplateModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); load(); }}
      />
    </View>
  );
}

// ─── Create modal ───────────────────────────────────────────────────────────

function CreateTemplateModal({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const colors = useColors();
  const [recents,     setRecents]     = useState<any[]>([]);
  const [pickedId,    setPickedId]    = useState<string | null>(null);
  const [name,        setName]        = useState('');
  const [cadence,     setCadence]     = useState<Cadence>('weekly');
  const [dayOfWeek,   setDayOfWeek]   = useState(1);     // Mon
  const [dayOfMonth,  setDayOfMonth]  = useState(1);
  const [hour,        setHour]        = useState(9);
  const [minute,      setMinute]      = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true); setError(null); setPickedId(null); setName('');
    businessApi.deliveries(1)
      .then((res: any) => setRecents(res?.items ?? res ?? []))
      .catch((e: any) => setError(e?.message ?? 'Could not load past deliveries'))
      .finally(() => setLoading(false));
  }, [visible]);

  const pick = (d: any) => {
    setPickedId(d.id);
    if (!name) setName(`Repeat: ${d.dropoffAddress ?? d.pickupAddress ?? d.trackingCode ?? 'delivery'}`);
  };

  const submit = async () => {
    const source = recents.find(r => r.id === pickedId);
    if (!source) { setError('Pick a past delivery first.'); return; }
    if (!name.trim()) { setError('Name is required.'); return; }

    setSaving(true); setError(null);
    try {
      // Snapshot the source delivery into the same shape businessApi
      // .createDelivery accepts. Stops fall back to a single stop
      // derived from dropoff* when the source predates multi-stop.
      const stops = Array.isArray(source.stops) && source.stops.length > 0
        ? source.stops.map((s: any, i: number) => ({
            address:        s.address,
            lat:            Number(s.lat),
            lng:            Number(s.lng),
            recipientName:  s.recipientName,
            recipientPhone: s.recipientPhone,
            notes:          s.notes,
            sequenceOrder:  s.sequenceOrder ?? i + 1,
          }))
        : [{
            address:        source.dropoffAddress,
            lat:            Number(source.dropoffLat),
            lng:            Number(source.dropoffLng),
            recipientName:  source.recipientName ?? '',
            recipientPhone: source.recipientPhone ?? '',
            sequenceOrder:  1,
          }];

      const payload = {
        pickupAddress: source.pickupAddress,
        pickupLat:     Number(source.pickupLat),
        pickupLng:     Number(source.pickupLng),
        stops,
        vehicleType:   source.vehicleType ?? 'motorcycle',
        categoryCode:  source.categoryCode ?? 'small_parcel',
        weightKg:      Number(source.weightKg ?? 1),
        km:            Number(source.distanceKm ?? 0),
        estimatedDriveMinutes: Number(source.estimatedDriveMinutes ?? 0),
        packageDescription: source.packageDescription ?? undefined,
        isRecurring:   true,
      };

      await businessApi.recurringTemplates.create({
        name: name.trim(),
        cadence,
        dayOfWeek:  cadence === 'weekly'  ? dayOfWeek  : undefined,
        dayOfMonth: cadence === 'monthly' ? dayOfMonth : undefined,
        hour,
        minute,
        payload,
      });
      onCreated();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { paddingTop: 16, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose}><Icon name="X" size={22} color={colors.text} /></Pressable>
          <Text style={[styles.title, { color: colors.text }]}>New Template</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {error && (
            <View style={styles.note}>
              <Icon name="AlertCircle" size={14} color="#DC2626" />
              <Text style={[styles.noteText, { color: '#DC2626' }]}>{error}</Text>
            </View>
          )}

          <Text style={[styles.fieldLabel, { color: colors.textSecond }]}>1. Pick a past delivery to repeat</Text>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : recents.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecond, paddingVertical: 16 }]}>
              No past deliveries yet. Create one first, then come back here.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {recents.slice(0, 10).map(d => {
                const on = d.id === pickedId;
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => pick(d)}
                    style={[styles.pickCard, {
                      backgroundColor: on ? colors.accent + '15' : colors.surface,
                      borderColor: on ? colors.accent : colors.border,
                    }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                      {d.dropoffAddress ?? d.trackingCode ?? 'Delivery'}
                    </Text>
                    <Text style={{ color: colors.textSecond, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {d.pickupAddress ?? ''} {d.distanceKm ? `· ${d.distanceKm} km` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={[styles.fieldLabel, { color: colors.textSecond, marginTop: 16 }]}>2. Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Monday warehouse refill"
            placeholderTextColor={colors.textThird}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />

          <Text style={[styles.fieldLabel, { color: colors.textSecond, marginTop: 16 }]}>3. Cadence</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['daily', 'weekly', 'monthly'] as Cadence[]).map(c => {
              const on = cadence === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCadence(c)}
                  style={[styles.cadenceChip, {
                    backgroundColor: on ? colors.accent : colors.surface,
                    borderColor:     on ? colors.accent : colors.border,
                  }]}
                >
                  <Text style={{ color: on ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>
                    {CADENCE_LABEL[c]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {cadence === 'weekly' && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textSecond, marginTop: 12 }]}>Day of week</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {DOW_SHORT.map((label, i) => {
                  const on = dayOfWeek === i;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => setDayOfWeek(i)}
                      style={[styles.dayChip, {
                        backgroundColor: on ? colors.primary : colors.surface,
                        borderColor:     on ? colors.primary : colors.border,
                      }]}
                    >
                      <Text style={{ color: on ? '#fff' : colors.text, fontWeight: '600', fontSize: 12 }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {cadence === 'monthly' && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textSecond, marginTop: 12 }]}>Day of month (1-28)</Text>
              <TextInput
                value={String(dayOfMonth)}
                onChangeText={t => setDayOfMonth(Math.max(1, Math.min(28, Number(t) || 1)))}
                keyboardType="number-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
            </>
          )}

          <Text style={[styles.fieldLabel, { color: colors.textSecond, marginTop: 16 }]}>4. Time of day</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={String(hour)}
              onChangeText={t => setHour(Math.max(0, Math.min(23, Number(t) || 0)))}
              keyboardType="number-pad"
              maxLength={2}
              style={[styles.input, { width: 70, textAlign: 'center', color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>:</Text>
            <TextInput
              value={pad(minute)}
              onChangeText={t => setMinute(Math.max(0, Math.min(59, Number(t) || 0)))}
              keyboardType="number-pad"
              maxLength={2}
              style={[styles.input, { width: 70, textAlign: 'center', color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Text style={{ color: colors.textSecond, fontSize: 12 }}>24-hour</Text>
          </View>

          <Pressable
            disabled={saving || !pickedId || !name.trim()}
            onPress={submit}
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: (!pickedId || !name.trim() || saving) ? 0.5 : 1 }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Icon name="Check" size={16} color="#fff" />
                <Text style={styles.submitText}>Create template</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:   { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 18, fontWeight: '700' },

  content:   { padding: 16, gap: 16 },

  hero:      { backgroundColor: '#0F2B4C', borderRadius: 16, padding: 20, gap: 8, alignItems: 'flex-start' },
  heroIcon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  heroSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },

  empty:        { alignItems: 'center', gap: 10, paddingVertical: 32, textAlign: 'center' as any },
  emptyTitle:   { fontSize: 16, fontWeight: '700' },
  emptySub:     { fontSize: 13, textAlign: 'center', paddingHorizontal: 32, lineHeight: 18 },

  note:      { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 10 },
  noteText:  { flex: 1, fontSize: 12, lineHeight: 17 },

  templateCard: { borderRadius: 12, padding: 14, borderWidth: 1, gap: 10 },
  templateRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  templateIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  templateName: { fontSize: 14, fontWeight: '700' },
  templateMeta: { fontSize: 11, marginTop: 2 },
  errorLine:    { fontSize: 11, color: '#DC2626', marginTop: 2 },

  deleteRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  deleteText:   { fontSize: 11, color: '#DC2626', fontWeight: '600' },

  addBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed' },
  addBtnText:{ fontSize: 14, fontWeight: '700' },

  fieldLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  input:        { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },

  pickCard:     { borderRadius: 10, padding: 12, borderWidth: 1.5 },
  cadenceChip:  { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  dayChip:      { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },

  submitBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 24 },
  submitText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
});
