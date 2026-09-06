/**
 * Where the package actually is, on a map, for the person waiting for it.
 *
 * The tracking screen already received live driver pings over the socket
 * and did nothing with them except print "Driver location updating live",
 * which tells a customer that we know where their package is without
 * telling them where it is.
 *
 * No routing API is called. The line between pickup and drop-off is
 * drawn straight and the driver marker comes from pings SEIRS already
 * collects. Directions is the call that bills, and it does not answer
 * "where is my package" any better than this does.
 *
 * The map itself is the native Maps SDK, which is not billed per load
 * the way the JS API and the web services are, so leaving this on screen
 * for a whole delivery costs nothing.
 *
 * Gestures are off on purpose: this sits inside a ScrollView and a
 * pannable map there eats the scroll, so it reads as a live picture
 * rather than something to wrestle with.
 */
import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { tx } from '@/i18n/tx';

interface Point { lat: number; lng: number }

interface Props {
  pickup?:   Point | null;
  dropoff?:  Point | null;
  driver?:   Point | null;
  isDark:    boolean;
  theme:     any;
  height?:   number;
}

const num = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** A point is only usable if BOTH halves survived. */
const toCoord = (p?: Point | null) => {
  if (!p) return null;
  const lat = num(p.lat), lng = num(p.lng);
  return lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null;
};

export default function DeliveryTrackMap({
  pickup, dropoff, driver, isDark, theme, height = 200,
}: Props) {
  const mapRef = useRef<MapView>(null);

  const pick = toCoord(pickup);
  const drop = toCoord(dropoff);
  const drv  = toCoord(driver);
  const all  = [pick, drop, drv].filter(Boolean) as Array<{ latitude: number; longitude: number }>;

  // Keep everything in frame as the driver moves.
  useEffect(() => {
    if (all.length < 2) return;
    mapRef.current?.fitToCoordinates(all, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [pick?.latitude, pick?.longitude, drop?.latitude, drop?.longitude, drv?.latitude, drv?.longitude]);

  // Nothing to draw. Say so rather than showing the Atlantic.
  if (!all.length) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.surfaceSecond, height }]}>
        <Ionicons name="map-outline" size={20} color={theme.textThird} />
        <Text style={[styles.emptyText, { color: theme.textThird }]}>
          No map for this delivery yet
        </Text>
      </View>
    );
  }

  const first = all[0];

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: first.latitude, longitude: first.longitude,
          latitudeDelta: 0.06, longitudeDelta: 0.06,
        }}
        customMapStyle={isDark ? DARK_MAP : []}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {pick && <Marker coordinate={pick} pinColor="#22C55E" title={tx('auto.DeliveryTrackMap.pickup', 'Pickup')} />}
        {drop && <Marker coordinate={drop} pinColor="#EF4444" title={tx('auto.DeliveryTrackMap.dropOff', 'Drop-off')} />}
        {pick && drop && (
          <Polyline
            coordinates={[pick, drop]}
            strokeColor={theme.primary}
            strokeWidth={3}
            lineDashPattern={[6, 6]}
          />
        )}
        {drv && (
          <Marker coordinate={drv} title={tx('auto.DeliveryTrackMap.driver', 'Driver')} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.driverPin}>
              <Ionicons name="navigate" size={13} color="#fff" />
            </View>
          </Marker>
        )}
      </MapView>

      {drv && (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { borderRadius: Radius.lg, overflow: 'hidden' },
  empty: {
    borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
  },
  emptyText: { fontSize: FontSize.sm },
  driverPin: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#0F2B4C',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  liveBadge: {
    position: 'absolute', top: Spacing.sm, right: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(15,43,76,0.88)',
    paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full,
  },
  liveDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  liveText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
});

// Matches the dark map styling the ride screens already use. Defined
// locally because every other screen defines its own copy; pulling all
// six onto a shared constant is a separate tidy-up.
const DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
