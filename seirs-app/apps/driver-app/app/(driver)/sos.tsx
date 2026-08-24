import {
  View, Text, Pressable, StyleSheet, StatusBar, Alert, Linking,
  Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { sosApi } from '@/services/api';

// Spec V8: driver-side SOS. Mirrors customer SOS using the same
// /sos/trigger backend endpoint. Optional ?deliveryId= when fired
// from an active trip so ops can correlate with the customer's
// in-progress order. Driver-tailored copy: emphasises vehicle
// breakdown / road incident / personal-safety as common triggers.

const EMERGENCY_CONTACTS = [
  { label: 'Police',       number: '199', icon: 'shield-outline' },
  { label: 'Ambulance',    number: '112', icon: 'medkit-outline' },
  { label: 'FRSC',         number: '122', icon: 'car-outline'   },
];

export default function DriverSosScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const isDark  = cs === 'dark';
  const params  = useLocalSearchParams<{ deliveryId?: string }>();

  const [activated,  setActivated]  = useState(false);
  const [countdown,  setCountdown]  = useState(5);
  const [alertId,    setAlertId]    = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      Alert.alert('Could not send that detail',
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
      Alert.alert('Could not reach SEIRS support',
        e?.message ?? 'Network error. Try again or call 199 directly.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSOS = () => {
    Alert.alert(
      'Send SOS?',
      'This alerts SEIRS ops, shares your live location, and notifies your assigned customer if you are on a trip.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SOS', style: 'destructive', onPress: fireSOS },
      ],
    );
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
          <Text style={styles.headerTitle}>SOS Emergency</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.body}>

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
                {countdown > 0 ? 'SOS sent' : 'SOS Activated!'}
              </Text>
              <Text style={styles.activeDesc}>
                {countdown > 0
                  ? `Ops has been alerted and your location is being shared. Cancel within ${countdown}s if this was a mistake.`
                  : 'Help is on the way. Stay safe.'}
              </Text>
              {countdown > 0 && (
                <Pressable style={styles.cancelBtn} onPress={cancelSOS}>
                  <Text style={styles.cancelBtnText}>Cancel SOS</Text>
                </Pressable>
              )}

              {/* Stays available after the modal is skipped or answered:
                  what is happening can change while help is on its way. */}
              {!!alertId && countdown === 0 && (
                <>
                  {noteSent && (
                    <Text style={styles.noteSentLine} numberOfLines={3}>
                      Ops can see: “{noteText.trim()}”
                    </Text>
                  )}
                  <Pressable style={styles.detailBtn} onPress={() => setNoteOpen(true)}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color="#7F1D1D" />
                    <Text style={styles.detailBtnText}>
                      {noteSent ? 'Update what is happening' : 'Tell ops what is happening'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <View style={styles.idleState}>
              <Text style={styles.idleTitle}>Vehicle trouble · Accident · Personal safety</Text>
              <Text style={styles.idleDesc}>
                One tap shares your live location with SEIRS ops + your customer if you are mid-trip. Use this for real emergencies only.
              </Text>
            </View>
          )}

          <View style={styles.emergencySection}>
            <Text style={styles.emergencySectionTitle}>Quick Dial</Text>
            <View style={styles.emergencyRow}>
              {EMERGENCY_CONTACTS.map(ec => (
                <Pressable
                  key={ec.label}
                  style={styles.emergencyCard}
                  onPress={() => Linking.openURL(`tel:${ec.number}`).catch(() => {})}
                >
                  <View style={styles.emergencyIcon}>
                    <Ionicons name={ec.icon as any} size={22} color="#EF4444" />
                  </View>
                  <Text style={styles.emergencyLabel}>{ec.label}</Text>
                  <Text style={styles.emergencyNum}>{ec.number}</Text>
                </Pressable>
              ))}
            </View>
          </View>

        </View>

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
              <Text style={styles.noteTitle}>What is happening?</Text>
              <Text style={styles.noteSub}>
                Support is already alerted and your location is being shared.
                This is optional: it just tells them what they are coming into.
              </Text>
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder="e.g. Passenger is threatening me, I am parked at the filling station"
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
                    : <Text style={styles.noteSendText}>Send to ops</Text>}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold },

  body: { flex: 1, alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },

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
  noteSentLine:  { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm, textAlign: 'center', fontStyle: 'italic', lineHeight: 19 },

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
});
