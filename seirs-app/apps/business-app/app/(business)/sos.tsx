/**
 * Business SOS (founder 2026-08-23: "we don't know who may need it...
 * if they feel unsafe and they have the SEIRS app they should be able
 * to press it"). Same backend as customer/driver SOS: GPS + account
 * land on the admin desk; misuse is an account offence, but a real
 * emergency never meets a cooldown.
 */
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, StatusBar, Alert, Linking, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Icon, type IconName } from '@/components/Icon';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { sosApi } from '@/services/api';
import type { EmergencyContactDTO } from '@seirs/shared/services/api';

import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
/** Which glyph a directory entry gets, from the category an admin set. */
const CATEGORY_ICON: Record<string, IconName> = {
  emergency: 'AlertCircle',
  national:  'AlertCircle',
  police:    'Shield',
  fire:      'Flame',
  medical:   'AlertCircle',
  ambulance: 'AlertCircle',
  road:      'Car',
  traffic:   'Car',
};

/**
 * Dialled when the network is gone. Deliberately the national lines only:
 * a wrong number here is worse than a short list.
 */
const FALLBACK_CONTACTS: EmergencyContactDTO[] = [
  { id: 'fallback-112', name: 'Emergency (all services)', numbers: ['112'],
    instruction: 'The national emergency line. Dial this first if you are hurt or in danger.' },
  { id: 'fallback-199', name: 'Fire Service', numbers: ['199'],
    instruction: 'Fire, or a vehicle burning. For anything else use 112.' },
];

