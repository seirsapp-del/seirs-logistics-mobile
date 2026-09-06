import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TextInput, Switch, Modal, Platform,
  StatusBar, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Repeat, Calendar, Plus, Trash2, Check, X, AlertCircle } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi, recurringApi, feesApi } from '@/services/api';
import { showDialog } from '@/components/SeirsDialog';
import { TERMS_URL } from '@/constants/config';

/**
 * Recurring runs, customer side (founder 2026-09-06: "add the recurring
 * thing to the customer app as well").
 *
 * Same rules as the business app, and the founder was exact about them:
 * this is not a subscription and nothing is charged on its own. About an
 * hour before each pickup the server creates the run at that day's price,
 * marks it Awaiting payment and pushes the customer to pay. They pay
 * through checkout, with their bank's OTP, every time. A run nobody paid
 * for is cancelled at pickup time. The template holds a past booking's
 * details; the price is never held.
 */

type Cadence = 'daily' | 'weekly' | 'monthly';

interface Template {
  id: string; name: string; cadence: Cadence;
  dayOfWeek?: number | null; dayOfMonth?: number | null;
  hour: number; minute: number; isActive: boolean;
  lastRunAt: string | null; nextRunAt: string;
  fireCount: number; errorCount: number; lastError: string | null;
  payload: any;
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const fmtNext = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtTime = (d: Date) => d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
const leadWords = (min: number) =>
  min === 60 ? 'about an hour' : min % 60 === 0 ? `about ${min / 60} hours` : `about ${min} minutes`;
/** Insets read 0 inside an Android Modal, so the footer gets a floor for the system bar. */
const bottomFloor = (inset: number) => Math.max(inset, Platform.OS === 'android' ? 56 : 16);

export default function RecurringScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const { t }  = useTranslation();

