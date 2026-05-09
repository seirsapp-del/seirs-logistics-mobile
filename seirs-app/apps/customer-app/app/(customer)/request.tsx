import {
  View, Text, Pressable, StyleSheet, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import AddressPicker, { type PickedAddress } from '@/components/AddressPicker';
import { LAGOS_COORDS } from '@/constants/mockData';

// Nigerian-first ride categories. Trucks/vans live on the Send a
// Package flow — they're cargo vehicles, not rides. Local names
// first (okada, keke), with English in the sub-label for clarity.
const VEHICLE_OPTIONS = [
  { id: 'okada',    icon: 'bicycle-outline',  label: 'Okada',  sub: 'Motorbike',  price: '₦600',   eta: '2 min',  capacity: '1 rider' },
  { id: 'keke',     icon: 'car-outline',      label: 'Keke',   sub: 'Tricycle',   price: '₦900',   eta: '3 min',  capacity: '1-3 riders' },
  { id: 'car',      icon: 'car-sport-outline', label: 'Car',   sub: 'Sedan',      price: '₦1,800', eta: '4 min',  capacity: '1-4 riders' },
  { id: 'danfo',    icon: 'bus-outline',       label: 'Bus',   sub: 'Group ride', price: '₦3,500', eta: '8 min',  capacity: '5-14 riders' },
] as const;

type VehicleId = typeof VEHICLE_OPTIONS[number]['id'];

export default function RequestDriverScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  // Pickup + dropoff are full PickedAddress objects (address + lat/lng)
  // so the map can render real markers and the route polyline can be
  // drawn between actual coordinates instead of hardcoded ones.
  const [pickup,    setPickup]    = useState<PickedAddress | null>(null);
  const [dropoff,   setDropoff]   = useState<PickedAddress | null>(null);
  const [vehicle,   setVehicle]   = useState<VehicleId>('car');
  // Share-a-Ride: per Master Spec V8 corridor-pool scenario — match
  // riders going the same direction, split the fare. Only available
  // for car + danfo (not solo vehicles like okada).
  const [sharedRide, setSharedRide] = useState(false);
  const allowsSharing = vehicle === 'car' || vehicle === 'danfo';

  const mapRef = useRef<MapView>(null);

  const canProceed = !!pickup && !!dropoff;

  // Auto-fit the map when both pickup + dropoff are set
  useEffect(() => {
    if (pickup && dropoff && mapRef.current) {
      mapRef.current.fitToCoordinates(
        [
          { latitude: pickup.lat,  longitude: pickup.lng  },
          { latitude: dropoff.lat, longitude: dropoff.lng },
        ],
        { edgePadding: { top: 100, right: 60, bottom: 360, left: 60 }, animated: true },
      );
    }
  }, [pickup, dropoff]);

  const handleNext = () => {
    if (!pickup || !dropoff) return;
    router.push({
      pathname: '/(customer)/vehicle-select',
      params: {
        pickup:    pickup.address,
        pickupLat: String(pickup.lat),
        pickupLng: String(pickup.lng),
        dropoff:    dropoff.address,
        dropoffLat: String(dropoff.lat),
        dropoffLng: String(dropoff.lng),
        preselect:  vehicle,
        shared:     sharedRide ? '1' : '0',
      },
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
          <Marker
            coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
            pinColor="#22C55E"
            title="Pickup"
            description={pickup.address}
          />
        )}
        {dropoff && (
          <Marker
            coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }}
            pinColor="#EF4444"
            title="Dropoff"
            description={dropoff.address}
          />
        )}
        {pickup && dropoff && (
          // TODO: replace with Google Directions API polyline (draws the
          // actual road route instead of a straight line). Tracked in
          // backlog. For now this is a placeholder line so users at least
          // see direction + distance hint between the two pins.
          <Polyline
            coordinates={[
              { latitude: pickup.lat,  longitude: pickup.lng  },
              { latitude: dropoff.lat, longitude: dropoff.lng },
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

        {/* Address pickers — real Google Places autocomplete via the
            shared AddressPicker component. Tap opens a search modal,
            picks an address with lat/lng, drops a marker on the map. */}
        <View style={styles.inputsCard}>
          <AddressPicker
            label="Pickup"
            dotColor="#22C55E"
            value={pickup?.address ?? ''}
            onSelect={setPickup}
          />
          <View style={{ height: Spacing.sm }} />
          <AddressPicker
            label="Dropoff"
            dotColor="#EF4444"
            value={dropoff?.address ?? ''}
            onSelect={setDropoff}
          />
        </View>

        {/* Vehicle selector — always visible now that the inline-typing
            in-sheet pattern was replaced by AddressPicker modal. */}
        <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>Pick your ride</Text>
            <View style={styles.vehicleRow}>
              {VEHICLE_OPTIONS.map((v) => (
                <Pressable
                  key={v.id}
                  style={[
                    styles.vehicleChip,
                    { backgroundColor: theme.surfaceSecond, borderColor: vehicle === v.id ? theme.primary : theme.border },
                    vehicle === v.id && { backgroundColor: isDark ? '#0A1A2E' : '#EFF6FF' },
                  ]}
                  onPress={() => {
                    setVehicle(v.id);
                    // Sharing only valid for car + danfo — auto-uncheck if user picks okada/keke
                    if (v.id !== 'car' && v.id !== 'danfo') setSharedRide(false);
                  }}
                >
                  <Ionicons name={v.icon as any} size={20} color={vehicle === v.id ? theme.primary : theme.textSecond} />
                  <Text style={[styles.vehicleChipLabel, { color: vehicle === v.id ? theme.primary : theme.text }]}>{v.label}</Text>
                  <Text style={[styles.vehicleChipSub, { color: theme.textThird }]}>{v.sub}</Text>
                  <Text style={[styles.vehicleChipPrice, { color: theme.textSecond }]}>{v.price}</Text>
                </Pressable>
              ))}
            </View>

            {/* Share-a-Ride toggle — corridor pooling per Master Spec V8 */}
            <Pressable
              onPress={() => allowsSharing && setSharedRide(s => !s)}
              style={[
                styles.shareRow,
                {
                  backgroundColor: sharedRide ? theme.primary + '15' : theme.surfaceSecond,
                  borderColor:     sharedRide ? theme.primary : theme.border,
                  opacity:         allowsSharing ? 1 : 0.5,
                },
              ]}
            >
              <View style={[styles.shareIcon, { backgroundColor: sharedRide ? theme.primary : theme.surface }]}>
                <Ionicons name="people-outline" size={18} color={sharedRide ? '#fff' : theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.shareTitle, { color: theme.text }]}>
                  Share this ride
                </Text>
                <Text style={[styles.shareSub, { color: theme.textSecond }]}>
                  {allowsSharing
                    ? 'Match with riders going your way and split the fare up to 40%'
                    : 'Available for Car and Bus only'}
                </Text>
              </View>
              <View style={[
                styles.shareCheck,
                { borderColor: sharedRide ? theme.primary : theme.border, backgroundColor: sharedRide ? theme.primary : 'transparent' },
              ]}>
                {sharedRide ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
            </Pressable>

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
  vehicleChip:      { flex: 1, alignItems: 'center', gap: 2, padding: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1.5 },
  vehicleChipLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, marginTop: 4 },
  vehicleChipSub:   { fontSize: 9, fontWeight: FontWeight.medium },
  vehicleChipPrice: { fontSize: FontSize.xs, marginTop: 2 },

  // Share-a-Ride row
  shareRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, marginTop: Spacing.sm },
  shareIcon:   { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  shareTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  shareSub:    { fontSize: FontSize.xs, marginTop: 2 },
  shareCheck:  { width: 22, height: 22, borderRadius: 11, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },

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