export default function BusinessSosScreen() {
  const router     = useRouter();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];

  const [firing,    setFiring]    = useState(false);
  const [alertId,   setAlertId]   = useState<string | null>(null);

  /**
   * The five second window, brought over from customer and driver.
   *
   * Business fired instantly and offered a "false alarm" only AFTER the
   * alert had already landed on the ops desk. The other two show a visible
   * countdown first, so a misfire can be taken back before anyone is
   * troubled by it. Same API underneath: the alert really is sent, and
   * cancel really does withdraw it. What the countdown adds is the person
   * KNOWING they still can (founder 2026-09-01).
   */
  const [countdown, setCountdown] = useState(5);

  // The two breathing rings behind the button, ported from driver.
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;

  /** The dialled-from directory, served by the backend and admin-editable. */
  const [contacts, setContacts] = useState<EmergencyContactDTO[]>(FALLBACK_CONTACTS);

  // "What is happening?" state. Asked only AFTER the alert has gone out:
  // an SOS must never become a form, so the button is the alarm and the
  // detail is a separate, skippable step (founder 2026-08-24). Backed by
  // PATCH /sos/:id/note. Alert.prompt is iOS-only and does nothing at all
  // on Android, so this is a real Modal with a TextInput, the same fix the
  // driver app uses for its receiver-name prompt.
  const [noteOpen,   setNoteOpen]   = useState(false);
  const [noteText,   setNoteText]   = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSent,   setNoteSent]   = useState(false);

  /**
   * Load the directory BEFORE anything happens, never after the button is
   * pressed: the founder's intent is that a person dials help themselves
   * while SEIRS also responds, so the numbers have to be on screen already.
   *
   * Business used to hardcode 112 and 767, which meant changing an
   * emergency number needed an app release, and it was missing 199 (fire)
   * and 122 (road safety) that the server already serves. The fallback
   * stays because this screen must work with no network at all.
   */
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse1, { toValue: 1.4, duration: 1000, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(pulse1, { toValue: 1,   duration: 1000, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
    ]));
    const loop2 = Animated.loop(Animated.sequence([
      Animated.delay(400),
      Animated.timing(pulse2, { toValue: 1.7, duration: 1000, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(pulse2, { toValue: 1,   duration: 1000, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
    ]));
    loop.start(); loop2.start();
    return () => { loop.stop(); loop2.stop(); };
  }, [pulse1, pulse2]);

  useEffect(() => {
    let dead = false;
    sosApi.emergencyContacts()
      .then((res) => {
        if (dead) return;
        const items = (res?.items ?? [])
          .filter(c => c && Array.isArray(c.numbers) && c.numbers.length > 0)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        if (items.length) setContacts(items);
      })
      .catch(() => { /* keep the fallback; never shout on this screen */ });
    return () => { dead = true; };
  }, []);

  // Tick the window down once the alert is away.
  useEffect(() => {
    if (!alertId || countdown === 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [alertId, countdown]);

  const fire = async () => {
    setFiring(true);
    try {
      let lat: number | undefined, lng: number | undefined;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          lat = pos.coords.latitude; lng = pos.coords.longitude;
        }
      } catch { /* alert still fires without GPS */ }
      // No placeholder note. The note field now carries what the person
      // actually typed after the alert went out, and "Business app SOS"
      // told the ops desk nothing the role badge did not already say.
      const created = await sosApi.trigger({ lat, lng });
      setCountdown(5);
      setAlertId(created?.id ?? null);
      // Ask what is happening the moment it is sent. Unlike driver and
      // customer there is no timed undo window to protect here: the false
      // alarm button below is untimed and is one Skip away.
      if (created?.id) setNoteOpen(true);
    } catch (e: any) {
      alertDialog('Could not send the alert', e?.message ?? 'Call 112 directly if you are in danger.');
    } finally {
      setFiring(false);
    }
  };

  const confirmFire = () => {
    alertDialog(
      'Send SOS alert?',
      'SEIRS support is alerted immediately with your location and account. False alarms can be cancelled in the next moments.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'SEND SOS', style: 'destructive', onPress: fire },
      ],
    );
  };

  const falseAlarm = () => {
    if (!alertId) return;
    sosApi.cancel(alertId).catch(() => {});
    setAlertId(null);
    setCountdown(5);
    setNoteOpen(false);
    setNoteText('');
    setNoteSent(false);
    alertDialog('Cancelled', 'The alert was withdrawn as a false alarm.');
  };

  const submitNote = async () => {
    const clean = noteText.trim();
    if (!clean || !alertId) return;
    setNoteSaving(true);
    try {
      await sosApi.addNote(alertId, clean);
      setNoteSent(true);
      setNoteOpen(false);
    } catch (e: any) {
      // Stay open so the typed text is not lost. Support already has the
      // alert and the location: only the detail failed to attach.
      alertDialog('Could not send that detail',
        e?.message ?? 'Support already has your alert and your location. Try again, or call 112.');
    } finally {
      setNoteSaving(false);
    }
  };

  return (
    /* Near-black in dark mode, deep red in light: driver's treatment, which
       the founder picked as the best of the three. Business flooded the whole
       screen #7F1D1D in BOTH themes, so on a dark phone it was a wall of red
       with nothing for the button to stand against (founder 2026-09-01). */
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0A0000' : '#7F1D1D' }} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Icon name="ArrowLeft" size={20} color="#fff" />
        </Pressable>
        <Text style={styles.title}>{tx('auto.sos.sosEmergency', 'SOS Emergency')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Scrolls rather than clipping. The active state now carries the note
          echo and the "tell support what is happening" button, and on a short
          screen that pushed the national emergency numbers off the bottom
          with no way to reach them. */}
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.sosWrap}>
          <Animated.View style={[styles.ring2, { transform: [{ scale: pulse2 }] }]} />
          <Animated.View style={[styles.ring1, { transform: [{ scale: pulse1 }] }]} />
          <Pressable style={styles.sosBtn} onPress={confirmFire} disabled={firing || !!alertId}>
            {firing ? <ActivityIndicator color="#fff" size="large" /> : (
              <>
                <Icon name="AlertTriangle" size={44} color="#fff" />
                <Text style={styles.sosBtnText}>SOS</Text>
                {!!alertId && countdown > 0 && (
                  <Text style={styles.sosCountdown}>{countdown}</Text>
                )}
              </>
            )}
          </Pressable>
        </View>

        {!alertId ? (
          <View style={styles.idleState}>
            <Text style={styles.idleTitle}>Theft · Accident · Personal safety</Text>
            <Text style={styles.idleDesc}>
              One tap shares your live location with SEIRS support. Use this
              for real emergencies only.
            </Text>
          </View>
        ) : (
          <View style={styles.idleState}>
            <Text style={styles.sentTitle}>
              {countdown > 0 ? 'SOS sent' : 'SOS Activated!'}
            </Text>
            <Text style={styles.idleDesc}>
              {countdown > 0
                ? `Support has been alerted and your location is being shared. Cancel within ${countdown}s if this was a mistake.`
                : 'Help is on the way. Keep your phone with you.'}
            </Text>

            {/* Stays available after the modal is answered or skipped: what
                is happening can change while help is on its way. */}
            {noteSent && (
              <Text style={styles.noteSentLine} numberOfLines={3}>
                Support can see: “{noteText.trim()}”
              </Text>
            )}
            <Pressable style={styles.detailBtn} onPress={() => setNoteOpen(true)}>
              <Icon name="MessageSquare" size={16} color="#7F1D1D" />
              <Text style={styles.detailBtnText}>
                {noteSent ? 'Update what is happening' : 'Tell support what is happening'}
              </Text>
            </Pressable>

            <Pressable style={styles.cancelBtn} onPress={falseAlarm}>
              <Text style={styles.cancelBtnText}>
                {countdown > 0 ? 'Cancel SOS' : 'False alarm: cancel the alert'}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.emergencySection}>
          <Text style={styles.emergencySectionTitle}>{tx('auto.sos.quickDial', 'Quick Dial')}</Text>
          <View style={styles.emergencyRow}>
            {contacts.map(c => {
              const dial = c.numbers[0];
              const alt  = c.numbers.slice(1);
              return (
                <Pressable
                  key={c.id}
                  style={styles.emergencyCard}
                  onPress={() => Linking.openURL('tel:' + dial.replace(/[^0-9+*#]/g, '')).catch(() => {})}
                  accessibilityRole="button"
                  accessibilityLabel={'Call ' + c.name + ' on ' + dial}
                >
                  <View style={styles.emergencyIcon}>
                    <Icon name={CATEGORY_ICON[String(c.category ?? '')] ?? 'Phone'} size={22} color="#EF4444" />
                  </View>
                  <Text style={styles.emergencyLabel} numberOfLines={2}>{c.name}</Text>
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

        Alert.prompt is iOS-only and fails silently on Android, so this is a
        real Modal with a TextInput.

        Colours are pinned to the SOS palette rather than the theme: this
        screen is deep red with white text in BOTH themes, and a theme
        surface here would put near-white text on a near-white card in light
        mode.
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
              Support is already alerted and your location is being shared.
              This is optional: it only tells them what they are coming into.
            </Text>
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder={tx('auto.sos.eGTwoMenAre', 'e.g. Two men are trying to force the shop door')}
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
                <Text style={styles.noteSkipText}>Skip</Text>
              </Pressable>
              <Pressable
                style={[styles.noteSendBtn, (!noteText.trim() || noteSaving) && styles.noteSendBtnOff]}
                onPress={submitNote}
                disabled={!noteText.trim() || noteSaving}
              >
                {noteSaving
                  ? <ActivityIndicator size="small" color="#7F1D1D" />
                  : <Text style={styles.noteSendText}>{tx('auto.sos.sendToSupport', 'Send to support')}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  title:   { color: '#fff', fontSize: 17, fontWeight: '700' },

  body:    { flexGrow: 1, alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  sosBtn:  { width: 140, height: 140, borderRadius: 70, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', gap: 4,
             shadowColor: '#EF4444', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 16 },
  sosBtnText: { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, letterSpacing: 2 },
  sentTitle:  { color: '#fff', fontSize: 20, fontWeight: '800' },
  hint:    { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
  cancelBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // "Tell support what is happening" entry point + the modal. Light chip on
  // the deep red ground so it reads in both themes.
  detailBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFE4E4', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
  detailBtnText: { color: '#7F1D1D', fontWeight: '700', fontSize: 14 },
  noteSentLine:  { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19, fontStyle: 'italic', textAlign: 'center' },

  noteBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  noteCard:     { width: '100%', maxWidth: 380, borderRadius: 16, padding: 20, gap: 10, backgroundColor: '#3B0A0A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  noteTitle:    { color: '#fff', fontSize: 18, fontWeight: '800' },
  noteSub:      { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },
  noteInput:    { minHeight: 88, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.10)',
                  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 15,
                  textAlignVertical: 'top', marginTop: 4 },
  noteActions:  { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 4 },
  noteSkipBtn:  { paddingVertical: 10, paddingHorizontal: 16 },
  noteSkipText: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '600' },
  noteSendBtn:  { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#FFE4E4', minWidth: 130, alignItems: 'center' },
  noteSendBtnOff: { opacity: 0.45 },
  noteSendText: { color: '#7F1D1D', fontSize: 15, fontWeight: '800' },

  numbersCard: { marginTop: 'auto', marginBottom: 24, width: '100%', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, padding: 16, gap: 10 },
  sosWrap: { alignItems: 'center', justifyContent: 'center', width: 220, height: 220 },
  ring2:   { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(239,68,68,0.08)' },
  ring1:   { position: 'absolute', width: 180, height: 180, borderRadius: 90,  backgroundColor: 'rgba(239,68,68,0.15)' },
  sosCountdown:{ color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm },
  idleState:  { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  idleTitle:  { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold as any, textAlign: 'center' },
  idleDesc:   { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  emergencySection:     { width: '100%', gap: Spacing.sm },
  emergencySectionTitle:{ color: 'rgba(255,255,255,0.65)', fontSize: FontSize.xs, fontWeight: FontWeight.semibold as any, textTransform: 'uppercase', letterSpacing: 0.5 },
  emergencyRow:         { flexDirection: 'row', gap: Spacing.sm },
  emergencyCard:        { flex: 1, alignItems: 'center', gap: 6, padding: Spacing.md, borderRadius: Radius.xl, backgroundColor: 'rgba(255,255,255,0.08)' },
  emergencyIcon:        { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(239,68,68,0.15)', justifyContent: 'center', alignItems: 'center' },
  emergencyLabel:       { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.xs, fontWeight: FontWeight.semibold as any, textAlign: 'center' },
  emergencyNum:         { color: '#EF4444', fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  emergencyAlt:         { color: 'rgba(255,255,255,0.5)', fontSize: 10, textAlign: 'center' },
  numberHint:   { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 16, paddingHorizontal: 4, paddingBottom: 10, marginTop: -4 },
  numbersTitle:{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  numberRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numberText: { color: '#fff', fontSize: 16, fontWeight: '800', width: 44 },
  numberLabel:{ color: 'rgba(255,255,255,0.8)', fontSize: 13 },
});
