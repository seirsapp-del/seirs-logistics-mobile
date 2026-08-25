/**
 * Business SOS (founder 2026-08-23: "we don't know who may need it...
 * if they feel unsafe and they have the SEIRS app they should be able
 * to press it"). Same backend as customer/driver SOS: GPS + account
 * land on the admin desk; misuse is an account offence, but a real
 * emergency never meets a cooldown.
 */
import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, StatusBar, Alert, Linking, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { sosApi } from '@/services/api';

import { alertDialog } from '@/components/SeirsDialog';
export default function BusinessSosScreen() {
  const router     = useRouter();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];

  const [firing,    setFiring]    = useState(false);
  const [alertId,   setAlertId]   = useState<string | null>(null);

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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#7F1D1D' }} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Icon name="ArrowLeft" size={20} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Emergency SOS</Text>
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
        {!alertId ? (
          <>
            <Pressable style={styles.sosBtn} onPress={confirmFire} disabled={firing}>
              {firing
                ? <ActivityIndicator color="#7F1D1D" size="large" />
                : <Text style={styles.sosBtnText}>SOS</Text>}
            </Pressable>
            <Text style={styles.hint}>
              Tap if you or anyone around you is in danger. SEIRS support sees
              your location and account instantly: it does not have to be about
              a delivery.
            </Text>
          </>
        ) : (
          <>
            <View style={[styles.sosBtn, { backgroundColor: '#Fca5a5' }]}>
              <Icon name="CheckCircle2" size={54} color="#7F1D1D" />
            </View>
            <Text style={styles.sentTitle}>Alert sent</Text>
            <Text style={styles.hint}>
              SEIRS support has your location. Keep your phone with you.
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
              <Text style={styles.cancelBtnText}>False alarm: cancel the alert</Text>
            </Pressable>
          </>
        )}

        <View style={styles.numbersCard}>
          <Text style={styles.numbersTitle}>NATIONAL EMERGENCY LINES</Text>
          {[['112', 'National emergency'], ['767', 'Lagos emergency']].map(([num, label]) => (
            <Pressable key={num} style={styles.numberRow} onPress={() => Linking.openURL(`tel:${num}`)}>
              <Icon name="Phone" size={16} color="#fff" />
              <Text style={styles.numberText}>{num}</Text>
              <Text style={styles.numberLabel}>{label}</Text>
            </Pressable>
          ))}
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
            <Text style={styles.noteTitle}>What is happening?</Text>
            <Text style={styles.noteSub}>
              Support is already alerted and your location is being shared.
              This is optional: it only tells them what they are coming into.
            </Text>
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder="e.g. Two men are trying to force the shop door"
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
                  : <Text style={styles.noteSendText}>Send to support</Text>}
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

  body:    { flexGrow: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 40, gap: 18 },
  sosBtn:  { width: 170, height: 170, borderRadius: 85, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
             shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, elevation: 10 },
  sosBtnText: { color: '#B91C1C', fontSize: 44, fontWeight: '900', letterSpacing: 2 },
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
  numbersTitle:{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  numberRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numberText: { color: '#fff', fontSize: 16, fontWeight: '800', width: 44 },
  numberLabel:{ color: 'rgba(255,255,255,0.8)', fontSize: 13 },
});
