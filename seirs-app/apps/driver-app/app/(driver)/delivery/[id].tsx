/**
 * Driver · Active Trip: single-stop OR multi-stop view.
 *
 * Fetches the real Delivery (with stops eager-loaded) from the backend.
 * If `isMultiStop`, renders an ordered checklist with per-stop Arrived /
 * Delivered buttons; otherwise renders a single dropoff card.
 *
 * The driver flows top-to-bottom through stops in sequenceOrder. Each
 * stop has its own status: pending → en_route → arrived → delivered.
 * When the last stop flips to delivered, the parent Delivery auto-
 * closes server-side (see business.service.markStopDelivered).
 */
import {
  Image,
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useCallback } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import * as ImagePicker from 'expo-image-picker';
import { driversApi, uploadApi } from '@/services/api';

import { naira } from '@/utils/money';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

interface Stop {
  id:             string;
  sequenceOrder:  number;
  address:        string;
  lat:            number;
  lng:            number;
  recipientName:  string;
  recipientPhone: string;
  notes?:         string | null;
  estimatedDwellMinutes: number;
  /**
   * Per-package fields (multi-package rebuild 2026-08-16). A business run
   * is one package per stop, so the driver needs to see WHICH parcel
   * belongs at this door: its photo, what it is, its weight, and the
   * public code the receiver is tracking.
   */
  packagePhotoUrls?:     string[] | null;
  packageDescription?:   string | null;
  weightKg?:             number | string | null;
  packageTrackingCode?:  string | null;
  destinationStoreId?:   string | null;
  status:         'pending' | 'en_route' | 'arrived' | 'delivered' | 'failed';
  arrivedAt?:     string | null;
  deliveredAt?:   string | null;
}

interface DeliveryDetail {
  id:                string;
  trackingCode:      string;
  isMultiStop:       boolean;
  pickupAddress:     string;
  pickupLat:         number;
  pickupLng:         number;
  dropoffAddress?:   string | null;
  dropoffLat?:       number | null;
  dropoffLng?:       number | null;
  status:            string;
  vehicleType?:      string;
  categoryCode?:     string;
  weightKg?:         number;
  packageDescription?: string;
  price:             number;
  driverEarnings:    number;
  distanceKm:        number;
  estimatedDriveMinutes?: number;
  estimatedDwellMinutes?: number;
  estimatedTotalMinutes?: number;
  routeWasAutoOptimized?: boolean;
  priceBreakdown?:   any;
  /**
   * Which zone tier charged on this run (2026-08-31). Used to say what
   * the rider's surcharge share was FOR. Absent on bookings made before
   * the column existed, so the label falls back to the bare wording.
   */
  zoneTier?:         string | null;
  stops:             Stop[];
}

const STATUS_META = (): Record<string, { label: string; color: string }> => ({
  pending:   { label: tr('auto.deliveryDetail.pending', 'Pending'),     color: '#D97706' },
  en_route:  { label: tr('auto.deliveryDetail.enRoute', 'En route'),    color: '#3A7BD5' },
  arrived:   { label: tr('auto.deliveryDetail.arrived', 'Arrived'),     color: '#0F2B4C' },
  delivered: { label: tr('auto.history.delivered', 'Delivered'),   color: '#16A34A' },
  failed:    { label: tr('auto.deliveryDetail.failed', 'Failed'),      color: '#DC2626' },
});

/**
 * The engine's zone tiers, in a rider's words. Shorter than the sender
 * facing wording: this sits inside a bracket on an earnings line, and
 * the rider only needs to know which kind of distance paid them.
 */
const ZONE_TIER_LABEL: Record<string, string> = {
  intraStateLongHaul: 'long trip',
  interStateAdjacent: 'next state',
  interStateDistant:  'far state',
  crossZone:          'cross-country',
  interState:         'interstate',
};

