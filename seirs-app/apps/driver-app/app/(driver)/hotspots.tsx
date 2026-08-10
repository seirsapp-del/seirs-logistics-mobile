import {
  View, Text, Pressable, StyleSheet, StatusBar, ActivityIndicator,
  ScrollView, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import MapView, { Marker, Circle, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { driversApi, dropoffApi } from '@/services/api';

/**
 * Hotspots: full-screen demand map so drivers know where to position
 * themselves (founder ask, green-lit 2026-08-10). Zones come from
 * GET /drivers/demand-zones: real pending-order density clustered
 * around the driver's last position, colour-ramped by intensity.
 * Tapping a zone in the list opens turn-by-turn navigation.
 */
interface Zone {
  latitude: number; longitude: number; radiusM: number;
  intensity: number; orderCount: number;
}

interface StorePin {
  id: string; storeName: string; storeAddress: string;
  openTime: string | null; closeTime: string | null;
  lat: number | null; lng: number | null; distanceKm: number | null;
}

const zoneColor = (i: number) =>
  i > 0.66 ? '#EF4444' : i > 0.33 ? '#D97706' : '#16A34A';
const zoneFill = (i: number) =>
  i > 0.66 ? 'rgba(239,68,68,0.30)' : i > 0.33 ? 'rgba(217,119,6,0.25)' : 'rgba(22,163,74,0.20)';
const zoneLabel = (i: number) =>
  i > 0.66 ? 'High demand' : i > 0.33 ? 'Medium demand' : 'Steady demand';

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export default function HotspotsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [zones,   setZones]   = useState<Zone[]>([]);
  const [stores,  setStores]  = useState<StorePin[]>([]);
  const [me,      setMe]      = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await driversApi.me().catch(() => null);
        const lat = meRes?.lastLat != null ? Number(meRes.lastLat) : undefined;
        const lng = meRes?.lastLng != null ? Number(meRes.lastLng) : undefined;
        const [zonesRes, storesRes] = await Promise.all([
          driversApi.demandZones().catch(() => ({ zones: [] as Zone[] })),
          // Partner stores matter to drivers too: store pickups and
          // drop-offs are real job legs (founder 2026-08-10).
          dropoffApi.directory(lat, lng).catch(() => ({ items: [] as StorePin[] })),
        ]);
        if (cancelled) return;
        setZones(zonesRes?.zones ?? []);
        setStores((storesRes?.items ?? []).filter(s => s.lat != null && s.lng != null));
        if (lat != null && lng != null) setMe({ lat, lng });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []));

  const navigateTo = (z: { latitude: number; longitude: number }) => {
    const dest = `${z.latitude},${z.longitude}`;
    const url = Platform.OS === 'android'
      ? `google.navigation:q=${dest}`
      : `maps://app?daddr=${dest}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`).catch(() => {}),
    );
  };

  const ranked = [...zones]
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 6)
    .map(z => ({
      ...z,
      distanceKm: me ? +haversineKm(me.lat, me.lng, z.latitude, z.longitude).toFixed(1) : null,
    }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Demand Hotspots</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : !me ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="location-outline" size={44} color={theme.textThird} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No location yet</Text>
          <Text style={[styles.emptyBody, { color: theme.textSecond }]}>
            Go online so SEIRS knows where you are, then check back for demand around you.
          </Text>
        </View>
      ) : (
        <>
          {/* Map */}
          <MapView
            provider={PROVIDER_GOOGLE}
            style={{ flex: 1 }}
            initialRegion={{
              latitude:       me.lat,
              longitude:      me.lng,
              latitudeDelta:  0.12,
              longitudeDelta: 0.12,
            }}
            showsUserLocation
          >
            <Marker coordinate={{ latitude: me.lat, longitude: me.lng }} pinColor="#3A7BD5" title="You" />
            {zones.map((z, i) => (
              <Circle
                key={i}
                center={{ latitude: z.latitude, longitude: z.longitude }}
                radius={z.radiusM}
                fillColor={zoneFill(z.intensity)}
                strokeColor={zoneColor(z.intensity)}
                strokeWidth={1}
              />
            ))}
            {/* Partner stores (navy pins): tap the callout to navigate.
                Store pickup + drop-off legs are real driver work. */}
            {stores.map(s => (
              <Marker
                key={s.id}
                coordinate={{ latitude: s.lat!, longitude: s.lng! }}
                pinColor="#0F2B4C"
                onCalloutPress={() => navigateTo({ latitude: s.lat!, longitude: s.lng! })}
              >
                <Callout>
                  <View style={{ maxWidth: 220, padding: 4 }}>
                    <Text style={{ fontWeight: '700', fontSize: 13, color: '#0F2B4C' }}>{s.storeName}</Text>
                    <Text style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{s.storeAddress}</Text>
                    {(s.openTime || s.closeTime) && (
                      <Text style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                        Open {s.openTime ?? '?'}–{s.closeTime ?? '?'}
                      </Text>
                    )}
                    <Text style={{ fontSize: 11, color: '#3A7BD5', marginTop: 4, fontWeight: '600' }}>
                      Tap to navigate
                    </Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>

          {/* Legend */}
          <View style={[styles.legendRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {[
              { c: '#16A34A', l: 'Steady' },
              { c: '#D97706', l: 'Medium' },
              { c: '#EF4444', l: 'High' },
              { c: '#0F2B4C', l: 'Store' },
            ].map(x => (
              <View key={x.l} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: x.c }]} />
                <Text style={[styles.legendText, { color: theme.textSecond }]}>{x.l}</Text>
              </View>
            ))}
            <Text style={[styles.legendHint, { color: theme.textThird }]}>Orders in the last hours</Text>
          </View>

          {/* Ranked zones */}
          <ScrollView style={styles.listWrap} contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}>
            {ranked.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.emptyBody, { color: theme.textSecond }]}>
                  No demand clusters right now. Stay online: this updates as orders come in.
                </Text>
              </View>
            ) : ranked.map((z, i) => (
              <View key={i} style={[styles.zoneCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
                <View style={[styles.zoneDot, { backgroundColor: zoneColor(z.intensity) + '20' }]}>
                  <Ionicons name="flame" size={16} color={zoneColor(z.intensity)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.zoneTitle, { color: theme.text }]}>{zoneLabel(z.intensity)}</Text>
                  <Text style={[styles.zoneSub, { color: theme.textSecond }]}>
                    {z.orderCount} recent order{z.orderCount === 1 ? '' : 's'}
                    {z.distanceKm != null ? ` · ${z.distanceKm} km from you` : ''}
                  </Text>
                </View>
                <Pressable style={[styles.navBtn, { backgroundColor: theme.primary }]} onPress={() => navigateTo(z)}>
                  <Ionicons name="navigate" size={14} color="#fff" />
                  <Text style={styles.navBtnText}>Go</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: FontSize.xs },
  legendHint: { fontSize: 10, marginLeft: 'auto' },

  listWrap: { maxHeight: 260 },

  zoneCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  zoneDot:  { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  zoneTitle:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  zoneSub:  { fontSize: FontSize.xs, marginTop: 2 },
  navBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  navBtnText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emptyCard:  { padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  emptyBody:  { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
});
