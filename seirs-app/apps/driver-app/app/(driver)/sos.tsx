import {
  View, Text, Pressable, StyleSheet, StatusBar, Alert, Linking, ScrollView,
  Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { sosApi, apiRequest } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

// Spec V8: driver-side SOS. Mirrors customer SOS using the same
// /sos/trigger backend endpoint. Optional ?deliveryId= when fired
// from an active trip so ops can correlate with the customer's
// in-progress order. Driver-tailored copy: emphasises vehicle
// breakdown / road incident / personal-safety as common triggers.

/**
 * One row of the emergency directory, served from
 * GET /config/emergency-contacts so a wrong number can be corrected
 * without an app release and a store review.
 */
type EmergencyContact = {
  id:          string;
  name:        string;
  numbers:     string[];
  instruction: string;
  category?:   string;
  sortOrder?:  number;
};

/**
 * The hardcoded list this replaces was WRONG (fixed 2026-08-31).
 *
 * It read:
 *   Police    199
 *   Ambulance 112
 *
 * 199 is the fire service and 112 is the national emergency line, which
 * covers all services rather than ambulances specifically. So a rider
 * broken down at night who tapped "Police" reached the fire service,
 * believing they had reached the police. The customer app had already
 * been corrected and says so plainly in its own source; only this screen
 * still carried the old list.
 *
 * There is no "Police" entry pointing at one national number because
 * there is not one: police response runs through 112 or through a state
 * command line that differs by state. Admin can add those.
 *
 * Offline fallback ONLY. Both numbers are correct and enough to dial.
 * Do not grow this list, grow the admin one.
 */
const FALLBACK_CONTACTS = (): EmergencyContact[] => [
  {
    id:          'fallback-112',
    name:        'Emergency (all services)',
    numbers:     ['112'],
    instruction: tx9('auto.sos.theNationalEmergencyLineDial', 'The national emergency line. Dial this first if you are hurt, threatened, or unsure who you need.'),
    category:    'national',
  },
  {
    id:          'fallback-199',
    name:        'Fire Service',
    numbers:     ['199'],
    instruction: tx9('auto.sos.fireOrAVehicleBurning', 'Fire, or a vehicle burning. For anything else use 112.'),
    category:    'fire',
  },
];

/**
 * Category to icon. An unknown category gets a plain phone glyph rather
 * than a guess, because an icon implying the wrong service is the same
 * bug as a wrong number.
 */
const CATEGORY_ICON: Record<string, string> = {
  emergency: 'alert-circle-outline',
  national:  'alert-circle-outline',
  police:    'shield-outline',
  fire:      'flame-outline',
  medical:   'medkit-outline',
  ambulance: 'medkit-outline',
  road:      'car-outline',
  traffic:   'car-outline',
  women:     'people-outline',
  child:     'people-outline',
};

export default function DriverSosScreen() {
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  const router  = useRouter();
  const cs      = useColorScheme();
  const isDark  = cs === 'dark';
  const params  = useLocalSearchParams<{ deliveryId?: string }>();

  const [activated,  setActivated]  = useState(false);
  const [countdown,  setCountdown]  = useState(5);
  const [alertId,    setAlertId]    = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * The directory, loaded on mount rather than when SOS fires: the
   * intent is that a rider dials help directly WHILE SEIRS responds, so
   * the numbers must already be on screen when the alarm goes off.
   */
  const [contacts, setContacts] = useState<EmergencyContact[]>(FALLBACK_CONTACTS());
  const [contactsOffline, setContactsOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ items?: EmergencyContact[] }>('GET', '/config/emergency-contacts')
      .then((res) => {
        if (cancelled) return;
        const items = (res?.items ?? [])
          .filter(c => c && Array.isArray(c.numbers) && c.numbers.length > 0)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        setContactsOffline(false);
        // An empty directory is one nobody has filled in, not a failure
        // to reach one.
        setContacts(items.length ? items : FALLBACK_CONTACTS());
      })
      .catch((e: any) => {
        if (cancelled) return;
        /**
         * A 404 is not an outage. If the endpoint is simply absent the
         * two national numbers are correct and sufficient, so they are
         * presented plainly. A red warning on the emergency screen
         * should only appear when it is TRUE, or it trains a frightened
         * rider to ignore the one banner that must always mean
         * something.
         */
        const status = Number(e?.status ?? e?.response?.status ?? 0);
        setContactsOffline(status !== 404);
        setContacts(FALLBACK_CONTACTS());
      });
    return () => { cancelled = true; };
  }, []);

  // "What is happening?" state. The alert is ALREADY sent by the time any
  // of this renders: an SOS must never become a form, so detail is a
  // second, skippable step on an alert that has gone out (founder
  // 2026-08-24: "the driver can't leave a quick message to know the
  // issue"). Alert.prompt is iOS-only and does nothing at all on Android,
  // so this is a real Modal, same as the receiver-name prompt in active.tsx.
  const [noteOpen,   setNoteOpen]   = useState(false);
  const [noteText,   setNoteText]   = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSent,   setNoteSent]   = useState(false);
  // Guards the one-time auto-open. Without it the modal reopens on every
  // countdown tick and traps the driver in it.
  const notePrompted = useRef(false);

  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse1, { toValue: 1.4, duration: 1000, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulse1, { toValue: 1,   duration: 1000, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      ]),
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(pulse2, { toValue: 1.7, duration: 1000, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulse2, { toValue: 1,   duration: 1000, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      ]),
    );
    loop.start(); loop2.start();
    return () => { loop.stop(); loop2.stop(); };
  }, [pulse1, pulse2]);

  useEffect(() => {
    if (!activated || countdown === 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [activated, countdown]);

  /**
   * Ask what is happening only once the 5s undo window has closed. Popping
   * it immediately would cover the Cancel SOS button, which is the one
   * control a mistaken press needs.
   */
  useEffect(() => {
    if (!alertId || countdown > 0 || notePrompted.current) return;
    notePrompted.current = true;
    setNoteOpen(true);
  }, [alertId, countdown]);

  const submitNote = async () => {
    const clean = noteText.trim();
    if (!clean || !alertId) return;
    setNoteSaving(true);
    try {
      await sosApi.addNote(alertId, clean);
      setNoteSent(true);
      setNoteOpen(false);
    } catch (e: any) {
      // Stay open so the text is not lost: ops already has the alert and
      // the location, this is only the detail failing to attach.
      alertDialog('Could not send that detail',
        e?.message ?? 'Ops already has your alert and your location. Try again, or call 199.');
    } finally {
      setNoteSaving(false);
    }
  };

  const fireSOS = async () => {
    setSubmitting(true);
    setActivated(true);
    setCountdown(5);

    let lat: number | undefined;
    let lng: number | undefined;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
    } catch { /* keep undefined */ }

    try {
      // No placeholder note. The note field now carries what the driver
      // actually typed after the alert went out, and "Driver SOS" told the
      // ops desk nothing the role badge did not already say.
      const created = await sosApi.trigger({
        deliveryId: params.deliveryId,
        lat, lng,
      });
      setAlertId(created.id);
    } catch (e: any) {
      alertDialog('Could not reach SEIRS support',
        e?.message ?? 'Network error. Try again or call 199 directly.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSOS = () => {
    // The one dialog on the app a rider may be reading one-handed, in the
    // dark, in trouble. A full-width row beats a 40px uppercase word in a
    // corner (2026-08-25 dialog sweep).
    setSheet({
      title: tr('auto.sos.sendSos', 'Send SOS?'),
      message: tr('auto.sos.thisAlertsSeirsOpsAnd', 'This alerts SEIRS ops and shares your live location with them. Nobody else is told.'),
      options: [{
        label: tr('auto.sos.sendSosNow', 'Send SOS now'),
        sub: tr('auto.sos.opsAreAlertedImmediately', 'Ops are alerted immediately'),
        variant: 'destructive',
        icon: 'warning-outline',
        onPress: fireSOS,
      }],
      cancelLabel: tr('auto.sos.notNow', 'Not now'),
    });
  };

  const cancelSOS = () => {
    if (alertId) sosApi.cancel(alertId).catch(() => {});
    setActivated(false);
    setCountdown(5);
    setAlertId(null);
    setNoteOpen(false);
    setNoteText('');
    setNoteSent(false);
    notePrompted.current = false;
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0A0000' : '#7F1D1D' }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>

        <View style={styles.header}>
          <Pressable style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>{tx('auto.sos.sosEmergency', 'SOS Emergency')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Scrolls rather than clipping. The active state now carries the
            note echo and the "tell ops what is happening" button, and on a
            short screen that pushed Quick Dial off the bottom with no way
            to reach it. Customer SOS already scrolls for the same reason. */}
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          <View style={styles.sosWrap}>
            <Animated.View style={[styles.ring2, { transform: [{ scale: pulse2 }] }]} />
            <Animated.View style={[styles.ring1, { transform: [{ scale: pulse1 }] }]} />
            <Pressable style={styles.sosBtn} onPress={handleSOS} disabled={activated || submitting}>
              <Ionicons name="warning" size={44} color="#fff" />
              <Text style={styles.sosBtnText}>SOS</Text>
              {activated && countdown > 0 && (
                <Text style={styles.sosCountdown}>{countdown}</Text>
              )}
            </Pressable>
          </View>

          {activated ? (
            <View style={styles.activeState}>
              {/* D-6.6: fireSOS POSTs immediately, so ops is already alerted
                  by the time this renders. The old "SOS in Ns" read like a
                  countdown before sending. Cancel is a real un-send, so the
                  mechanism is fine: only the wording was lying. */}
              <Text style={styles.activeTitle}>
                {countdown > 0 ? tx9('auto.sos.sosSent', 'SOS sent') : tx9('auto.sos.sosActivated', 'SOS Activated!')}
              </Text>
              <Text style={styles.activeDesc}>
                {countdown > 0
                  ? tx9('auto.sos.opsHasBeenAlertedAnd', 'Ops has been alerted and your location is being shared. Cancel within {{countdown}}s if this was a mistake.', { countdown })
                  : tx9('auto.sos.helpIsOnTheWay', 'Help is on the way. Stay safe.')}
              </Text>
              {countdown > 0 && (
                <Pressable style={styles.cancelBtn} onPress={cancelSOS}>
                  <Text style={styles.cancelBtnText}>{tx('auto.sos.cancelSos', 'Cancel SOS')}</Text>
                </Pressable>
              )}

              {/* Stays available after the modal is skipped or answered:
                  what is happening can change while help is on its way. */}
              {!!alertId && countdown === 0 && (
                <>
                  {noteSent && (
                    <Text style={styles.noteSentLine} numberOfLines={3}>
                      {tr('auto.sos.opsCanSee', 'Ops can see: “')}{noteText.trim()}”
                    </Text>
                  )}
                  <Pressable style={styles.detailBtn} onPress={() => setNoteOpen(true)}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color="#7F1D1D" />
                    <Text style={styles.detailBtnText}>
                      {noteSent ? tx9('auto.sos.updateWhatIsHappening', 'Update what is happening') : tx9('auto.sos.tellOpsWhatIsHappening', 'Tell ops what is happening')}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <View style={styles.idleState}>
              <Text style={styles.idleTitle}>{tr('auto.sos.vehicleTroubleAccidentPersonalSafety', 'Vehicle trouble · Accident · Personal safety')}</Text>
              <Text style={styles.idleDesc}>
                {tr('auto.sos.oneTapSharesYourLive', 'One tap shares your live location with SEIRS ops. Use this for real emergencies only.')}
              </Text>
            </View>
          )}

          <View style={styles.emergencySection}>
            <Text style={styles.emergencySectionTitle}>{tx('auto.sos.quickDial', 'Quick Dial')}</Text>
            {contactsOffline && (
              <Text style={styles.emergencyOffline}>
                {tr('auto.sos.couldNotLoadTheFull', 'Could not load the full directory. These national numbers still work.')}
              </Text>
            )}
            <View style={styles.emergencyRow}>
              {contacts.map(ec => {
                // First number is the one the button dials; the rest are
                // alternates an admin listed, shown so a rider can try them.
                const dial = ec.numbers[0];
                const alt  = ec.numbers.slice(1);
                return (
                  <Pressable
                    key={ec.id}
                    style={styles.emergencyCard}
                    onPress={() => Linking.openURL(`tel:${dial}`).catch(() => {})}
                  >
                    <View style={styles.emergencyIcon}>
                      <Ionicons
                        name={(CATEGORY_ICON[String(ec.category ?? '')] ?? 'call-outline') as any}
                        size={22}
                        color="#EF4444"
                      />
                    </View>
                    <Text style={styles.emergencyLabel} numberOfLines={2}>{ec.name}</Text>
                    <Text style={styles.emergencyNum}>{dial}</Text>
                    {alt.length > 0 && (
                      <Text style={styles.emergencyAlt} numberOfLines={1}>or {alt.join(', ')}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

        </ScrollView>

        {/*
          What is happening? Asked AFTER the alert is already on the ops desk,
          never before: the button is the alarm, this is only detail.

          Alert.prompt is iOS-only and fails silently on Android (the founder
          is on a Samsung A30), so this is a real Modal with a TextInput, the
          same fix active.tsx uses for the receiver-name prompt.

          Colours are pinned to the SOS palette rather than the theme: this
          screen is deep red with white text in BOTH themes, and a theme
          surface here would put near-white text on a near-white card in
          light mode, which is the defect that made the screen unreadable
          once already.
        */}
        <Modal
          visible={noteOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setNoteOpen(false)}
        >
          <KeyboardAvoidingView
            style={styles.noteBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>{tx('auto.sos.whatIsHappening', 'What is happening?')}</Text>
              <Text style={styles.noteSub}>
                {tr('auto.sos.supportIsAlreadyAlertedAnd', 'Support is already alerted and your location is being shared. This is optional: it just tells them what they are coming into.')}
              </Text>
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder={tx('auto.sos.eGPassengerIsThreatening', 'e.g. Passenger is threatening me, I am parked at the filling station')}
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={styles.noteInput}
                multiline
                maxLength={500}
                autoFocus
                editable={!noteSaving}
              />
              <View style={styles.noteActions}>
                <Pressable
                  style={styles.noteSkipBtn}
                  onPress={() => setNoteOpen(false)}
                  disabled={noteSaving}
                >
                  <Text style={styles.noteSkipText}>{tr('auto.sos.skip', 'Skip')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.noteSendBtn, (!noteText.trim() || noteSaving) && styles.noteSendBtnOff]}
                  onPress={submitNote}
                  disabled={!noteText.trim() || noteSaving}
                >
                  {noteSaving
                    ? <ActivityIndicator size="small" color="#7F1D1D" />
                    : <Text style={styles.noteSendText}>{tx('auto.sos.sendToOps', 'Send to ops')}</Text>}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },

  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },

  sosWrap: { alignItems: 'center', justifyContent: 'center', width: 220, height: 220 },
  ring2:   { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(239,68,68,0.08)' },
  ring1:   { position: 'absolute', width: 180, height: 180, borderRadius: 90,  backgroundColor: 'rgba(239,68,68,0.15)' },
  sosBtn:  { width: 140, height: 140, borderRadius: 70, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', gap: 4,
             shadowColor: '#EF4444', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 16 },
  sosBtnText:  { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.bold, letterSpacing: 2 },
  sosCountdown:{ color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm },

  activeState:  { alignItems: 'center', gap: Spacing.sm },
  activeTitle:  { color: '#EF4444', fontSize: FontSize.lg, fontWeight: FontWeight.bold, textAlign: 'center' },
  activeDesc:   { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  cancelBtn:    { paddingHorizontal: Spacing.lg, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: Spacing.sm },
  cancelBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  idleState:  { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  idleTitle:  { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold, textAlign: 'center' },
  idleDesc:   { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },

  // "Tell ops what is happening" entry point + the modal. Light chip on the
  // deep red ground so it reads in both themes.
  detailBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.lg, paddingVertical: 10, borderRadius: Radius.full, backgroundColor: '#FFE4E4', marginTop: Spacing.sm },
  detailBtnText: { color: '#7F1D1D', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  noteSentLine:  { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm, textAlign: 'center', fontStyle: 'italic', lineHeight: 19, paddingHorizontal: Spacing.sm },

  noteBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  noteCard:     { width: '100%', maxWidth: 380, borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm, backgroundColor: '#3B0A0A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  noteTitle:    { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  noteSub:      { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm, lineHeight: 19 },
  noteInput:    { minHeight: 88, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.10)',
                  borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: FontSize.base,
                  textAlignVertical: 'top', marginTop: 4 },
  noteActions:  { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  noteSkipBtn:  { paddingVertical: 10, paddingHorizontal: 16 },
  noteSkipText: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  noteSendBtn:  { paddingVertical: 10, paddingHorizontal: 18, borderRadius: Radius.md, backgroundColor: '#FFE4E4', minWidth: 120, alignItems: 'center' },
  noteSendBtnOff: { opacity: 0.45 },
  noteSendText: { color: '#7F1D1D', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  emergencySection:     { width: '100%', gap: Spacing.sm },
  emergencySectionTitle:{ color: 'rgba(255,255,255,0.65)', fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  emergencyRow:         { flexDirection: 'row', gap: Spacing.sm },
  emergencyCard:        { flex: 1, alignItems: 'center', gap: 6, padding: Spacing.md, borderRadius: Radius.xl, backgroundColor: 'rgba(255,255,255,0.08)' },
  emergencyIcon:        { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(239,68,68,0.15)', justifyContent: 'center', alignItems: 'center' },
  emergencyLabel:       { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  emergencyNum:         { color: '#EF4444', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  emergencyAlt:         { color: 'rgba(255,255,255,0.5)', fontSize: 10, textAlign: 'center' },
  emergencyOffline:     { color: '#FCA5A5', fontSize: FontSize.xs, lineHeight: 16 },
});