export default function DeliveryDetailScreen() {
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [acting,   setActing]   = useState<string | null>(null);  // stopId currently transitioning

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await driversApi.getDelivery(id);
      setDelivery(d);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load trip.');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const openMaps = (lat: number, lng: number, addressFallback: string) => {
    const dest = lat && lng ? `${lat},${lng}` : encodeURIComponent(addressFallback);
    // job/[id].tsx already asks this as a sheet, so a rider met two
    // different Navigate dialogs on the same run. This one also sat at
    // Android's three-button ceiling (2026-08-25 dialog sweep).
    setSheet({
      title: tr('auto.deliveryDetail.navigateThere', 'Navigate there'),
      message: tr('auto.deliveryDetail.whichAppShouldTakeYou', 'Which app should take you?'),
      options: [
        { label: tr('auto.deliveryDetail.googleMaps', 'Google Maps'), variant: 'primary', icon: 'navigate-outline', onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`) },
        { label: tr('auto.deliveryDetail.waze', 'Waze'),        icon: 'car-outline', onPress: () => Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`) },
      ],
    });
  };

  /**
   * The whole remaining run, handed to Google Maps in one link.
   *
   * A multi-stop run used to mean coming back into this screen and
   * pressing Navigate again at every drop, so a six-drop run was six
   * round trips through the app while the driver was in traffic. The
   * Maps URL API takes waypoints, so the rest of the run goes over in
   * sequence order with the last undelivered stop as the destination.
   *
   * Origin is left out on purpose: Maps then starts from wherever the
   * driver actually is, which is the only correct answer mid-run.
   *
   * Waze has no multi-stop URL, so this one is Google only. Per-stop
   * Navigate still offers both.
   */
  const openWholeRun = () => {
    if (!delivery) return;

    const legs: Array<{ lat: number; lng: number }> = [];
    // Before pickup the run starts at the pickup, not at the first drop.
    if (delivery.status === 'assigned' && Number.isFinite(delivery.pickupLat) && Number.isFinite(delivery.pickupLng)) {
      legs.push({ lat: delivery.pickupLat, lng: delivery.pickupLng });
    }
    for (const st of delivery.stops) {
      if (st.status === 'delivered' || st.status === 'failed') continue;
      if (!Number.isFinite(st.lat) || !Number.isFinite(st.lng)) continue;
      legs.push({ lat: st.lat, lng: st.lng });
    }
    if (legs.length < 2) {
      alertDialog('Nothing left to route', 'Use Navigate on the stop itself.');
      return;
    }

    // The URL API carries a destination plus 9 waypoints. Past that we
    // hand over as many as fit and the driver comes back for the rest,
    // which still beats one stop at a time.
    const capped = legs.slice(0, 10);
    const dest   = capped[capped.length - 1];
    const mid    = capped.slice(0, -1).map(l => `${l.lat},${l.lng}`).join('|');
    const url =
      'https://www.google.com/maps/dir/?api=1&travelmode=driving'
      + `&destination=${dest.lat},${dest.lng}`
      + `&waypoints=${encodeURIComponent(mid)}`;

    Linking.openURL(url).catch(() =>
      alertDialog('Could not open Maps', 'Navigate to each stop instead.'));
  };

  const handleArrived = async (stop: Stop) => {
    if (!delivery || acting) return;
    setActing(stop.id);
    try {
      await driversApi.markStopArrived(delivery.id, stop.id);
      await load();
    } catch (e: any) {
      alertDialog('Could not mark arrived', e?.message ?? 'Try again.');
    } finally { setActing(null); }
  };

  /**
   * Proof of delivery on a multi-drop stop.
   *
   * This carried a standing "TODO Phase 5b" and shipped the transition
   * with no proof at all, so a business run with eight drops closed
   * eight doors on the driver's word alone while the single-drop screen
   * (active.tsx) had required a photo for months (2026-08-23 sweep,
   * D-9.2). The backend was never the blocker: markStopDelivered has
   * taken proofPhotoUrls since it was written and writes it onto the
   * stop row. Only the client half was missing.
   *
   * The photo is required, exactly as it is on active.tsx, because a
   * drop with no proof is the one a dispute turns on. The camera is
   * opened directly rather than the library: proof means the parcel at
   * the door now, not a picture chosen from the gallery afterwards.
   */
  const handleDelivered = async (stop: Stop) => {
    if (!delivery || acting) return;

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      alertDialog(
        'Camera access required',
        'A proof photo is needed to close a stop. Enable camera access for SEIRS Driver and try again.',
      );
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (shot.canceled || !shot.assets?.[0]) return;   // driver backed out, stop stays open

    setActing(stop.id);
    try {
      const uploaded = await uploadApi.file(shot.assets[0].uri, 'image/jpeg', 'proof');
      await driversApi.markStopDelivered(delivery.id, stop.id, { proofPhotoUrls: [uploaded.url] });
      await load();
    } catch (e: any) {
      alertDialog('Could not mark delivered', e?.message ?? 'Try again.');
    } finally { setActing(null); }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </SafeAreaView>
    );
  }

  if (error || !delivery) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.textThird} />
        <Text style={[styles.errorText, { color: theme.textSecond }]}>{error ?? tx9('auto.deliveryDetail.tripNotFound', 'Trip not found')}</Text>
        <Pressable style={[styles.backLink, { backgroundColor: theme.accent }]} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>{tr('auto.deliveryDetail.back', 'Back')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const pending  = delivery.stops.filter(s => s.status === 'pending' || s.status === 'en_route').length;
  const arrived  = delivery.stops.filter(s => s.status === 'arrived').length;
  const done     = delivery.stops.filter(s => s.status === 'delivered').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        {/* Was hardcoded to "Active trip" for every single-stop job, so a
            rider opening a finished delivery out of their history was told
            it was active and went looking for something to do. Found on
            device 2026-08-31 on a delivery completed a week earlier. */}
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {delivery.isMultiStop
            ? tx9('auto.deliveryDetail.stopTrip', '{{length}}-stop trip', { length: delivery.stops.length })
            : delivery.status === 'delivered' ? tx9('auto.deliveryDetail.completedTrip', 'Completed trip')
            : delivery.status === 'cancelled' ? tx9('auto.deliveryDetail.cancelledTrip', 'Cancelled trip')
            : delivery.status === 'failed'    ? tx9('auto.deliveryDetail.failedTrip', 'Failed trip')
            : tx9('auto.deliveryDetail.activeTrip', 'Active trip')}
        </Text>
        <Pressable
          style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}
          onPress={() => router.push('/(driver)/status-broadcast' as any)}
          accessibilityLabel={tx('auto.id.broadcastStatus', 'Broadcast status')}
        >
          <Ionicons name="radio-outline" size={20} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Tracking + status summary */}
        <View style={[styles.trackingCard, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.trackingCode, { color: theme.text }]}>{delivery.trackingCode}</Text>
            <Text style={[styles.trackingSub, { color: theme.textSecond }]}>
              {/* First name only: the surname is the lookup key this
                  rule exists to withhold (sweep 2026-08-23). */}
              {(delivery as any).kind === 'ride' ? `RIDE · ${(delivery as any).receiverFirstName || 'passenger'}` : (delivery.packageDescription ?? delivery.categoryCode ?? tx9('auto.deliveryDetail.delivery', 'Delivery'))}
            </Text>
          </View>
          {delivery.routeWasAutoOptimized && (
            <View style={styles.optBadge}>
              <Ionicons name="navigate" size={11} color="#3A7BD5" />
              <Text style={styles.optBadgeText}>{tx('auto.id.optimised', 'Optimised')}</Text>
            </View>
          )}
        </View>

        {/* Earnings + distance. The third tile printed "ETA ~N min" and is
            gone: SEIRS promises no arrival time anywhere, and a number on a
            stat tile reads as a commitment however it was labelled. Same
            rule that removed the "~? min" placeholder from job/[id]. */}
        <View style={[styles.statsRow]}>
          <View style={[styles.statCard, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Text style={[styles.statLabel, { color: theme.textSecond }]}>{tx('auto.id.earning', 'Earning')}</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {naira(delivery.driverEarnings)}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Text style={[styles.statLabel, { color: theme.textSecond }]}>{tx('auto.id.distance', 'Distance')}</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {Number(delivery.distanceKm ?? 0).toFixed(1)} km
            </Text>
          </View>
        </View>

        {delivery.isMultiStop && (
          <>
            <Text style={[styles.progressLine, { color: theme.textSecond }]}>
              {done}/{delivery.stops.length} delivered · {arrived} arrived · {pending} pending
            </Text>
            <Pressable
              style={[styles.navBtn, { backgroundColor: theme.accent, marginTop: Spacing.md }]}
              onPress={openWholeRun}
            >
              <Ionicons name="navigate-circle" size={16} color="#fff" />
              <Text style={styles.navBtnText}>
                {tr('auto.deliveryDetail.navigateTheRestOfThe', 'Navigate the rest of the run (')}{pending + arrived} stops)
              </Text>
            </Pressable>
          </>
        )}

        {/* Pickup card */}
        <View style={[styles.locationCard, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
          <View style={styles.locationHeader}>
            <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
            <Text style={[styles.locationLabel, { color: theme.textSecond }]}>{tx('auto.id.pickup', 'Pickup')}</Text>
          </View>
          <Text style={[styles.locationAddress, { color: theme.text }]}>{delivery.pickupAddress}</Text>
          <Pressable
            style={[styles.navBtn, { backgroundColor: theme.accent }]}
            onPress={() => openMaps(delivery.pickupLat, delivery.pickupLng, delivery.pickupAddress)}
          >
            <Ionicons name="navigate" size={14} color="#fff" />
            <Text style={styles.navBtnText}>{tx('auto.id.navigateToPickup', 'Navigate to pickup')}</Text>
          </Pressable>
        </View>

        {/* Stops list (multi-stop) OR single dropoff */}
        {delivery.stops.length > 0 ? (
          delivery.stops.map((stop, idx) => {
            const meta = STATUS_META()[stop.status] ?? STATUS_META().pending;
            const isCurrent = idx === delivery.stops.findIndex(s => s.status !== 'delivered');
            return (
              <View
                key={stop.id}
                style={[
                  styles.stopCard,
                  { backgroundColor: theme.surfaceSecond, borderColor: isCurrent ? theme.accent : theme.border },
                  isCurrent && { borderWidth: 2 },
                ]}
              >
                <View style={styles.stopHeader}>
                  <View style={[styles.stopBadge, { backgroundColor: meta.color }]}>
                    <Text style={styles.stopBadgeText}>
                      {stop.packageTrackingCode ? `Package ${stop.sequenceOrder}` : `Stop ${stop.sequenceOrder}`}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: meta.color + '22' }]}>
                    <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>

                {/* What the driver is actually carrying to this door. The
                    photo is the sender's own picture of the parcel, so a
                    five-package run cannot be mixed up at the doorstep. */}
                {(stop.packagePhotoUrls?.length || stop.packageDescription) && (
                  <View style={styles.pkgRow}>
                    {!!stop.packagePhotoUrls?.length && (
                      <Image source={{ uri: stop.packagePhotoUrls[0] }} style={styles.pkgThumb} />
                    )}
                    <View style={{ flex: 1 }}>
                      {!!stop.packageDescription && (
                        <Text style={[styles.pkgDesc, { color: theme.text }]} numberOfLines={2}>
                          {stop.packageDescription}
                        </Text>
                      )}
                      <Text style={[styles.pkgMeta, { color: theme.textThird }]} numberOfLines={1}>
                        {stop.weightKg != null ? `${Number(stop.weightKg)}kg` : ''}
                        {stop.weightKg != null && stop.packageTrackingCode ? ' · ' : ''}
                        {stop.packageTrackingCode ?? ''}
                      </Text>
                    </View>
                  </View>
                )}

                {!!stop.destinationStoreId && (
                  <View style={[styles.storeFlag, { backgroundColor: theme.accent + '18' }]}>
                    <Ionicons name="storefront-outline" size={13} color={theme.accent} />
                    <Text style={[styles.storeFlagText, { color: theme.accent }]}>
                      {tr('auto.deliveryDetail.handToTheCounterStaff', 'Hand to the counter staff, not a customer')}
                    </Text>
                  </View>
                )}

                <Text style={[styles.stopAddress, { color: theme.text }]}>{stop.address}</Text>
                <Text style={[styles.stopRecipient, { color: theme.textSecond }]}>
                  {stop.recipientName} · {stop.recipientPhone}
                </Text>
                {stop.notes && (
                  <Text style={[styles.stopNotes, { color: theme.textThird }]}>
                    Note: {stop.notes}
                  </Text>
                )}
                <Text style={[styles.stopDwell, { color: theme.textThird }]}>
                  Expected ~{stop.estimatedDwellMinutes} min handling
                </Text>

                <View style={styles.stopActions}>
                  <Pressable
                    style={[styles.stopActionBtn, { backgroundColor: theme.surfaceThird ?? '#E5E7EB' }]}
                    onPress={() => openMaps(stop.lat, stop.lng, stop.address)}
                  >
                    <Ionicons name="navigate" size={14} color={theme.text} />
                    <Text style={[styles.stopActionText, { color: theme.text }]}>{tx('auto.id.navigate', 'Navigate')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.stopActionBtn, { backgroundColor: theme.surfaceThird ?? '#E5E7EB' }]}
                    onPress={() => Linking.openURL(`tel:${stop.recipientPhone}`)}
                  >
                    <Ionicons name="call" size={14} color={theme.text} />
                    <Text style={[styles.stopActionText, { color: theme.text }]}>{tr('auto.active.call', 'Call')}</Text>
                  </Pressable>
                </View>

                {/* State machine: pending/en_route → Arrived; arrived → Delivered. */}
                {stop.status === 'pending' || stop.status === 'en_route' ? (
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
                    disabled={acting === stop.id}
                    onPress={() => handleArrived(stop)}
                  >
                    {acting === stop.id
                      ? <ActivityIndicator color="#fff" />
                      : <>
                          <Ionicons name="flag" size={16} color="#fff" />
                          <Text style={styles.primaryBtnText}>{tr('auto.deliveryDetail.iVeArrived', 'I\'ve arrived')}</Text>
                        </>}
                  </Pressable>
                ) : stop.status === 'arrived' ? (
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: '#16A34A' }]}
                    disabled={acting === stop.id}
                    onPress={() => handleDelivered(stop)}
                  >
                    {acting === stop.id
                      ? <ActivityIndicator color="#fff" />
                      : <>
                          <Ionicons name="camera" size={16} color="#fff" />
                          <Text style={styles.primaryBtnText}>{tx('auto.id.photoAndDeliver', 'Photo and deliver')}</Text>
                        </>}
                  </Pressable>
                ) : (
                  <View style={[styles.doneBanner]}>
                    <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                    <Text style={[styles.doneText, { color: '#16A34A' }]}>
                      {stop.deliveredAt ? `Delivered ${new Date(stop.deliveredAt).toLocaleTimeString()}` : tx9('auto.history.delivered', 'Delivered')}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        ) : delivery.dropoffAddress ? (
          // Legacy single-leg fallback for old bookings created before the
          // multi-stop refactor: show dropoff as a single card.
          <View style={[styles.locationCard, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <View style={styles.locationHeader}>
              <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.locationLabel, { color: theme.textSecond }]}>{tx('auto.id.dropoff', 'Dropoff')}</Text>
            </View>
            <Text style={[styles.locationAddress, { color: theme.text }]}>{delivery.dropoffAddress}</Text>
            {delivery.dropoffLat != null && (
              <Pressable
                style={[styles.navBtn, { backgroundColor: theme.accent }]}
                onPress={() => openMaps(delivery.dropoffLat!, delivery.dropoffLng!, delivery.dropoffAddress!)}
              >
                <Ionicons name="navigate" size={14} color="#fff" />
                <Text style={styles.navBtnText}>{tx('auto.id.navigateToDropoff', 'Navigate to dropoff')}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {/* Earnings breakdown (if priceBreakdown snapshot is present) */}
        {delivery.priceBreakdown?.driver && (
          <View style={[styles.locationCard, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Text style={[styles.locationLabel, { color: theme.textSecond, marginBottom: Spacing.sm }]}>
              {tr('auto.deliveryDetail.earningsBreakdown', 'Earnings breakdown')}
            </Text>
            <BreakdownLine theme={theme} label={tx('auto.id.baseFare', 'Base fare')}        value={delivery.priceBreakdown.driver.base} />
            <BreakdownLine theme={theme} label={tx('auto.id.distanceLabour', 'Distance labour')}  value={delivery.priceBreakdown.driver.distanceLabour} />
            <BreakdownLine theme={theme} label={tx('auto.id.fuelReimbursement', 'Fuel reimbursement')} value={delivery.priceBreakdown.driver.distanceFuel} />
            {delivery.priceBreakdown.driver.stopBonuses > 0 && (
              <BreakdownLine theme={theme} label={tx('auto.id.stopBonuses', 'Stop bonuses')} value={delivery.priceBreakdown.driver.stopBonuses} />
            )}
            {delivery.priceBreakdown.driver.surchargeShare > 0 && (
              /**
               * Say what the share was FOR (2026-08-31).
               *
               * This read "Surcharge share" and a number. A rider on a
               * Lagos to Kano run saw extra money with no reason attached,
               * which is the same complaint the sender had about the
               * unnamed zone line, pointing the other way: an unexplained
               * credit reads like an error that might be clawed back.
               *
               * The tier is on the delivery itself now, so the label can
               * name it. Falls back to the bare wording when the booking
               * predates the column.
               */
              <BreakdownLine
                theme={theme}
                label={delivery.zoneTier
                  ? tx9('auto.deliveryDetail.surchargeShare', 'Surcharge share ({{v0}})', { v0: ZONE_TIER_LABEL[delivery.zoneTier] ?? 'distance' })
                  : tx9('auto.deliveryDetail.surchargeShare2', 'Surcharge share')}
                value={delivery.priceBreakdown.driver.surchargeShare}
              />
            )}
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <BreakdownLine theme={theme} label={tx('auto.id.total', 'Total')} value={delivery.priceBreakdown.driver.total} bold />
          </View>
        )}

      </ScrollView>
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

function BreakdownLine({ theme, label, value, bold }: { theme: any; label: string; value: number; bold?: boolean }) {
  return (
    <View style={styles.brkRow}>
      <Text style={[styles.brkLabel, { color: theme.textSecond, fontWeight: bold ? '700' : '400' }]}>{label}</Text>
      <Text style={[styles.brkValue, { color: theme.text, fontWeight: bold ? '700' : '500' }]}>
        {naira(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: FontSize.base, marginTop: Spacing.md },
  backLink:  { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md, marginTop: Spacing.md },
  backLinkText: { color: '#fff', fontWeight: FontWeight.semibold as any },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.sm },
  title: { flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },

  content: { padding: Spacing.md, paddingBottom: Spacing.xl, gap: Spacing.md },

  trackingCard: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, gap: Spacing.sm },
  trackingCode: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any, fontFamily: 'Menlo' },
  trackingSub:  { fontSize: FontSize.sm, marginTop: 2 },
  optBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#3A7BD580' },
  optBadgeText: { fontSize: 10, color: '#3A7BD5', fontWeight: FontWeight.bold as any },

  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  statCard: { flex: 1, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center' },
  statLabel: { fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any, marginTop: 2 },

  progressLine: { fontSize: FontSize.sm, textAlign: 'center', marginVertical: -Spacing.sm },

  locationCard: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, gap: Spacing.sm },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  locationLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold as any, textTransform: 'uppercase', letterSpacing: 0.4 },
  locationAddress: { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any, marginTop: 4 },
  navBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm, borderRadius: Radius.md, marginTop: 4 },
  navBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },

  // Stop cards
  stopCard: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, gap: 6 },
  stopHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stopBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  stopBadgeText: { fontSize: FontSize.xs, color: '#fff', fontWeight: FontWeight.bold as any },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  statusPillText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  pkgRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  pkgThumb: { width: 52, height: 52, borderRadius: 10 },
  pkgDesc:  { fontSize: 13, fontWeight: '700' },
  pkgMeta:  { fontSize: 11, marginTop: 2, letterSpacing: 0.3 },
  storeFlag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, marginBottom: 6,
  },
  storeFlagText: { fontSize: 11, fontWeight: '700' },
  stopAddress: { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any, marginTop: 4 },
  stopRecipient: { fontSize: FontSize.sm },
  stopNotes: { fontSize: FontSize.sm, fontStyle: 'italic' },
  stopDwell: { fontSize: FontSize.xs, marginTop: 2 },
  stopActions: { flexDirection: 'row', gap: 8, marginTop: Spacing.sm },
  stopActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.sm },
  stopActionText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md, marginTop: Spacing.sm },
  primaryBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
  doneBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm, marginTop: Spacing.sm, backgroundColor: '#DCFCE7', borderRadius: Radius.md },
  doneText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },

  // Breakdown
  brkRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  brkLabel: { fontSize: FontSize.sm },
  brkValue: { fontSize: FontSize.sm, fontVariant: ['tabular-nums'] },
  divider: { height: 1, marginVertical: 6 },
});
