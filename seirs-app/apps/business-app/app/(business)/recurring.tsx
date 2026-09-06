import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TextInput, Switch, Modal, Platform, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { businessApi, feesApi } from '@/services/api';
import { TERMS_URL } from '@/constants/config';
import { tint } from '@/constants/tint';
import { useColors, useTheme } from '@/context/ThemeContext';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';

/**
 * Recurring runs.
 *
 * A template is a saved booking plus a cadence. What it is NOT, and the
 * founder was exact about this on 2026-09-06, is a subscription: nothing
 * is ever charged on its own. About an hour before each pickup the server
 * creates the run at that day's price, marks it Awaiting payment and
 * pushes the owner to pay. They pay through checkout, with their bank's
 * OTP, every time. A run nobody paid for is cancelled at pickup time and
 * they are told. Three reasons, his: it must never look like a
 * subscription; the processing cost must be seen before committing; and
 * fuel moves too often to hold a price for weeks.
 *
 * The screen says all of that in the hero, again in the create flow, and
 * makes the owner tick it before a template can be saved. The old copy
 * ("set it and forget it", "auto-create") promised the opposite.
 */

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
const pad = (n: number) => String(n).padStart(2, '0');

const cadenceFullLabel = (t: Template) => {
  const time = `${pad(t.hour)}:${pad(t.minute)}`;
  if (t.cadence === 'daily')   return `Every day at ${time}`;
  if (t.cadence === 'weekly')  return `Every ${DOW_SHORT[t.dayOfWeek ?? 1]} at ${time}`;
  return `Day ${t.dayOfMonth ?? 1} of each month at ${time}`;
};

const fmtNext = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const fmtTime = (d: Date) => d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });

/** "about an hour", "about 90 minutes": the lead time in words. */
const leadWords = (min: number) =>
  min === 60 ? 'about an hour' : min % 60 === 0 ? `about ${min / 60} hours` : `about ${min} minutes`;

/**
 * Inside a React Native Modal on Android the safe-area insets read 0, so a
 * footer sized from them sits under the system navigation bar, which is
 * exactly where the founder found the Create button. A fixed floor for the
 * three-button bar, the insets where they are real.
 */
const bottomFloor = (inset: number) => Math.max(inset, Platform.OS === 'android' ? 56 : 16);

