import {
  View, Text, Pressable, StyleSheet, StatusBar, Alert,
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

const EMERGENCY_CONTACTS = [
  { label: 'Police',       number: '199', icon: 'shield-outline' },
  { label: 'Ambulance',    number: '112', icon: 'medkit-outline' },
  { label: 'Fire Service', number: '01-7944929', icon: 'flame-outline' },
];

export default function SOSScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  // Optional ?deliveryId= param when SOS is opened from the trip-progress
  // screen — lets the backend notify the assigned driver too.
  const params  = useLocalSearchParams<{ deliveryId?: string }>();

  const [activated, setActivated] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [alertId,   setAlertId]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse1, { toValue: 1.4, duration: 1000, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulse1, { toValue: 1,   duration: 1000, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      ])
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(pulse2, { toValue: 1.7, duration: 1000, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulse2, { toValue: 1,   duration: 1000, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      ])
    );
    loop.start();
    loop2.start();
    return () => { loop.stop(); loop2.stop(); };
  }, []);

  useEffect(() => {
    if (!activated) return;
    if (countdown === 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [activated, countdown]);

  const fireSOS = async () => {
    setSubmitting(true);
    setActivated(true);
    setCountdown(5);

    // Try to attach a GPS fix — non-blocking. The alert still posts
    // without coordinates if permission is denied / no fix yet.
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
      const created = await sosApi.trigger({
        deliveryId: params.deliveryId,
        lat, lng,
      });
      setAlertId(created.id);
    } catch (e: any) {
      // Surface the failure but stay in activated state — user can retry.
      Alert.alert('Could not reach SEIRS support',
        e?.message ?? 'Network error. Try again or call 199 directly.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSOS = () => {
    Alert.alert(
      'Send SOS?',
      'This will alert SEIRS support, share your live location, and notify your driver if you are on a trip.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SOS', style: 'destructive', onPress: fireSOS },
      ]
    );
  };

  const cancelSOS = async () => {
    if (alertId) {
      // Best-effort — UI already resets even if the cancel API call fails.
      sosApi.cancel(alertId).catch(() => {});
    }
    setActivated(false);
    setCountdown(5);
    setAlertId(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0A0000' : '#FFF1F1' }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>SOS Emergency</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.body}>

          {/* SOS button */}
          <View style={styles.sosWrap}>
            <Animated.View style={[styles.ring2, { transform: [{ scale: pulse2 }] }]} />
            <Animated.View style={[styles.ring1, { transform: [{ scale: pulse1 }] }]} />
            <Pressable style={styles.sosBtn} onPress={handleSOS} disabled={activated}>
              <Ionicons name="warning" size={44} color="#fff" />
              <Text style={styles.sosBtnText}>SOS</Text>
              {activated && countdown > 0 && (
                <Text style={styles.sosCountdown}>{countdown}</Text>
              )}
            </Pressable>
          </View>

          {activated ? (
            <View style={styles.activeState}>
              <Text style={styles.activeTitle}>
                {countdown > 0 ? `SOS in ${countdown}s…` : 'SOS Activated!'}
              </Text>
              <Text style={styles.activeDesc}>
                {countdown > 0
                  ? 'Your location is being shared. Emergency contacts notified.'
                  : 'Help is on the way. Stay calm and stay on the line.'}
              </Text>
              {countdown > 0 && (
                <Pressable style={styles.cancelBtn} onPress={cancelSOS}>
                  <Text style={styles.cancelBtnText}>Cancel SOS</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.idleState}>
              <Text style={styles.idleTitle}>Press & hold SOS button in an emergency</Text>
              <Text style={styles.idleDesc}>
                Your live location will be shared with SEIRS support and your emergency contacts.
              </Text>
            </View>
          )}

          {/* Emergency numbers */}
          <View style={styles.emergencySection}>
            <Text style={styles.emergencySectionTitle}>Quick Dial</Text>
            <View style={styles.emergencyRow}>
              {EMERGENCY_CONTACTS.map(ec => (
                <Pressable
                  key={ec.label}
                  style={styles.emergencyCard}
                  onPress={() => Alert.alert('Call', `Calling ${ec.label} (${ec.number})…`)}
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

          {/* Share trip */}
          <Pressable
            style={styles.shareBtn}
            onPress={() => router.push('/(customer)/share-trip')}
          >
            <Ionicons name="share-social-outline" size={18} color="#fff" />
            <Text style={styles.shareBtnText}>Share My Live Location</Text>
          </Pressable>

        </View>
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

  emergencySection:     { width: '100%', gap: Spacing.sm },
  emergencySectionTitle:{ color: 'rgba(255,255,255,0.65)', fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  emergencyRow:         { flexDirection: 'row', gap: Spacing.sm },
  emergencyCard:        { flex: 1, alignItems: 'center', gap: 6, padding: Spacing.md, borderRadius: Radius.xl, backgroundColor: 'rgba(255,255,255,0.08)' },
  emergencyIcon:        { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(239,68,68,0.15)', justifyContent: 'center', alignItems: 'center' },
  emergencyLabel:       { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  emergencyNum:         { color: '#EF4444', fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  shareBtn:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: 14, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)' },
  shareBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
