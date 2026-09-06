import {
  View, Text, Pressable, StyleSheet, StatusBar, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { PACKAGE_VEHICLES, RIDE_VEHICLES, calcPackageFare, DEFAULT_MAP_REGION } from '@/constants/mockData';
import { deliveriesApi , pricingApi } from '@/services/api';
import { naira } from '@/utils/money';
import { showDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

// UI presentation for the rate-card package vehicles: keyed by the
// canonical id calcPackageFare looks up. Keeping this here (not on the
// rate-card) because icons/eta are UX concerns, not pricing concerns.
// The eta field here held '4 min', '6 min', '18 min' and so on, invented
// numbers rendered on the card beside a clock icon as if they were a
// pickup time. SEIRS promises no arrival times anywhere (Lagos traffic,
// NEPA and checkpoints make any such promise a refund magnet), and the
// ride branch below had already been converted to capacity. Replaced
// with the same thing the ride cards show: what the vehicle can carry
// (2026-08-23 sweep, same class as driver D-2.1).
const PACKAGE_UI: Record<string, { icon: string; descKey: string; features: string[] }> = {
  bicycle:    { icon: 'bicycle-outline', descKey: 'vehBicycleNote',    features: ['Light', 'Cheap'] },
  motorcycle: { icon: 'bicycle',         descKey: 'vehMotorcycleNote', features: ['Fast', 'Up to 20kg'] },
  keke:       { icon: 'car',             descKey: 'vehKekeNote',       features: ['Shaded', 'Up to 100kg'] },
  car:        { icon: 'car-sport',       descKey: 'vehCarNote',        features: ['AC', 'Up to 200kg'] },
  van:        { icon: 'bus',             descKey: 'vehVanNote',        features: ['Covered', 'Up to 800kg'] },
  truck_sm:   { icon: 'bus-outline',     descKey: 'vehTruckSmNote',    features: ['Heavy', 'Up to 3 tonnes'] },
  truck_lg:   { icon: 'bus-outline',     descKey: 'vehTruckLgNote',    features: ['Heaviest', 'Bulk loads'] },
};

/** Payload headline for a cargo card: kg below a tonne, tonnes above. */
function payloadLabel(maxKg: number): string {
  if (!Number.isFinite(maxKg) || maxKg <= 0) return '';
  return maxKg >= 1000 ? `Up to ${Math.floor(maxKg / 1000)}t` : `Up to ${maxKg}kg`;
}

export default function VehicleSelectScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{
    mode?: string; pickup: string; dropoff: string; preselect?: string;
    pickupLat?: string; pickupLng?: string; dropoffLat?: string; dropoffLng?: string;
    distanceKm?: string; riderName?: string;
  }>();

  // 'ride' mode comes from /request (Okada/Keke/Car/Danfo, fare scales with km).
  // That is the ONLY caller: /request always passes mode 'ride'. There is no
  // /multi-stop route (an older comment claimed there was) and the package
  // flow prices its own vehicle step inside /send, so the cargo branch below
  // is defensive only.
  const isRide = params.mode === 'ride';
  const distKm = Number(params.distanceKm ?? '0') || 0;

  // Coords drive regional + zone surcharges in the fare calc. Passing them
  // here keeps the picker price aligned with what the review screen charges
  // (otherwise the picker undercounts and the user gets sticker-shock on
  // the next screen).
  const pickupCoords  = Number(params.pickupLat)  && Number(params.pickupLng)
    ? { latitude: Number(params.pickupLat),  longitude: Number(params.pickupLng)  } : null;
  const dropoffCoords = Number(params.dropoffLat) && Number(params.dropoffLng)
    ? { latitude: Number(params.dropoffLat), longitude: Number(params.dropoffLng) } : null;

  /**
   * Live fares from the unified backend quote: one engine for shown and
   * charged (founder 2026-08-15). The bundled card keeps pricing the
   * screen while the request is in flight or offline, so the picker
   * never blanks; the moment the server answers, its numbers win.
   */
  const ID_TO_ENUM: Record<string, string> = {
    okada: 'motorcycle', keke: 'tricycle', car: 'car', danfo: 'van',
    bicycle: 'bicycle', motorcycle: 'motorcycle', van: 'van',
    truck_sm: 'truck_small', truck_lg: 'truck_large',
  };
  const [liveQuotes, setLiveQuotes] = useState<Record<string, { total: number }> | null>(null);
  // Ride engine quote: totals + a pin per vehicle. null while loading,
  // 'failed' shows the retry row: the screen never falls back to a
  // local number the server would not honour.
  const [rideQuotes, setRideQuotes] = useState<Record<string, any> | null>(null);
  const [rideQuoteFailed, setRideQuoteFailed] = useState(false);
  const [rideQuoteNonce, setRideQuoteNonce] = useState(0);

  // Luggage (founder 23 Aug): small rides free, large pays the class
  // fee INSIDE the pinned quote; an okada can't take large at all.
  const [luggage, setLuggage] = useState<'none' | 'small' | 'large'>('none');

  // Coming BACK to this screen re-quotes: pins live ~10 minutes, and a
  // user who bounced off the review with 'Price refreshed' must land
  // on fresh numbers, not the stale ones that sent them back.
  useFocusEffect(useCallback(() => {
    setRideQuoteNonce(n => n + 1);
  }, []));
  useEffect(() => {
    if (!isRide || !(distKm > 0)) return;
    let cancelled = false;
    setRideQuoteFailed(false);
    pricingApi.rideQuote({
      km: distKm,
      luggage,
      pickupCoords:  pickupCoords ?? undefined,
      dropoffCoords: dropoffCoords ?? undefined,
    })
      .then((r) => { if (!cancelled) setRideQuotes(r?.vehicles ?? {}); })
      .catch(() => { if (!cancelled) setRideQuoteFailed(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRide, distKm, rideQuoteNonce, luggage]);

  useEffect(() => {
    if (isRide) return; // rides price through the ride engine above
    if (!pickupCoords || !dropoffCoords) return;
    deliveriesApi.quote({
      pickupLat:  pickupCoords.latitude,  pickupLng:  pickupCoords.longitude,
      dropoffLat: dropoffCoords.latitude, dropoffLng: dropoffCoords.longitude,
      pickupAddress: params.pickup, dropoffAddress: params.dropoff,
      packageCategory: isRide ? 'ride' : 'standard parcel',
      weightKg: 0,
    })
      .then((r: any) => { if (r?.quotes && Object.keys(r.quotes).length) setLiveQuotes(r.quotes); })
      .catch(() => { /* bundled card keeps the screen honest offline */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRide, params.pickupLat, params.pickupLng, params.dropoffLat, params.dropoffLng]);

  const liveTotal = (appId: string, localTotal: number, sharedFactor = 1): number => {
    const live = liveQuotes?.[ID_TO_ENUM[appId] ?? appId];
    // No rounding: this figure ends up on the pay button, and the server
    // charges the kobo (founder 2026-08-24).
    return live ? Number(live.total) * sharedFactor : localTotal;
  };

  // List of vehicles, with a uniform shape both modes can render.
  // Ride mode prices come from the server ride quote against the
  // actual route distance.
  const list = isRide
    ? RIDE_VEHICLES.map(v => ({
        id:          v.id,
        label:       v.label,
        icon:        v.icon,
        accentColor: v.accentColor,
        photoUrl:    v.photoUrl,
        description: v.id === 'danfo'
          ? 'CHARTER: the whole bus, not one seat'
          : v.description,
        eta:         v.eta,
        features:    [...v.features],
        priceLabel:  (() => {
          // Server-priced or nothing: a placeholder is honest, a local
          // guess the engine will not charge is not.
          const q = rideQuotes?.[ID_TO_ENUM[v.id] ?? v.id];
          return q ? naira(q.total) : '…';
        })(),
        // Capacity, not minutes: SEIRS makes no time promises.
        metaText:    `${v.capacityCount} driver${v.capacityCount === 1 ? '' : 's'}`,
      }))
    : PACKAGE_VEHICLES.map(v => {
        const ui = PACKAGE_UI[v.id] ?? { icon: 'cube-outline', descKey: v.noteKey, features: [] };
        // Cargo flow doesn't have a weight at this screen: the picker
        // shows base + km only. Final fare (with weight/category/COD)
        // resolves on the /send review step, which re-quotes the server.
        const priced = calcPackageFare(v.id, distKm, 0, { pickupCoords, dropoffCoords });
        return {
          id:          v.id,
          label:       t(`send.${v.labelKey}`, { defaultValue: v.id }),
          icon:        ui.icon,
          accentColor: theme.primary,
          photoUrl:    undefined as string | undefined,
          description: t(`send.${ui.descKey}`, { defaultValue: '' }),
          eta:         '',
          features:    ui.features,
          priceLabel:  naira(liveTotal(v.id, priced.total)),
          // Capacity, not minutes: SEIRS makes no time promises.
          metaText:    payloadLabel(Number((v as any).maxKg ?? 0)),
        };
      });

  const largeBlocked = (id: string) => luggage === 'large' && id === 'okada';

  const initial = list.find(v => v.id === params.preselect)?.id ?? list[0].id;
  const [selected, setSelected] = useState(initial);
  const selectedVehicle = list.find(v => v.id === selected) ?? list[0];

  // Okada at night is a known safety/legality concern in most Nigerian
  // cities (most major roads restrict it past 7-9pm and security risk
  // climbs after dark). We warn instead of blocking: riders should be
  // able to choose, but they should see the risk so they can swap to
  // Keke / Car for a few hundred naira more.
  const hr = new Date().getHours();
  const isNight = hr >= 22 || hr < 5;
  const showOkadaNightWarning = isRide && selected === 'okada' && isNight;

  const selectVehicle = (id: string) => setSelected(id);

  // ── Map background ──────────────────────────────────────────────────────
  const pickupLat  = Number(params.pickupLat  ?? '0') || null;
  const pickupLng  = Number(params.pickupLng  ?? '0') || null;
  const dropoffLat = Number(params.dropoffLat ?? '0') || null;
  const dropoffLng = Number(params.dropoffLng ?? '0') || null;
  const mapRef     = useRef<MapView>(null);
  const { coords: routeCoords } = useDirectionsPolyline(
    pickupLat  ? { latitude: pickupLat,  longitude: pickupLng!  } : null,
    dropoffLat ? { latitude: dropoffLat, longitude: dropoffLng! } : null,
  );

  // ── Bottom sheet ─────────────────────────────────────────────────────────
  const sheetRef = useRef<BottomSheet>(null);
  const sheetTopInset = insets.top + 88;
  const snapPoints = useMemo<(string | number)[]>(() => [220, '92%'], []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={pickupLat
          ? { latitude: pickupLat, longitude: pickupLng!, latitudeDelta: 0.05, longitudeDelta: 0.05 }
          : DEFAULT_MAP_REGION}
        customMapStyle={isDark ? DARK_MAP : []}
        onMapReady={() => {
          if (!pickupLat || !dropoffLat) return;
          mapRef.current?.fitToCoordinates(
            [{ latitude: pickupLat, longitude: pickupLng! }, { latitude: dropoffLat, longitude: dropoffLng! }],
            { edgePadding: { top: 120, right: 60, bottom: 360, left: 60 }, animated: true },
          );
        }}
      >
        {pickupLat  && <Marker coordinate={{ latitude: pickupLat,  longitude: pickupLng!  }} pinColor="#22C55E" title={tx('auto.vehicleSelect.pickup', 'Pickup')}  description={params.pickup}  />}
        {dropoffLat && <Marker coordinate={{ latitude: dropoffLat, longitude: dropoffLng! }} pinColor="#EF4444" title={tx('auto.vehicleSelect.dropoff', 'Dropoff')} description={params.dropoff} />}
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={theme.primary} strokeWidth={4} />
        )}
      </MapView>

      {/* Floating header (matches /request) */}
      <SafeAreaView edges={['top', 'bottom']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.topTitle, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.topTitleText, { color: theme.text }]}>
            {isRide ? <><Text style={{ color: theme.primary, fontWeight: '800' }}>2/3</Text>{'  '}Choose your ride</> : t('vehicleSelect2.title')}
          </Text>
        </View>
      </SafeAreaView>

      <BottomSheet
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        topInset={sheetTopInset}
        backgroundStyle={{ backgroundColor: theme.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
      >
        <BottomSheetScrollView
          // Bottom inset: the Review CTA rendered half under the system
          // navigation bar on the A30 (live walk 2026-08-23).
          contentContainerStyle={[styles.sheetContent, { paddingBottom: Spacing.xxl + Math.max(insets.bottom, 48) + 8 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>{t('vehicleSelect2.availableVehicles')}</Text>

          {list.map((v) => {
            const isSelected = selected === v.id;
            return (
              <Pressable
                key={v.id}
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: isSelected ? theme.primary : theme.border },
                  isSelected && { backgroundColor: isDark ? '#0A0A0A' : '#EBF5FF' },
                  Shadows.sm,
                ]}
                disabled={isRide && largeBlocked(v.id)}
                onPress={() => selectVehicle(v.id)}
              >
                {/* Uber-style: vehicle-coloured tinted square, bigger filled
                    icon when selected, slightly subtler when not. Photos
                    (v.photoUrl) take precedence when set: currently never. */}
                <View style={[
                  styles.iconWrap,
                  {
                    backgroundColor: isSelected
                      ? v.accentColor + '22'   // 13% opacity of accent
                      : (isDark ? '#1A1A1A' : '#F3F4F6'),
                    borderWidth: isSelected ? 2 : 0,
                    borderColor: isSelected ? v.accentColor : 'transparent',
                    overflow: 'hidden',
                  },
                ]}>
                  {v.photoUrl ? (
                    <Image source={{ uri: v.photoUrl }} style={styles.iconImage} />
                  ) : (
                    v.icon === 'rickshaw' ? (
                      <MaterialCommunityIcons
                        name="rickshaw"
                        size={36}
                        color={isSelected ? v.accentColor : theme.textSecond}
                      />
                    ) : (
                    <Ionicons
                      name={v.icon as any}
                      size={36}
                      color={isSelected ? v.accentColor : theme.textSecond}
                    />
                    )
                  )}
                </View>

                <View style={styles.cardInfo}>
                  <Text style={[styles.cardLabel, { color: theme.text }]}>{v.label}</Text>
                  <Text style={[styles.cardDesc, { color: theme.textSecond }]}>{v.description}</Text>
                  <View style={styles.featuresRow}>
                    {v.features.map((f) => (
                      <View key={f} style={[styles.featurePill, { backgroundColor: theme.surfaceSecond }]}>
                        <Text style={[styles.featureText, { color: theme.textSecond }]}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.cardRight}>
                  <Pressable
                    disabled={!isRide}
                    hitSlop={8}
                    onPress={() => {
                      const q = rideQuotes?.[ID_TO_ENUM[v.id] ?? v.id];
                      const bd = (q as any)?.breakdown;
                      if (!bd) return;
                      const lines = [
                        ['Base fare', bd.base], ['Distance + fuel', bd.distance],
                        ['Night', bd.night], ['Peak', bd.peak], ['Weekend', bd.weekend],
                        ['Luggage', Number((q as any).luggageFee ?? 0)],
                        ['Service fee', Number((q as any).serviceFee ?? 0)],
                        ['VAT', bd.vat],
                      ].filter(([, n]) => Number(n) > 0)
                        .map(([l, n]) => `${l}: ${naira(n)}`);
                      showDialog({
                        title: `${v.label} · ${naira((q as any).total)}`,
                        message: lines.join('\n') + '\n\nThis exact number is what you pay: it is pinned.',
                      });
                    }}
                  >
                    <Text style={[styles.price, { color: isSelected ? theme.primary : theme.text }]}>{v.priceLabel}</Text>
                  </Pressable>
                  <View style={styles.etaRow}>
                    {/* Was a clock for the cargo branch, next to an invented
                        minutes figure. Both are gone: the row shows what the
                        vehicle carries (2026-08-23 sweep). */}
                    <Ionicons name={isRide ? 'person-outline' : 'cube-outline'} size={12} color={theme.textSecond} />
                    <Text style={[styles.eta, { color: theme.textSecond }]}>{(v as any).metaText ?? v.eta}</Text>
                  </View>
                  {isSelected && (
                    <View style={[styles.checkWrap, { backgroundColor: theme.primary }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}

          {/* Safety warning when Okada is chosen at night: see comment above. */}
          {showOkadaNightWarning && (
            <View style={[styles.warnRow, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
              <Ionicons name="warning-outline" size={18} color="#92400E" />
              <Text style={[styles.warnText, { color: '#92400E' }]}>{t('vehicleSelect2.okadaNightWarning')}</Text>
            </View>
          )}

          {/* Share-ride removed 2026-08-22: the toggle promised a
              discount no engine or matcher supported. Pooling returns
              as a real feature or not at all. */}

          {isRide && (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: theme.textThird, marginBottom: 6 }}>
                {tr('auto.vehicleSelect.travellingWithLuggage', 'TRAVELLING WITH LUGGAGE?')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([['none', 'None'], ['small', 'Small bag'], ['large', 'Large']] as const).map(([k, label]) => (
                  <Pressable
                    key={k}
                    onPress={() => {
                      setLuggage(k);
                      // Large luggage cannot ride an okada: hop the
                      // selection to keke instead of dead-ending.
                      if (k === 'large' && selected === 'okada') setSelected('keke');
                    }}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5,
                      borderColor: luggage === k ? theme.primary : theme.border,
                      backgroundColor: luggage === k ? theme.primary + '15' : 'transparent',
                    }}
                  >
                    <Text style={{ color: luggage === k ? theme.primary : theme.textSecond, fontSize: FontSize.sm, fontWeight: '600' }}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {luggage === 'large' && (
                <Text style={{ color: theme.textThird, fontSize: FontSize.xs, marginTop: 6 }}>
                  {tr('auto.vehicleSelect.largeLuggageAddsASmall', 'Large luggage adds a small fee (already in the prices below) and can\'t go on an okada.')}
                </Text>
              )}
            </View>
          )}

          {isRide && rideQuoteFailed && (
            <Pressable
              onPress={() => setRideQuoteNonce(n => n + 1)}
              style={[styles.warnRow, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}
            >
              <Ionicons name="cloud-offline-outline" size={18} color="#B91C1C" />
              <Text style={[styles.warnText, { color: '#991B1B' }]}>
                {tr('auto.vehicleSelect.weCouldnTPriceThis', 'We couldn\'t price this trip. Tap to try again.')}
              </Text>
            </Pressable>
          )}

          <View style={styles.ctaWrap}>
            <View style={styles.ctaSummary}>
              <Text style={[styles.ctaLabel, { color: theme.textSecond }]}>{t('vehicleSelect2.selected')}</Text>
              <Text style={[styles.ctaValue, { color: theme.text }]}>{selectedVehicle.label} · {selectedVehicle.priceLabel}</Text>
            </View>
            <Button
              label={t('vehicleSelect2.reviewRide', { defaultValue: 'Review ride' })}
              disabled={!rideQuotes?.[ID_TO_ENUM[selected] ?? selected]}
              onPress={() => {
                // Ride-only forward. The old cargo branch pushed to
                // /fare-breakdown, a screen no caller could ever reach
                // (it mislabelled every cargo vehicle as "Economy" because
                // its lookup table used ride ids). Deleted 2026-08-24; the
                // package flow reviews and re-quotes inside /send.
                const q = rideQuotes?.[ID_TO_ENUM[selected] ?? selected];
                if (!q) return; // no pinned price, no forward
                router.push({
                  pathname: '/(customer)/confirm-ride',
                  params: {
                    mode:        'ride',
                    pickup:      params.pickup,
                    dropoff:     params.dropoff,
                    pickupLat:   params.pickupLat ?? '',
                    pickupLng:   params.pickupLng ?? '',
                    dropoffLat:  params.dropoffLat ?? '',
                    dropoffLng:  params.dropoffLng ?? '',
                    vehicleId:   selected,
                    distanceKm:  params.distanceKm ?? '0',
                    // Passed through unrounded so the breakdown on the next
                    // screen still sums to the pinned total.
                    fareTotal:   String(Number(q.total)),
                    serviceFee:  String(Number(q.serviceFee ?? 0)),
                    luggageFee:  String(Number((q as any).luggageFee ?? 0)),
                    luggage,
                    riderName:   params.riderName ?? '',
                    quoteToken:  q.quotePin?.token ?? '',
                  },
                } as any);
              }}
              size="lg"
              rightIcon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
              style={{ flex: 1 }}
            />
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  topBar:       { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm, zIndex: 10 },
  backBtn:      { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  topTitle:     { flex: 1, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  topTitleText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  sheetContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginBottom: Spacing.xs },

  card:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  iconWrap:    { width: 64, height: 64, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
  iconImage:   { width: 64, height: 64 },
  cardInfo:    { flex: 1, gap: 3 },
  cardLabel:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  cardDesc:    { fontSize: FontSize.xs },
  featuresRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  featurePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  featureText: { fontSize: 10, fontWeight: FontWeight.medium },
  cardRight:   { alignItems: 'flex-end', gap: 4 },
  price:       { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  etaRow:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
  eta:         { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  checkWrap:   { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 2 },

  warnRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, marginTop: Spacing.sm },
  warnText:    { flex: 1, fontSize: FontSize.sm, lineHeight: 18 },

  ctaWrap:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: 'transparent' },
  ctaSummary:  { flex: 0 },
  ctaLabel:    { fontSize: FontSize.xs },
  ctaValue:    { fontSize: FontSize.base, fontWeight: FontWeight.bold },
});

const DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
