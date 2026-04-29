import {
  View, Text, Pressable, StyleSheet, StatusBar, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { LAGOS_COORDS, POPULAR_LOCATIONS } from '@/constants/mockData';

const VEHICLE_OPTIONS = [
  { id: 'economy', icon: 'car-outline',       label: 'Economy', price: '₦1,800', eta: '4 min' },
  { id: 'premium', icon: 'car-sport-outline', label: 'Premium', price: '₦3,500', eta: '6 min' },
  { id: 'truck',   icon: 'bus-outline',        label: 'Truck',   price: '₦7,500', eta: '12 min' },
] as const;

export default function RequestDriverScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [pickup,   setPickup]   = useState('');
  const [dropoff,  setDropoff]  = useState('');
  const [vehicle,  setVehicle]  = useState<'economy' | 'premium' | 'truck'>('economy');
  const [focused,  setFocused]  = useState<'pickup' | 'dropoff' | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);

  const mapRef = useRef<MapView>(null);

  const canProceed = pickup.trim().length > 3 && dropoff.trim().length > 3;

  const handleNext = () => {
    router.push({
      pathname: '/(customer)/vehicle-select',
      params: { pickup, dropoff, preselect: vehicle },
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Map ───────────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={LAGOS_COORDS}
        customMapStyle={isDark ? DARK_MAP_STYLE : []}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {pickup && (
          <Marker coordinate={{ latitude: 6.5244 + 0.005, longitude: 3.3792 }} pinColor="#22C55E" />
        )}
        {dropoff && (
          <Marker coordinate={{ latitude: 6.5244 - 0.01, longitude: 3.3892 }} pinColor="#EF4444" />
        )}
        {pickup && dropoff && (
          <Polyline
            coordinates={[
              { latitude: 6.5244 + 0.005, longitude: 3.3792 },
              { latitude: 6.5244 - 0.01,  longitude: 3.3892 },
            ]}
            strokeColor={theme.primary}
            strokeWidth={3}
          />
        )}
      </MapView>

      {/* ── Top back button ───────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.topTitle, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.topTitleText, { color: theme.text }]}>Request a Ride</Text>
        </View>
      </SafeAreaView>

      {/* ── Bottom Sheet ──────────────────────────────────────────────── */}
      <View style={[styles.sheet, { backgroundColor: theme.surface }, Shadows.lg]}>
        {/* Handle */}
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
        </View>

        {/* Inputs */}
        <View style={styles.inputsCard}>
          {/* Pickup */}
          <Pressable
            style={[styles.locInput, { backgroundColor: theme.surfaceSecond, borderColor: focused === 'pickup' ? theme.primary : theme.border }]}
            onPress={() => setFocused('pickup')}
          >
            <View style={[styles.locDot, { backgroundColor: '#22C55E' }]} />
            <TextInput
              style={[styles.locText, { color: theme.text }]}
              placeholder="Pickup location"
              placeholderTextColor={theme.textThird}
              value={pickup}
              onChangeText={setPickup}
              onFocus={() => setFocused('pickup')}
              onBlur={() => setFocused(null)}
            />
            {pickup ? (
              <Pressable onPress={() => setPickup('')}>
                <Ionicons name="close-circle" size={18} color={theme.textThird} />
              </Pressable>
            ) : null}
          </Pressable>

          <View style={[styles.connector, { backgroundColor: theme.border }]} />

          {/* Dropoff */}
          <Pressable
            style={[styles.locInput, { backgroundColor: theme.surfaceSecond, borderColor: focused === 'dropoff' ? theme.primary : theme.border }]}
            onPress={() => setFocused('dropoff')}
          >
            <View style={[styles.locDot, { backgroundColor: '#EF4444' }]} />
            <TextInput
              style={[styles.locText, { color: theme.text }]}
              placeholder="Where are you going?"
              placeholderTextColor={theme.textThird}
              value={dropoff}
              onChangeText={setDropoff}
              onFocus={() => setFocused('dropoff')}
              onBlur={() => setFocused(null)}
            />
            {dropoff ? (
              <Pressable onPress={() => setDropoff('')}>
                <Ionicons name="close-circle" size={18} color={theme.textThird} />
              </Pressable>
            ) : null}
          </Pressable>
        </View>

        {/* Popular locations */}
        {(focused === 'pickup' || focused === 'dropoff') && (
          <View style={styles.suggestions}>
            {POPULAR_LOCATIONS.map((loc) => (
              <Pressable
                key={loc.id}
                style={[styles.suggestion, { borderBottomColor: theme.border }]}
                onPress={() => {
                  if (focused === 'pickup') setPickup(loc.address);
                  else setDropoff(loc.address);
                  setFocused(null);
                }}
              >
                <View style={[styles.locPin, { backgroundColor: theme.surfaceSecond }]}>
                  <Ionicons name="location-outline" size={14} color={theme.primary} />
                </View>
                <View>
                  <Text style={[styles.suggLabel, { color: theme.text }]}>{loc.label}</Text>
                  <Text style={[styles.suggSub, { color: theme.textSecond }]}>{loc.address}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Vehicle selector */}
        {!focused && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Ride type</Text>
            <View style={styles.vehicleRow}>
              {VEHICLE_OPTIONS.map((v) => (
                <Pressable
                  key={v.id}
                  style={[
                    styles.vehicleChip,
                    { backgroundColor: theme.surfaceSecond, borderColor: vehicle === v.id ? theme.primary : theme.border },
                    vehicle === v.id && { backgroundColor: isDark ? '#1A0C00' : '#EFF6FF' },
                  ]}
                  onPress={() => setVehicle(v.id)}
                >
                  <Ionicons name={v.icon as any} size={18} color={vehicle === v.id ? theme.primary : theme.textSecond} />
                  <Text style={[styles.vehicleChipLabel, { color: vehicle === v.id ? theme.primary : theme.text }]}>{v.label}</Text>
                  <Text style={[styles.vehicleChipPrice, { color: theme.textSecond }]}>{v.price}</Text>
                </Pressable>
              ))}
            </View>

            {/* CTA */}
            <View style={styles.cta}>
              <Button
                label={canProceed ? 'Choose Vehicle' : 'Enter locations to continue'}
                onPress={handleNext}
                disabled={!canProceed}
                fullWidth
                size="lg"
                rightIcon={canProceed ? <Ionicons name="arrow-forward" size={18} color="#fff" /> : undefined}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm,
    zIndex: 10,
  },
  backBtn:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  topTitle:  { flex: 1, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  topTitleText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl,
  },
  handleRow:  { alignItems: 'center', paddingVertical: Spacing.sm },
  handle:     { width: 40, height: 4, borderRadius: 2 },

  inputsCard:  { gap: 2, marginBottom: Spacing.md },
  locInput:    {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md,
  },
  locDot:      { width: 10, height: 10, borderRadius: 5 },
  locText:     { flex: 1, fontSize: FontSize.base },
  connector:   { width: 2, height: 8, marginLeft: 20 },

  suggestions: { marginBottom: Spacing.md },
  suggestion:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 12, borderBottomWidth: 1 },
  locPin:      { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  suggLabel:   { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  suggSub:     { fontSize: FontSize.xs },

  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginBottom: Spacing.sm },
  vehicleRow:   { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  vehicleChip:  { flex: 1, alignItems: 'center', gap: 4, padding: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1.5 },
  vehicleChipLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  vehicleChipPrice: { fontSize: FontSize.xs },

  cta: { paddingTop: Spacing.xs },
});

const DARK_MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#000000' }] },
  { featureType: 'road',                elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'road.arterial',       elementType: 'geometry', stylers: [{ color: '#1e1e1e' }] },
  { featureType: 'water',               elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                 stylers: [{ visibility: 'off' }] },
];