  const [templates,  setTemplates]  = useState<Template[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [leadMin,    setLeadMin]    = useState(60);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await recurringApi.list();
      setTemplates(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your schedules');
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

  const cadenceLabel = (tpl: Template) => {
    const time = `${pad(tpl.hour)}:${pad(tpl.minute)}`;
    if (tpl.cadence === 'daily')  return t('recurring.everyDayAt', { defaultValue: 'Every day at {{time}}', time });
    if (tpl.cadence === 'weekly') return t('recurring.everyWeekAt', { defaultValue: 'Every {{day}} at {{time}}', day: DOW_SHORT[tpl.dayOfWeek ?? 1], time });
    return t('recurring.everyMonthAt', { defaultValue: 'Day {{day}} of each month at {{time}}', day: tpl.dayOfMonth ?? 1, time });
  };

  const toggle = async (tpl: Template) => {
    try { await recurringApi.toggle(tpl.id, !tpl.isActive); load(); }
    catch (e: any) { showDialog({ title: t('recurring.couldNotUpdate', { defaultValue: 'Could not update' }), message: e?.message ?? '' }); }
  };

  const remove = (tpl: Template) => {
    showDialog({
      title:   t('recurring.deleteTitle', { defaultValue: 'Delete this schedule?' }),
      message: t('recurring.deleteBody',  { defaultValue: '"{{name}}" will stop. Runs already created stay in your bookings.', name: tpl.name }),
      actions: [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: async () => {
          try { await recurringApi.remove(tpl.id); load(); }
          catch (e: any) { showDialog({ title: t('recurring.couldNotDelete', { defaultValue: 'Could not delete' }), message: e?.message ?? '' }); }
        } },
      ],
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={cs === 'dark' ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} hitSlop={8}>
          <ArrowLeft size={20} color={theme.text} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('recurring.title', { defaultValue: 'Recurring deliveries' })}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomFloor(insets.bottom) + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={[styles.hero, { backgroundColor: theme.primary }]}>
          <View style={styles.heroIcon}><Repeat size={20} color="#fff" strokeWidth={2} /></View>
          <Text style={styles.heroTitle}>{t('recurring.heroTitle', { defaultValue: 'Repeat a delivery without repeating the typing' })}</Text>
          <Text style={styles.heroSub}>
            {t('recurring.heroBody', {
              defaultValue: 'Pick a past delivery and a schedule. {{lead}} before each pickup we create it at that day\'s price, mark it Awaiting payment and tell you. You pay through checkout, and it goes out. Nothing is ever charged on its own.',
              lead: leadWords(leadMin)[0].toUpperCase() + leadWords(leadMin).slice(1),
            })}
          </Text>
        </View>

        {error && (
          <View style={styles.note}>
            <AlertCircle size={14} color="#DC2626" strokeWidth={2} />
            <Text style={[styles.noteText, { color: '#DC2626' }]}>{error}</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
        ) : templates.length === 0 ? (
          <View style={styles.empty}>
            <Calendar size={36} color={theme.textThird} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('recurring.emptyTitle', { defaultValue: 'No schedules yet' })}</Text>
            <Text style={[styles.emptySub, { color: theme.textSecond }]}>
              {t('recurring.emptyBody', { defaultValue: 'Start from any past delivery: the weekly drop to your mum, the Friday parcel to a client.' })}
            </Text>
          </View>
        ) : (
          templates.map(tpl => {
            const next  = new Date(tpl.nextRunAt);
            const askAt = new Date(next.getTime() - leadMin * 60_000);
            return (
              <View key={tpl.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
                <View style={styles.cardRow}>
                  <View style={[styles.cardIcon, { backgroundColor: tpl.isActive ? '#E7F3EC' : theme.surfaceSecond }]}>
                    <Repeat size={18} color={tpl.isActive ? '#1E7B4C' : theme.textThird} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardName, { color: theme.text }]}>{tpl.name}</Text>
                    <Text style={[styles.cardMeta, { color: theme.textSecond }]}>{cadenceLabel(tpl)}</Text>
                    <Text style={[styles.cardMeta, { color: theme.textThird }]}>
                      {tpl.isActive
                        ? t('recurring.nextRun', { defaultValue: 'Next {{when}} · we ask you to pay from {{ask}}', when: fmtNext(tpl.nextRunAt), ask: fmtTime(askAt) })
                        : t('recurring.paused', { defaultValue: 'Paused' })}
                    </Text>
                    <Text style={[styles.cardMeta, { color: theme.textThird }]}>
                      {t('recurring.runsSoFar', { defaultValue: '{{count}} run created so far', defaultValue_plural: '{{count}} runs created so far', count: tpl.fireCount })}
                      {tpl.errorCount > 0 ? ` · ${tpl.errorCount} ${t('recurring.couldNotCreate', { defaultValue: 'could not be created' })}` : ''}
                    </Text>
                    {tpl.lastError && <Text style={styles.errorLine}>{tpl.lastError}</Text>}
                  </View>
                  <Switch value={tpl.isActive} onValueChange={() => toggle(tpl)} trackColor={{ false: theme.border, true: theme.primary }} thumbColor="#fff" />
                </View>
                <Pressable onPress={() => remove(tpl)} style={styles.deleteRow} hitSlop={6}>
                  <Trash2 size={13} color="#DC2626" strokeWidth={2} />
                  <Text style={styles.deleteText}>{t('recurring.deleteSchedule', { defaultValue: 'Delete schedule' })}</Text>
                </Pressable>
              </View>
            );
          })
        )}

        <Pressable style={[styles.addBtn, { borderColor: theme.primary }]} onPress={() => setShowCreate(true)}>
          <Plus size={16} color={theme.primary} strokeWidth={2} />
          <Text style={[styles.addBtnText, { color: theme.primary }]}>{t('recurring.newSchedule', { defaultValue: 'New schedule from a past delivery' })}</Text>
        </Pressable>
      </ScrollView>

      <CreateModal visible={showCreate} leadMin={leadMin} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
    </SafeAreaView>
  );
}

