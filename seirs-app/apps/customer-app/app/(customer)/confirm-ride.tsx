import {
  View, Text, Pressable, StyleSheet, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useDirectionsPolyline } from '@/components/useDirectionsPolyline';
import { PACKAGE_VEHICLES, RIDE_VEHICLES, MOCK_DRIVERS, calcRideFare, LAGOS_COORDS, DEFAULT_MAP_REGION } from '@/constants/mockData';
import { deliveriesApi, paymentsApi, loyaltyApi, type SavedCard } from '@/services/api';

export default function ConfirmRideScreen() {
  const router   = useRouter();
  const cs       = useColorScheme();
  const theme    = Colors[cs ?? 'light'];
  const isDark   = cs === 'dark';
  const { t }    = useTranslation();
  const insets   = useSafeAreaInsets();
  const params   = useLocalSearchParams<{
    mode?: string; pickup: string; dropoff: string; vehicleId: string;
    pickupLat?: string; pickupLng?: string; dropoffLat?: string; dropoffLng?: string;
    shared?: string; distanceKm?: string; durationText?: string; fareTotal?: string;
    // Cargo extras
    weightKg?: string; category?: string; codAmountNgn?: string; extraStops?: string;
  }>();

  const isRide = params.mode === 'ride';
  const distKm = Number(params.distanceKm ?? '0') || 0;
  const shared = params.shared === '1';

  const [payment,    setPayment]    = useState<'points' | 'card' | 'cash' | 'banktransfer'>('cash');
  const [confirming, setConfirming] = useState(false);

  // Real wallet + saved-cards state: load on mount, fall back to "-"
  // labels if the backend call fails (offline first run, expired token).
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [defaultCard,   setDefaultCard]   = useState<SavedCard | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loyalty, cards] = await Promise.all([
          loyaltyApi.balance().catch(() => null),
          paymentsApi.listSavedCards().catch(() => [] as SavedCard[]),
        ]);
        if (cancelled) return;
        if (loyalty) setPointsBalance(loyalty.balance);
        const def = cards.find(c => c.isDefault) ?? cards[0] ?? null;
        if (def) setDefaultCard(def);
      } catch { /* keep falsy state: UI shows "-" */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cargo vehicle lookup uses the rate-card list now (same IDs as
  // calcPackageFare) so label/icon match what the picker actually showed.
  const vehicle = isRide
    ? RIDE_VEHICLES.find(v => v.id === params.vehicleId) ?? RIDE_VEHICLES[0]
    : (() => {
        const v = PACKAGE_VEHICLES.find(pv => pv.id === params.vehicleId);
        return v
          ? { id: v.id, label: t(`send.${v.labelKey}`, { defaultValue: v.id }), icon: 'cube-outline' }
          : { id: 'cargo', label: t('vehicleSelect2.title'), icon: 'cube-outline' };
      })();

  // Trust fareTotal from upstream (fare-breakdown's calc against the live
  // rate card). If it's missing, recompute against the live card so the
  // total here can never disagree with what we POST to the backend.
  const total = params.fareTotal
    ? Number(params.fareTotal)
    : isRide
      ? calcRideFare(params.vehicleId, distKm, shared, {
          pickupCoords:  Number(params.pickupLat)  ? { latitude: Number(params.pickupLat),  longitude: Number(params.pickupLng!)  } : null,
          dropoffCoords: Number(params.dropoffLat) ? { latitude: Number(params.dropoffLat), longitude: Number(params.dropoffLng!) } : null,
        }).total
      : 0;

  // Driver assignment is still a deterministic hash placeholder until the
  // backend assignment API hands one back. The real assignment will arrive
  // via the WS `driver:assigned` event on trip-progress.
  const driverIndex = (() => {
    let h = 0;
    const seed = `${params.pickup ?? ''}|${params.dropoff ?? ''}|${params.vehicleId ?? ''}`;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return h % MOCK_DRIVERS.length;
  })();
  const driver = MOCK_DRIVERS[driverIndex];

  // Wallet → Rewards: customers don't hold NGN per CBN model. They can
  // redeem points for fare credit instead: label + balance reflect that.
  const PAYMENT_OPTS = [
    {
      id:   'points' as const,
      label: t('confirmRide.payPoints'),
      icon: 'gift-outline',
      sub:  pointsBalance != null
              ? t('confirmRide.payPointsSub',  { balance: pointsBalance.toLocaleString() })
              : t('confirmRide.payPointsSubNone'),
      disabled: pointsBalance == null || pointsBalance <= 0,
    },
    {
      id:   'card' as const,
      label: defaultCard ? t('confirmRide.payCard', { last4: defaultCard.last4 }) : t('confirmRide.payCardAdd'),
      icon: 'card-outline',
      sub:  defaultCard ? `${defaultCard.brand} · ${t('confirmRide.payCardDefault')}` : t('confirmRide.payCardAddSub'),
      disabled: false,
    },
    { id: 'banktransfer' as const, label: t('confirmRide.payBank'),     icon: 'business-outline', sub: t('confirmRide.payBankSub'),     disabled: false },
    { id: 'cash'         as const, label: t('confirmRide.payCash'),     icon: 'cash-outline',     sub: t('confirmRide.payCashSub'),     disabled: false },
  ];

  // Books the delivery + (if not cash) kicks off Flutterwave. Returns the
  // real deliveryId from the API so trip-progress can subscribe to its WS
  // room and show the actual route, not the mock fallback trip.
  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const created = await deliveriesApi.create({
        mode:            isRide ? 'ride' : 'cargo',
        pickupAddress:   params.pickup,
        dropoffAddress:  params.dropoff,
        pickupLat:       Number(params.pickupLat)  || undefined,
        pickupLng:       Number(params.pickupLng)  || undefined,
        dropoffLat:      Number(params.dropoffLat) || undefined,
        dropoffLng:      Number(params.dropoffLng) || undefined,
        vehicleType:     params.vehicleId,
        km:              distKm,
        sharedRide:      shared || undefined,
        // Cargo extras: backend ignores when mode='ride'
        weightKg:        params.weightKg ? Number(params.weightKg) : undefined,
        packageCategory: params.category || undefined,
        codAmountNgn:    params.codAmountNgn ? Number(params.codAmountNgn) : undefined,
        // Payment + total snapshot: backend persists the agreed price so
        // ledger reconciliation matches what the customer was shown.
        paymentMethod:   payment,
        agreedTotalNgn:  total,
      } as any);

      const deliveryId = created?.id ?? created?.deliveryId;
      if (!deliveryId) throw new Error(t('confirmRide.errBookingFailed'));

      // For card / bank-transfer, hand off to the hosted Flutterwave flow
      // which redirects back to /payment/[deliveryId] on success.
      if (payment === 'card' || payment === 'banktransfer') {
        try {
          const res = await paymentsApi.initiate(deliveryId, payment, payment === 'banktransfer' ? 'banktransfer' : 'card');
          if (res?.authorizationUrl) {
            router.replace({ pathname: '/(customer)/payment/[deliveryId]', params: { deliveryId, url: res.authorizationUrl } } as any);
            return;
          }
        } catch {
          // Init failed but delivery exists: let user pay on the
          // payment screen, which can retry initiate.
          router.replace({ pathname: '/(customer)/payment/[deliveryId]', params: { deliveryId } } as any);
          return;
        }
      }

      router.replace({
        pathname: '/(customer)/trip-progress',
        params: {
          id:         deliveryId,
          driverId:   driver.id,
          pickup:     params.pickup,
          dropoff:    params.dropoff,
          pickupLat:  params.pickupLat ?? '',
          pickupLng:  params.pickupLng ?? '',
          dropoffLat: params.dropoffLat ?? '',
          dropoffLng: params.dropoffLng ?? '',
          vehicleId:  params.vehicleId,
        },
      });
    } catch (e: any) {
      Alert.alert(
        t('confirmRide.errTitle'),
        e?.message ?? t('confirmRide.errBookingFailed'),
        [{ text: t('common.ok') }],
      );
    } finally {
      setConfirming(false);
    }
  };

  /**
   * Backing out of this screen (audit 2026-08-14).
   *
   * This warned about a ₦50 cancellation fee, but nothing has been
   * booked yet: the delivery is only created in handleConfirm below.
   * There was no delivery to cancel and no fee was ever charged, so the
   * warning was threatening a customer with an invented charge for
   * changing their mind at the quote screen. Backing out here is free
   * because there is nothing to back out of.
   */
  const handleCancel = () => router.back();

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
  const snapPoints = useMemo<(string | number)[]>(() => [240, '92%'], []);

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
        {pickupLat  && <Marker coordinate={{ latitude: pickupLat,  longitude: pickupLng!  }} pinColor="#22C55E" title="Pickup"  description={params.pickup}  />}
        {dropoffLat && <Marker coordinate={{ latitude: dropoffLat, longitude: dropoffLng! }} pinColor="#EF4444" title="Dropoff" description={params.dropoff} />}
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={theme.primary} strokeWidth={4} />
        )}
      </MapView>

      <SafeAreaView edges={['top', 'bottom']} style={styles.topBar}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surface }, Shadows.sm]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <View style={[styles.topTitle, { backgroundColor: theme.surface }, Shadows.sm]}>
          <Text style={[styles.topTitleText, { color: theme.text }]}>{t('confirmRide.title')}</Text>
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
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>

          {/* Driver preview */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <Text style={[styles.cardLabel, { color: theme.textSecond }]}>{t('confirmRide.yourDriver')}</Text>
            <View style={styles.driverRow}>
              <Avatar name={driver.name} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverName, { color: theme.text }]}>{driver.name}</Text>
                <View style={styles.driverMeta}>
                  <Ionicons name="star" size={12} color="#FFBE0B" />
                  <Text style={[styles.metaText, { color: theme.textSecond }]}>{driver.rating}</Text>
                  <Text style={[styles.metaDot, { color: theme.textThird }]}>·</Text>
                  <Text style={[styles.metaText, { color: theme.textSecond }]}>{t('confirmRide.trips', { count: driver.trips })}</Text>
                </View>
              </View>
              <View style={styles.vehiclePill}>
                <Ionicons name={vehicle.icon as any} size={14} color={theme.primary} />
                <Text style={[styles.vehiclePillText, { color: theme.primary }]}>{vehicle.label}</Text>
              </View>
            </View>
            <View style={[styles.plateBadge, { backgroundColor: isDark ? '#1A1A1A' : '#F1F5F9' }]}>
              <Ionicons name="car-outline" size={14} color={theme.textSecond} />
              <Text style={[styles.plateText, { color: theme.text }]}>{driver.vehicle}</Text>
              <Text style={[styles.plateNum, { color: theme.primary }]}>{driver.plate}</Text>
            </View>
          </View>

          {/* Trip summary */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <Text style={[styles.cardLabel, { color: theme.textSecond }]}>{t('confirmRide.tripSummary')}</Text>
            <View style={styles.summaryRow}>
              <View style={[styles.summDot, { backgroundColor: '#22C55E' }]} />
              <Text style={[styles.summAddr, { color: theme.text }]} numberOfLines={2}>{params.pickup}</Text>
            </View>
            <View style={[styles.summConnector, { backgroundColor: theme.border }]} />
            <View style={styles.summaryRow}>
              <View style={[styles.summDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.summAddr, { color: theme.text }]} numberOfLines={2}>{params.dropoff}</Text>
            </View>
            <View style={[styles.summMeta, { borderTopColor: theme.border }]}>
              {distKm > 0 && (
                <View style={styles.summMetaItem}>
                  <Ionicons name="navigate-outline" size={13} color={theme.textSecond} />
                  <Text style={[styles.summMetaText, { color: theme.textSecond }]}>{t('confirmRide.kmAway', { km: distKm.toFixed(1) })}</Text>
                </View>
              )}
              {!!params.durationText && (
                <View style={styles.summMetaItem}>
                  <Ionicons name="time-outline" size={13} color={theme.textSecond} />
                  <Text style={[styles.summMetaText, { color: theme.textSecond }]}>~{params.durationText}</Text>
                </View>
              )}
              <View style={styles.summMetaItem}>
                <Ionicons name="car-outline" size={13} color={theme.textSecond} />
                <Text style={[styles.summMetaText, { color: theme.textSecond }]}>{vehicle.label}</Text>
              </View>
              {isRide && shared && (
                <View style={styles.summMetaItem}>
                  <Ionicons name="people-outline" size={13} color={theme.primary} />
                  <Text style={[styles.summMetaText, { color: theme.primary }]}>{t('request2.shareTitle')}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Payment method */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
            <View style={styles.payHeader}>
              <Text style={[styles.cardLabel, { color: theme.textSecond, marginBottom: 0 }]}>{t('confirmRide.paymentMethod')}</Text>
              <Pressable onPress={() => router.push('/(customer)/payment-methods')}>
                <Text style={[styles.changeText, { color: theme.primary }]}>{t('confirmRide.change')}</Text>
              </Pressable>
            </View>
            <View style={styles.payOptions}>
              {PAYMENT_OPTS.map((opt) => (
                <Pressable
                  key={opt.id}
                  disabled={opt.disabled}
                  style={[
                    styles.payOpt,
                    { borderColor: payment === opt.id ? theme.primary : theme.border },
                    payment === opt.id && { backgroundColor: isDark ? theme.surfaceSecond : '#EFF6FF' },
                    opt.disabled && { opacity: 0.5 },
                  ]}
                  onPress={() => setPayment(opt.id)}
                >
                  <View style={[styles.payIcon, { backgroundColor: theme.surfaceSecond }]}>
                    <Ionicons name={opt.icon as any} size={18} color={payment === opt.id ? theme.primary : theme.textSecond} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.payLabel, { color: theme.text }]}>{opt.label}</Text>
                    <Text style={[styles.paySub, { color: theme.textSecond }]}>{opt.sub}</Text>
                  </View>
                  {payment === opt.id && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
                </Pressable>
              ))}
            </View>
          </View>

          {/* Promo code */}
          <Pressable
            style={[styles.promoRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
            onPress={() => router.push('/(customer)/promo')}
          >
            <Ionicons name="pricetag-outline" size={18} color={theme.primary} />
            <Text style={[styles.promoText, { color: theme.text }]}>{t('confirmRide.addPromo')}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
          </Pressable>

          {/* Total + Confirm CTA */}
          <View style={styles.ctaRow}>
            <View style={styles.ctaTotal}>
              <Text style={[styles.ctaTotalLabel, { color: theme.textSecond }]}>{t('confirmRide.total')}</Text>
              <Text style={[styles.ctaTotalValue, { color: theme.primary }]}>₦{total.toLocaleString()}</Text>
            </View>
            <Button
              label={t('confirmRide.confirmRide')}
              onPress={handleConfirm}
              loading={confirming}
              size="lg"
              style={{ flex: 1 }}
              leftIcon={<Ionicons name="car" size={18} color="#fff" />}
            />
          </View>

          {/* Back out of the quote. Nothing is booked until Confirm, so
              this carries no fee and must not imply one. */}
          <Pressable onPress={handleCancel} style={styles.cancelLink}>
            <Text style={[styles.cancelLinkText, { color: theme.error ?? '#DC2626' }]}>
              {t('confirmRide.cancelLink')}
            </Text>
          </Pressable>
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

  sheetContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.md },

  card:        { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  cardLabel:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },

  driverRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  driverName:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  driverMeta:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText:    { fontSize: FontSize.sm },
  metaDot:     { fontSize: FontSize.sm },
  vehiclePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  vehiclePillText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  plateBadge:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md },
  plateText:   { flex: 1, fontSize: FontSize.sm },
  plateNum:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, letterSpacing: 1 },

  summaryRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  summDot:       { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  summAddr:      { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.medium },
  summConnector: { width: 2, height: 12, marginLeft: 4, marginVertical: 3 },
  summMeta:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg, paddingTop: Spacing.sm, marginTop: Spacing.sm, borderTopWidth: 1 },
  summMetaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  summMetaText:  { fontSize: FontSize.xs },

  payHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  changeText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  payOptions: { gap: Spacing.sm },
  payOpt:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  payIcon:    { width: 36, height: 36, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  payLabel:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  paySub:     { fontSize: FontSize.xs },

  promoRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  promoText: { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.medium },

  ctaRow:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.sm },
  cancelLink:    { alignSelf: 'center', paddingVertical: Spacing.sm, marginTop: 4 },
  cancelLinkText:{ fontSize: FontSize.sm, fontWeight: FontWeight.medium, textDecorationLine: 'underline' },
  ctaTotal:      {},
  ctaTotalLabel: { fontSize: FontSize.xs },
  ctaTotalValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
});

const DARK_MAP = [
  { elementType: 'geometry',           stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#444444' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000000' }] },
  { featureType: 'road',               elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'water',              elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
];