export default function RecurringScreen() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();

  const [templates,   setTemplates]   = useState<Template[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [showCreate,  setShowCreate]  = useState(false);
  // Admin-tunable (Fee Catalogue: recurring_notice_minutes); 60 is the code fallback.
  const [leadMin,     setLeadMin]     = useState(60);

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
  useEffect(() => {
    feesApi.get('recurring_notice_minutes')
      .then((r: any) => { const v = Number(r?.value); if (v > 0) setLeadMin(v); })
      .catch(() => {});
  }, []);

  const toggle = async (t: Template) => {
    try {
      await businessApi.recurringTemplates.toggle(t.id, !t.isActive);
      load();
    } catch (e: any) {
      alertDialog('Could not update', e?.message ?? 'Try again.');
    }
  };

  const remove = (t: Template) => {
    alertDialog(
      'Delete this schedule?',
      `"${t.name}" will stop. Runs already created stay in your deliveries. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try { await businessApi.recurringTemplates.remove(t.id); load(); }
          catch (e: any) { alertDialog('Could not delete', e?.message ?? 'Try again.'); }
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
        <Text style={[styles.title, { color: colors.text }]}>{tx('auto.recurring.recurringDeliveries', 'Recurring Deliveries')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomFloor(insets.bottom) + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="Repeat" size={20} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{tx('auto.recurring.repeatARunWithoutRepeating', 'Repeat a run without repeating the typing')}</Text>
          <Text style={styles.heroSub}>
            Pick a past delivery and a schedule. {leadWords(leadMin)[0].toUpperCase() + leadWords(leadMin).slice(1)} before
            each pickup we create the run at that day's price, mark it Awaiting payment and tell you. You pay through
            checkout with your bank's OTP, and it goes out. Nothing is ever charged on its own.
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
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{tx('auto.recurring.noSchedulesYet', 'No schedules yet')}</Text>
            <Text style={[styles.emptySub, { color: colors.textSecond }]}>
              Start from any past delivery. Monday refills, month-end runs, the daily drop to a client.
            </Text>
          </View>
        ) : (
          templates.map(t => {
            const next = new Date(t.nextRunAt);
            const askAt = new Date(next.getTime() - leadMin * 60_000);
            return (
              <View key={t.id} style={[styles.templateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.templateRow}>
                  <View style={[styles.templateIcon, { backgroundColor: tint(t.isActive ? 'green' : 'grey', isDark).bg }]}>
                    <Icon name="Repeat" size={18} color={tint(t.isActive ? 'green' : 'grey', isDark).fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.templateName, { color: colors.text }]}>{t.name}</Text>
                    <Text style={[styles.templateMeta, { color: colors.textSecond }]}>{cadenceFullLabel(t)}</Text>
                    {t.isActive ? (
                      <Text style={[styles.templateMeta, { color: colors.textThird }]}>
                        Next run {fmtNext(t.nextRunAt)} · we ask you to pay from {fmtTime(askAt)}
                      </Text>
                    ) : (
                      <Text style={[styles.templateMeta, { color: colors.textThird }]}>{tx('auto.recurring.paused', 'Paused')}</Text>
                    )}
                    <Text style={[styles.templateMeta, { color: colors.textThird }]}>
                      {t.fireCount} run{t.fireCount === 1 ? '' : 's'} created so far
                      {t.errorCount > 0 ? ` · ${t.errorCount} could not be created` : ''}
                    </Text>
                    {t.lastError && (
                      <Text style={styles.errorLine}>Last problem: {t.lastError}</Text>
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
                  <Text style={styles.deleteText}>{tx('auto.recurring.deleteSchedule', 'Delete schedule')}</Text>
                </Pressable>
              </View>
            );
          })
        )}

        <Pressable
          style={[styles.addBtn, { borderColor: colors.accent }]}
          onPress={() => setShowCreate(true)}
        >
          <Icon name="Plus" size={16} color={colors.accent} />
          <Text style={[styles.addBtnText, { color: colors.accent }]}>{tx('auto.recurring.newScheduleFromAPast', 'New schedule from a past delivery')}</Text>
        </Pressable>
      </ScrollView>

      <CreateTemplateModal
        visible={showCreate}
        leadMin={leadMin}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); load(); }}
      />
    </View>
  );
}

// ─── Create flow ───────────────────────────────────────────────────────────

function CreateTemplateModal({ visible, leadMin, onClose, onCreated }: {
  visible: boolean;
  leadMin: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [recents,     setRecents]     = useState<any[]>([]);
  const [pickedId,    setPickedId]    = useState<string | null>(null);
  const [name,        setName]        = useState('');
  const [cadence,     setCadence]     = useState<Cadence>('weekly');
  const [dayOfWeek,   setDayOfWeek]   = useState(1);     // Mon
  const [dayOfMonth,  setDayOfMonth]  = useState(1);
  const [hour,        setHour]        = useState(9);
  const [minute,      setMinute]      = useState(0);
  const [agreed,      setAgreed]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true); setError(null); setPickedId(null); setName(''); setAgreed(false);
    businessApi.deliveries(1)
      .then((res: any) => setRecents(res?.items ?? res ?? []))
      .catch((e: any) => setError(e?.message ?? 'Could not load past deliveries'))
      .finally(() => setLoading(false));
  }, [visible]);

  const pick = (d: any) => {
    setPickedId(d.id);
    if (!name) setName(`Repeat: ${d.dropoffAddress ?? d.pickupAddress ?? d.trackingCode ?? 'delivery'}`);
  };

  const source = recents.find(r => r.id === pickedId);
  const ready  = !!source && !!name.trim() && agreed && !saving;

  const submit = async () => {
    if (!source) { setError('Pick a past delivery first.'); return; }
    if (!name.trim()) { setError('Give the schedule a name.'); return; }
    if (!agreed) { setError('Tick the line above the button first.'); return; }

    setSaving(true); setError(null);
    try {
      // Snapshot the source delivery into the same shape businessApi
      // .createDelivery accepts. Stops fall back to a single stop derived
      // from dropoff* when the source predates multi-stop.
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
        // The server refuses a schedule without this.
        termsAccepted: true,
      } as any);
      onCreated();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the schedule');
    } finally {
      setSaving(false);
    }
  };

  const Step = ({ n, title }: { n: number; title: string }) => (
    <View style={styles.stepHead}>
      <View style={[styles.stepNum, { backgroundColor: colors.primary }]}><Text style={styles.stepNumTxt}>{n}</Text></View>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{title}</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { paddingTop: 16, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={8}><Icon name="X" size={22} color={colors.text} /></Pressable>
          <Text style={[styles.title, { color: colors.text }]}>{tx('auto.recurring.newSchedule', 'New schedule')}</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
          {error && (
            <View style={styles.note}>
              <Icon name="AlertCircle" size={14} color="#DC2626" />
              <Text style={[styles.noteText, { color: '#DC2626' }]}>{error}</Text>
            </View>
          )}

          <Step n={1} title={tx('auto.recurring.pickAPastDeliveryTo', 'Pick a past delivery to repeat')} />
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : recents.length === 0 ? (
            <Text style={{ color: colors.textSecond, paddingVertical: 12, lineHeight: 19 }}>
              No past deliveries yet. Send one first, then come back here.
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
                      backgroundColor: on ? colors.primaryLight : colors.surface,
                      borderColor: on ? colors.primary : colors.border,
                    }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                        {/* Multi-package runs carry no dropoffAddress; the last stop is the destination. */}
                        {d.dropoffAddress
                          ?? (Array.isArray(d.stops) && d.stops.length ? `${d.stops[d.stops.length - 1]?.address ?? ''}${d.stops.length > 1 ? ` (+${d.stops.length - 1} more)` : ''}` : null)
                          ?? d.trackingCode ?? 'Delivery'}
                      </Text>
                      <Text style={{ color: colors.textSecond, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                        from {d.pickupAddress ?? '?'}{d.distanceKm ? ` · ${d.distanceKm} km` : ''}
                      </Text>
                    </View>
                    <View style={[styles.radio, { borderColor: on ? colors.primary : colors.textThird, backgroundColor: on ? colors.primary : 'transparent' }]} />
                  </Pressable>
                );
              })}
            </View>
          )}

          <Step n={2} title={tx('auto.recurring.nameIt', 'Name it')} />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={tx('auto.recurring.mondayWarehouseRefill', 'Monday warehouse refill')}
            placeholderTextColor={colors.textThird}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />

          <Step n={3} title={tx('auto.recurring.howOften', 'How often')} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['daily', 'weekly', 'monthly'] as Cadence[]).map(c => {
              const on = cadence === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCadence(c)}
                  style={[styles.cadenceChip, {
                    backgroundColor: on ? colors.primary : colors.surface,
                    borderColor:     on ? colors.primary : colors.border,
                  }]}
                >
                  <Text style={{ color: on ? '#fff' : colors.text, fontWeight: '600', fontSize: 14 }}>
                    {CADENCE_LABEL[c]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {cadence === 'weekly' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
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
                    <Text style={{ color: on ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {cadence === 'monthly' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <Text style={{ color: colors.textSecond, fontSize: 13 }}>Day of the month (1 to 28)</Text>
              <TextInput
                value={String(dayOfMonth)}
                onChangeText={t => setDayOfMonth(Math.max(1, Math.min(28, Number(t) || 1)))}
                keyboardType="number-pad"
                maxLength={2}
                style={[styles.input, { width: 64, textAlign: 'center', color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
            </View>
          )}

          <Step n={4} title={tx('auto.recurring.pickupTime', 'Pickup time')} />
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
            <Text style={{ color: colors.textSecond, fontSize: 13 }}>24-hour</Text>
          </View>
          <Text style={{ color: colors.textSecond, fontSize: 13, lineHeight: 18, marginTop: -6 }}>
            We create the run and ask you to pay from {pad(((hour * 60 + minute - leadMin + 1440) % 1440) / 60 | 0)}:{pad((hour * 60 + minute - leadMin + 1440) % 60)}, at that day's price.
          </Text>

          {/* The same terms line the pay screens carry (founder 2026-09-06:
              the essentials only; the blue card above already explains). */}
          <Pressable onPress={() => setAgreed(a => !a)} style={[styles.agree, { borderColor: agreed ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
            <View style={[styles.checkbox, { borderColor: agreed ? colors.primary : colors.textThird, backgroundColor: agreed ? colors.primary : 'transparent' }]}>
              {agreed && <Icon name="Check" size={14} color="#fff" />}
            </View>
            <Text style={[styles.agreeText, { color: colors.text }]}>
              I agree to the SEIRS Terms of Service. Each run is priced on the day and I pay it before pickup.{' '}
              <Text onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} style={{ color: colors.primary, fontWeight: '600' }}>{tx('auto.recurring.readThem', 'Read them')}</Text>
            </Text>
          </Pressable>
        </ScrollView>

        {/* Footer outside the scroll, above the system bar. */}
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: bottomFloor(insets.bottom) }]}>
          <Pressable
            disabled={!ready}
            onPress={submit}
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: ready ? 1 : 0.5 }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Icon name="Check" size={16} color="#fff" />
                <Text style={styles.submitText}>{tx('auto.recurring.saveSchedule', 'Save schedule')}</Text>
              </>
            )}
          </Pressable>
        </View>
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
  heroSub:   { color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 20 },

  empty:        { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyTitle:   { fontSize: 16, fontWeight: '700' },
  emptySub:     { fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 19 },

  note:      { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 10 },
  noteText:  { flex: 1, fontSize: 13, lineHeight: 17 },

  templateCard: { borderRadius: 12, padding: 14, borderWidth: 1, gap: 10 },
  templateRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  templateIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  templateName: { fontSize: 15, fontWeight: '700' },
  templateMeta: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  errorLine:    { fontSize: 12, color: '#DC2626', marginTop: 2 },

  deleteRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  deleteText:   { fontSize: 12, color: '#DC2626', fontWeight: '600' },

  addBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed' },
  addBtnText:{ fontSize: 15, fontWeight: '700' },

  stepHead:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 },
  stepNum:    { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNumTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fieldLabel: { fontSize: 14, fontWeight: '700' },
  input:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },

  pickCard:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 12, borderWidth: 1.5 },
  radio:        { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  cadenceChip:  { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  dayChip:      { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },

  agree:      { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 1.5, borderRadius: 12, padding: 12 },
  checkbox:   { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  agreeText:  { flex: 1, fontSize: 13, lineHeight: 19 },

  footer:     { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12 },
  submitBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