function CreateModal({ visible, leadMin, onClose, onCreated }: { visible: boolean; leadMin: number; onClose: () => void; onCreated: () => void }) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [recents,    setRecents]    = useState<any[]>([]);
  const [pickedId,   setPickedId]   = useState<string | null>(null);
  const [name,       setName]       = useState('');
  const [cadence,    setCadence]    = useState<Cadence>('weekly');
  const [dayOfWeek,  setDayOfWeek]  = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hour,       setHour]       = useState(9);
  const [minute,     setMinute]     = useState(0);
  const [hourText,   setHourText]   = useState('9');
  const [minuteText, setMinuteText] = useState('00');
  const [agreed,     setAgreed]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true); setError(null); setPickedId(null); setName(''); setAgreed(false);
    deliveriesApi.myDeliveries(1, 10)
      .then((res: any) => setRecents((res?.items ?? res ?? []).filter((d: any) => d?.pickupAddress && d?.dropoffAddress)))
      .catch((e: any) => setError(e?.message ?? 'Could not load past deliveries'))
      .finally(() => setLoading(false));
  }, [visible]);

  const source = recents.find(r => r.id === pickedId);
  const ready  = !!source && !!name.trim() && agreed && !saving;
  const askH = ((hour * 60 + minute - leadMin + 1440) % 1440) / 60 | 0;
  const askM = (hour * 60 + minute - leadMin + 1440) % 60;

  const submit = async () => {
    if (!ready || !source) return;
    setSaving(true); setError(null);
    try {
      // The customer booking, as the server's CreateDeliveryDto expects it.
      const payload = {
        kind:             'customer',
        pickupAddress:    source.pickupAddress,
        pickupLat:        Number(source.pickupLat),
        pickupLng:        Number(source.pickupLng),
        dropoffAddress:   source.dropoffAddress,
        dropoffLat:       Number(source.dropoffLat),
        dropoffLng:       Number(source.dropoffLng),
        packageCategory:  source.categoryCode ?? source.packageCategory ?? undefined,
        description:      source.packageDescription ?? source.description ?? undefined,
        weightKg:         Number(source.weightKg ?? 1) || 1,
        vehicleType:      source.vehicleType ?? 'motorcycle',
        packagePhotos:    Array.isArray(source.packagePhotos) ? source.packagePhotos : undefined,
        receiverFirstName: source.receiverFirstName ?? undefined,
        receiverLastName:  source.receiverLastName ?? undefined,
        receiverPhone:     source.receiverPhone ?? undefined,
        fallbackPref:      source.fallbackPref ?? undefined,
        declaredValueNgn:  source.declaredValueNgn ? Number(source.declaredValueNgn) : undefined,
        deliveryInstructions: source.deliveryInstructions ?? undefined,
      };
      await recurringApi.create({
        name: name.trim(), cadence,
        dayOfWeek:  cadence === 'weekly'  ? dayOfWeek  : undefined,
        dayOfMonth: cadence === 'monthly' ? dayOfMonth : undefined,
        hour, minute, payload, termsAccepted: true,
      });
      onCreated();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the schedule');
    } finally {
      setSaving(false);
    }
  };

  const Step = ({ n, title }: { n: number; title: string }) => (
    <View style={styles.stepHead}>
      <View style={[styles.stepNum, { backgroundColor: theme.primary }]}><Text style={styles.stepNumTxt}>{n}</Text></View>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{title}</Text>
    </View>
  );
  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={[styles.header, { paddingTop: 16, borderBottomColor: theme.border }]}>
          <Pressable onPress={onClose} hitSlop={8}><X size={22} color={theme.text} strokeWidth={2} /></Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{t('recurring.newTitle', { defaultValue: 'New schedule' })}</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
          {error && (
            <View style={styles.note}>
              <AlertCircle size={14} color="#DC2626" strokeWidth={2} />
              <Text style={[styles.noteText, { color: '#DC2626' }]}>{error}</Text>
            </View>
          )}

          <Step n={1} title={t('recurring.step1', { defaultValue: 'Pick a past delivery to repeat' })} />
          {loading ? <ActivityIndicator color={theme.primary} /> : recents.length === 0 ? (
            <Text style={{ color: theme.textSecond, paddingVertical: 12, lineHeight: 19 }}>
              {t('recurring.noPast', { defaultValue: 'No past deliveries yet. Send one first, then come back here.' })}
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {recents.slice(0, 10).map(d => {
                const on = d.id === pickedId;
                return (
                  <Pressable key={d.id} onPress={() => { setPickedId(d.id); if (!name) setName(`${t('recurring.repeatPrefix', { defaultValue: 'Repeat' })}: ${d.dropoffAddress}`); }}
                    style={[styles.pickCard, { backgroundColor: on ? theme.primary + '12' : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>{d.dropoffAddress}</Text>
                      <Text style={{ color: theme.textSecond, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                        {t('recurring.fromAddress', { defaultValue: 'from {{address}}', address: d.pickupAddress })}{d.distanceKm ? ` · ${Number(d.distanceKm).toFixed(1)} km` : ''}
                      </Text>
                    </View>
                    <View style={[styles.radio, { borderColor: on ? theme.primary : theme.textThird, backgroundColor: on ? theme.primary : 'transparent' }]} />
                  </Pressable>
                );
              })}
            </View>
          )}

          <Step n={2} title={t('recurring.step2', { defaultValue: 'Name it' })} />
          <TextInput value={name} onChangeText={setName} placeholder={t('recurring.namePlaceholder', { defaultValue: 'Friday parcel to Mum' })} placeholderTextColor={theme.textThird} style={inputStyle} />

          <Step n={3} title={t('recurring.step3', { defaultValue: 'How often' })} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['daily', 'weekly', 'monthly'] as Cadence[]).map(c => {
              const on = cadence === c;
              const label = c === 'daily' ? t('recurring.daily', { defaultValue: 'Every day' }) : c === 'weekly' ? t('recurring.weekly', { defaultValue: 'Every week' }) : t('recurring.monthly', { defaultValue: 'Every month' });
              return (
                <Pressable key={c} onPress={() => setCadence(c)} style={[styles.cadenceChip, { backgroundColor: on ? theme.primary : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
                  <Text style={{ color: on ? '#fff' : theme.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {cadence === 'weekly' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {DOW_SHORT.map((label, i) => {
                const on = dayOfWeek === i;
                return (
                  <Pressable key={i} onPress={() => setDayOfWeek(i)} style={[styles.dayChip, { backgroundColor: on ? theme.primary : theme.surface, borderColor: on ? theme.primary : theme.border }]}>
                    <Text style={{ color: on ? '#fff' : theme.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {cadence === 'monthly' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <Text style={{ color: theme.textSecond, fontSize: 13 }}>{t('recurring.dayOfMonth', { defaultValue: 'Day of the month (1 to 28)' })}</Text>
              <TextInput value={String(dayOfMonth)} onChangeText={v => setDayOfMonth(Math.max(1, Math.min(28, Number(v) || 1)))} keyboardType="number-pad" maxLength={2} style={[inputStyle, { width: 64, textAlign: 'center' }]} />
            </View>
          )}

          <Step n={4} title={t('recurring.step4', { defaultValue: 'Pickup time' })} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {/* Raw text while typing, parsed on blur: a padded "00" under a
                two-character limit swallowed the second digit (2026-09-06). */}
            <TextInput value={hourText} onChangeText={v => { const r = v.replace(/\D/g, '').slice(0, 2); setHourText(r); setHour(Math.max(0, Math.min(23, Number(r) || 0))); }}
              onBlur={() => setHourText(String(hour))}
              keyboardType="number-pad" maxLength={2} selectTextOnFocus style={[inputStyle, { width: 70, textAlign: 'center' }]} />
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 18 }}>:</Text>
            <TextInput value={minuteText} onChangeText={v => { const r = v.replace(/\D/g, '').slice(0, 2); setMinuteText(r); setMinute(Math.max(0, Math.min(59, Number(r) || 0))); }}
              onBlur={() => setMinuteText(pad(minute))}
              keyboardType="number-pad" maxLength={2} selectTextOnFocus style={[inputStyle, { width: 70, textAlign: 'center' }]} />
            <Text style={{ color: theme.textSecond, fontSize: 13 }}>{t('recurring.twentyFourHour', { defaultValue: '24-hour' })}</Text>
          </View>
          <Text style={{ color: theme.textSecond, fontSize: 13, lineHeight: 18, marginTop: -6 }}>
            {t('recurring.askFrom', { defaultValue: 'We create the run and ask you to pay from {{time}}, at that day\'s price.', time: `${pad(askH)}:${pad(askM)}` })}
          </Text>

          {/* The same terms line the pay screen carries. */}
          <Pressable onPress={() => setAgreed(a => !a)} style={[styles.agree, { borderColor: agreed ? theme.primary : theme.border, backgroundColor: theme.surface }]}>
            <View style={[styles.checkbox, { borderColor: agreed ? theme.primary : theme.textThird, backgroundColor: agreed ? theme.primary : 'transparent' }]}>
              {agreed && <Check size={14} color="#fff" strokeWidth={2.5} />}
            </View>
            <Text style={[styles.agreeText, { color: theme.text }]}>
              {t('recurring.terms', { defaultValue: 'I agree to the SEIRS Terms of Service. Each run is priced on the day and I pay it before pickup.' })}{' '}
              <Text onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} style={{ color: theme.primary, fontWeight: '600' }}>{t('recurring.readTerms', { defaultValue: 'Read them' })}</Text>
            </Text>
          </Pressable>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.surface, paddingBottom: bottomFloor(insets.bottom) }]}>
          <Pressable disabled={!ready} onPress={submit} style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: ready ? 1 : 0.5 }]}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Check size={16} color="#fff" strokeWidth={2.5} />
                <Text style={styles.submitText}>{t('recurring.save', { defaultValue: 'Save schedule' })}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, paddingTop: 8, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  content:     { padding: 16, gap: 16 },

  hero:      { borderRadius: 16, padding: 20, gap: 8, alignItems: 'flex-start' },
  heroIcon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  heroSub:   { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 20 },

  empty:      { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySub:   { fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 19 },

  note:     { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, borderRadius: 10 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 17 },

  card:      { borderRadius: Radius.md, padding: 14, borderWidth: 1, gap: 10 },
  cardRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardName:  { fontSize: 15, fontWeight: '700' },
  cardMeta:  { fontSize: 12, marginTop: 2, lineHeight: 16 },
  errorLine: { fontSize: 12, color: '#DC2626', marginTop: 2 },
  deleteRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  deleteText: { fontSize: 12, color: '#DC2626', fontWeight: '600' },

  addBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed' },
  addBtnText: { fontSize: 15, fontWeight: '700' },

  stepHead:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 },
  stepNum:    { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNumTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fieldLabel: { fontSize: 14, fontWeight: '700' },
  input:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },

  pickCard:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 12, borderWidth: 1.5 },
  radio:       { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  cadenceChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  dayChip:     { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },

  agree:     { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 1.5, borderRadius: 12, padding: 12 },
  checkbox:  { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  agreeText: { flex: 1, fontSize: 13, lineHeight: 19 },

  footer:     { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12 },
  submitBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
