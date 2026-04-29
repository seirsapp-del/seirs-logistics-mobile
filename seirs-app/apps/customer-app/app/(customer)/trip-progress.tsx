import {
  View, Text, Pressable, StyleSheet, StatusBar, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { MOCK_TRIPS, MOCK_DRIVERS } from '@/constants/mockData';

const STATUS_STEPS = [
  { key: 'assigned',   label: 'Rider assigned',  icon: 'navigate-outline' },
  { key: 'picked_up',  label: 'Pickup complete',  icon: 'cube-outline' },
  { key: 'in_transit', label: 'On the way',       icon: 'car-outline' },
  { key: 'delivered',  label: 'Arrived',          icon: 'flag-outline' },
] as const;

export default function TripProgressScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const params  = useLocalSearchParams<{ id: string; driverId?: string }>();

  const trip   = MOCK_TRIPS.find(t => t.id === params.id) ?? MOCK_TRIPS[2];
  const driver = MOCK_DRIVERS.find(d => d.id === params.driverId) ?? MOCK_DRIVERS[0];

  const [currentStep, setCurrentStep] = useState(0);
  const [eta,         setEta]         = useState(driver.eta);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1,    duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
    // simulate progress
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setCurrentStep(1), 5000));
    timers.push(setTimeout(() => setCurrentStep(2), 12000));
    timers.push(setTimeout(() => { setCurrentStep(3); setEta(0); }, 20000));
    const etaTimer = setInterval(() => setEta(e => Math.max(0, e - 1)), 60000);
    return () => { timers.forEach(clearTimeout); clearInterval(etaTimer); };
  }, []);

  const handleRate = () => {
    router.push({ pathname: '/(customer)/rate/[driverId]', params: { driverId: driver.id } });
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />

      {/* ── Map ─────────────────────────────────────────────────────── */}
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        customMapStyle={isDark ? DARK_MAP : []}
        initialRegion={{ latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        showsUserLocation
      >
        <Marker coordinate={{ latitude: 6.5290, longitude: 3.3800 }} pinColor="#22C55E" />
        <Marker coordinate={{ latitude: 6.5180, longitude: 3.3890 }} pinColor="#EF4444" />
        <Marker coordinate={{ latitude: 6.5270, longitude: 3.3810 }}>
          <View style={styles.driverMarker}>
            <Ionicons name="car" size={16} color="#fff" />
          </View>
        </Marker>
        <Polyline
          coordinates={[
            { latitude: 6.5290, longitude: 3.3800 },
            { latitude: 6.5270, longitude: 3.3810 },
            { latitude: 6.5230, longitude: 3.3840 },
            { latitude: 6.5180, longitude: 3.3890 },
          ]}
          strokeColor={theme.primary}
          strokeWidth={4}
          lineDashPattern={[0]}
        />
      </MapView>

      {/* ── Back ──────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.livePill, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Animated.View style={[styles.liveDot, { transform: [{ scale: pulse }] }]} />
          <Text style={[styles.liveText, { color: theme.text }]}>Live Tracking</Text>
        </View>
        <Pressable
          style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]}
          onPress={() => router.push({ pathname: '/(customer)/share-trip', params: { id: trip.id } })}
        >
          <Ionicons name="share-social-outline" size={20} color={theme.text} />
        </Pressable>
      </SafeAreaView>

      {/* ── Bottom Card ───────────────────────────────────────────── */}
      <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.lg]}>
        {/* Progress steps */}
        <View style={styles.stepsRow}>
          {STATUS_STEPS.map((step, i) => {
            const done   = i < currentStep;
            const active = i === currentStep;
            return (
              <View key={step.key} style={styles.stepItem}>
                <View style={[
                  styles.stepDot,
                  done   && { backgroundColor: '#22C55E' },
                  active && { backgroundColor: theme.primary },
                  !done && !active && { backgroundColor: theme.border },
                ]}>
                  {done
                    ? <Ionicons name="checkmark" size={12} color="#fff" />
                    : <Ionicons name={step.icon as any} size={10} color={active ? '#fff' : theme.textThird} />
                  }
                </View>
                {i < STATUS_STEPS.length - 1 && (
                  <View style={[styles.stepLine, { backgroundColor: done ? '#22C55E' : theme.border }]} />
                )}
              </View>
            );
          })}
        </View>
        <Text style={[styles.stepLabel, { color: theme.textSecond }]}>
          {STATUS_STEPS[currentStep]?.label ?? 'Arrived'}
        </Text>

        {/* ETA */}
        <View style={styles.etaRow}>
          <View style={[styles.etaBadge, { backgroundColor: isDark ? '#1A0C00' : '#EFF6FF' }]}>
            <Ionicons name="time-outline" size={16} color={theme.primary} />
            <Text style={[styles.etaText, { color: theme.primary }]}>
              {eta === 0 ? 'Arrived' : `${eta} min away`}
            </Text>
          </View>
        </View>

        {/* Driver info */}
        <View style={[styles.driverCard, { backgroundColor: theme.surfaceSecond, borderRadius: Radius.lg }]}>
          <Avatar name={driver.name} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.driverName, { color: theme.text }]}>{driver.name}</Text>
            <View style={styles.driverMeta}>
              <Ionicons name="star" size={12} color="#FFBE0B" />
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{driver.rating}</Text>
              <Text style={[styles.metaDot, { color: theme.border }]}>·</Text>
              <Text style={[styles.metaText, { color: theme.textSecond }]}>{driver.plate}</Text>
            </View>
            <Text style={[styles.vehicleText, { color: theme.textSecond }]}>
              {driver.color} {driver.vehicle}
            </Text>
          </View>
          {/* Action buttons */}
          <View style={styles.actionBtns}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: isDark ? '#001820' : '#F0FDFA', borderColor: '#2EC4B6' }]}
              onPress={() => router.push({ pathname: '/(customer)/messages/[chatId]', params: { chatId: 'chat1' } })}
            >
              <Ionicons name="chatbubble-outline" size={18} color="#2EC4B6" />
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: isDark ? '#001020' : '#DBEAFE', borderColor: theme.primary }]}
              onPress={() => router.push({ pathname: '/(customer)/call', params: { driverId: driver.id } })}
            >
              <Ionicons name="call-outline" size={18} color={theme.primary} />
            </Pressable>
          </View>
        </View>

        {/* SOS + Share row */}
        <View style={styles.bottomRow}>
          <Pressable
            style={[styles.sosBtn, { backgroundColor: '#FEF2F2', borderColor: theme.error }]}
            onPress={() => router.push('/(customer)/sos')}
          >
            <Ionicons name="warning-outline" size={16} color={theme.error} />
            <Text style={[styles.sosBtnText, { color: theme.error }]}>SOS</Text>
          </Pressable>

          {currentStep >= 3 && (
            <Button
              label="Rate Your Ride"
              onPress={handleRate}
              style={{ flex: 1 }}
              leftIcon={<Ionicons name="star-outline" size={16} color="#fff" />}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    zIndex: 10,
  },
  backBtn:  { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.full },
  liveDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  liveText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  driverMarker: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#3A86FF',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },

  card: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    padding: Spacing.md, paddingBottom: Spacing.xl,
  },

  stepsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs },
  stepItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepDot:  { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  stepLine: { flex: 1, height: 2, marginHorizontal: 2 },
  stepLabel:{ fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginBottom: Spacing.sm },

  etaRow:   { marginBottom: Spacing.md },
  etaBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  etaText:  { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  driverCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, marginBottom: Spacing.md },
  driverName: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  driverMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText:   { fontSize: FontSize.sm },
  metaDot:    { fontSize: FontSize.sm },
  vehicleText:{ fontSize: FontSize.xs, marginTop: 2 },
  actionBtns: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn:  { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },

  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sosBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, height: 52, borderRadius: Radius.lg, borderWidth: 1.5 },
  sosBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
});

const DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
