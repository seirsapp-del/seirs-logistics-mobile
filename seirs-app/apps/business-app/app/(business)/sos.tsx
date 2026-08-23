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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Icon } from '@/components/Icon';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import { sosApi } from '@/services/api';

export default function BusinessSosScreen() {
  const router     = useRouter();
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];

  const [firing,    setFiring]    = useState(false);
  const [alertId,   setAlertId]   = useState<string | null>(null);

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
      const created = await sosApi.trigger({ lat, lng, note: 'Business app SOS' });
      setAlertId(created?.id ?? null);
    } catch (e: any) {
      Alert.alert('Could not send the alert', e?.message ?? 'Call 112 directly if you are in danger.');
    } finally {
      setFiring(false);
    }
  };

  const confirmFire = () => {
    Alert.alert(
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
    Alert.alert('Cancelled', 'The alert was withdrawn as a false alarm.');
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

      <View style={styles.body}>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  title:   { color: '#fff', fontSize: 17, fontWeight: '700' },

  body:    { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 40, gap: 18 },
  sosBtn:  { width: 170, height: 170, borderRadius: 85, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
             shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, elevation: 10 },
  sosBtnText: { color: '#B91C1C', fontSize: 44, fontWeight: '900', letterSpacing: 2 },
  sentTitle:  { color: '#fff', fontSize: 20, fontWeight: '800' },
  hint:    { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
  cancelBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  numbersCard: { marginTop: 'auto', marginBottom: 24, width: '100%', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, padding: 16, gap: 10 },
  numbersTitle:{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  numberRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numberText: { color: '#fff', fontSize: 16, fontWeight: '800', width: 44 },
  numberLabel:{ color: 'rgba(255,255,255,0.8)', fontSize: 13 },
});
