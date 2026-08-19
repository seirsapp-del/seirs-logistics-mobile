import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useDeliveryTracking } from '@/hooks/useDeliveryTracking';
import { deliveriesApi, dropoffApi } from '@/services/api';
import DeliveryTrackMap from '@/components/DeliveryTrackMap';

// Labels looked up via t(`tracking.step${cap}`) at render so language
// switches reflect live.
const STATUS_CONFIG: Record<string, {
  labelKey: string; step: number;
  gradient: readonly [string, string];
  icon: string;
}> = {
  // Brand palette only (audit 2026-08-10: purple + off-brand blues removed).
  pending:    { labelKey: 'tracking.stepPending',   step: 1, gradient: ['#3A7BD5', '#2A5FA8'], icon: 'search' },
  assigned:   { labelKey: 'tracking.stepAssigned',  step: 2, gradient: ['#3A7BD5', '#1F4E8C'], icon: 'navigate' },
  picked_up:  { labelKey: 'tracking.stepPickedUp',  step: 3, gradient: ['#FFBE0B', '#D99E00'], icon: 'cube' },
  in_transit: { labelKey: 'tracking.stepInTransit', step: 4, gradient: ['#0F2B4C', '#1A3A63'], icon: 'navigate' },
  delivered:  { labelKey: 'tracking.stepDelivered', step: 5, gradient: ['#16A34A', '#15803D'], icon: 'checkmark-circle' },
  failed:     { labelKey: 'tracking.stepFailed',    step: 0, gradient: ['#EF4444', '#B91C1C'], icon: 'alert-circle' },
  cancelled:  { labelKey: 'tracking.stepCancelled', step: 0, gradient: ['#6B7280', '#4B5563'], icon: 'close-circle' },
};

const STEP_KEYS = ['tracking.shortFinding', 'tracking.shortAssigned', 'tracking.shortPickedUp', 'tracking.shortInTransit', 'tracking.shortDelivered'];

export default function TrackScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const params = useLocalSearchParams<{ code?: string }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [code,         setCode]         = useState(params.code ?? '');
  const [deliveryId,   setDeliveryId]   = useState<string | null>(null);
  const [deliveryData, setDeliveryData] = useState<any>(null);
  const [searching,    setSearching]    = useState(false);
  const [notFound,     setNotFound]     = useState(false);
  const [redirectOpen,  setRedirectOpen]  = useState(false);
  const [redirectStores, setRedirectStores] = useState<any[]>([]);
  const [redirectBusy,  setRedirectBusy]  = useState(false);

  // Mid-flight rescue (founder 2026-08-10): when the RECIPIENT is not
  // available, the customer can redirect the drop-off to a partner
  // store NEAR THE ORIGINAL DROPOFF (not near the customer's phone).
  // One redirect per delivery: the backend rejects a second attempt.
  const openRedirect = async () => {
    setRedirectOpen(true);
    try {
      const res = await dropoffApi.directory(
        deliveryData?.dropoffLat ?? undefined,
        deliveryData?.dropoffLng ?? undefined,
      );
      setRedirectStores((res?.items ?? []).slice(0, 8));
    } catch {
      setRedirectStores([]);
    }
  };

  const confirmRedirect = (store: any) => {
    Alert.alert(
      'Redirect to this store?',
      `${store.storeName}\n${store.storeAddress}\n\nUse this only when the recipient cannot receive the package. ` +
      `The driver will deliver to this store instead, and the recipient collects it with their code. ` +
      `You can only redirect once per delivery.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redirect',
          onPress: async () => {
            setRedirectBusy(true);
            try {
              await deliveriesApi.redirectToStore(deliveryData.id, store.id);
              setRedirectOpen(false);
              Alert.alert('Redirected', `The driver now delivers to ${store.storeName}. The recipient collects with their code.`);
              handleSearch();
            } catch (e: any) {
              Alert.alert('Could not redirect', e?.message ?? 'Please try again or contact support.');
            } finally {
              setRedirectBusy(false);
            }
          },
        },
      ],
    );
  };

  const { driverLocation, deliveryStatus, assignedDriver, isConnected } =
    useDeliveryTracking(deliveryId);

  useEffect(() => {
    if (params.code) handleSearch();
  }, []);

  const currentStatus = deliveryStatus ?? deliveryData?.status ?? null;
  const statusInfo    = currentStatus ? STATUS_CONFIG[currentStatus] : null;

  const handleSearch = async () => {
    if (!code.trim()) return;
    setSearching(true);
    setNotFound(false);
    try {
      const data = await deliveriesApi.track(code.trim().toUpperCase());
      setDeliveryData(data);
      setDeliveryId(data.id);
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xl }}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Track Package</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            Enter your tracking code
          </Text>
        </View>

        {/* Search bar */}
        <View style={[styles.searchCard, { backgroundColor: theme.surface }, Shadows.sm]}>
          <View style={[styles.searchInputWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Ionicons name="search-outline" size={18} color={theme.textThird} style={{ marginRight: Spacing.sm }} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="e.g. SRS-AB12CD34"
              placeholderTextColor={theme.textThird}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
            />
          </View>
          <Pressable
            style={[styles.searchBtn, { backgroundColor: theme.primary }]}
            onPress={handleSearch}
            disabled={searching}
          >
            {searching
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.searchBtnText}>Track</Text>}
          </Pressable>
        </View>

        {notFound && (
          <View style={[styles.notFoundBox, { backgroundColor: theme.error + '15', borderColor: theme.error + '30' }]}>
            <Ionicons name="alert-circle-outline" size={16} color={theme.error} />
            <Text style={[styles.notFoundText, { color: theme.error }]}>
              No delivery found with that code.
            </Text>
          </View>
        )}

        {/* Result */}
        {deliveryData && (
          <>
            {/* Status card */}
            <View style={[styles.cardWrap, Shadows.md]}>
              <LinearGradient
                colors={statusInfo?.gradient ?? ['#A1A1AA', '#71717A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statusCard}
              >
                <View style={styles.statusIconWrap}>
                  <Ionicons name={statusInfo?.icon as any ?? 'cube'} size={32} color="#fff" />
                </View>
                <Text style={styles.statusLabel}>{statusInfo ? t(statusInfo.labelKey) : t('common.loading')}</Text>
                <Text style={styles.trackingCode}>{deliveryData.trackingCode}</Text>
                {isConnected && (
                  <View style={styles.livePill}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                )}
              </LinearGradient>
            </View>

            {/* Progress steps */}
            <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{t('tracking.title')}</Text>
              {STEP_KEYS.map((stepKey, i) => {
                const stepNum    = i + 1;
                const currentStep = statusInfo?.step ?? 0;
                const done       = stepNum < currentStep;
                const active     = stepNum === currentStep;
                const pending    = stepNum > currentStep;
                return (
                  <View key={stepKey} style={{ position: 'relative' }}>
                    <View style={styles.stepRow}>
                      <View style={[
                        styles.stepDot,
                        done    && { backgroundColor: '#22C55E' },
                        active  && { backgroundColor: theme.primary },
                        pending && { backgroundColor: theme.border },
                      ]}>
                        {done
                          ? <Ionicons name="checkmark" size={14} color="#fff" />
                          : <Text style={styles.stepNum}>{stepNum}</Text>}
                      </View>
                      <Text style={[
                        styles.stepLabel,
                        { color: pending ? theme.textSecond : theme.text },
                        active && { fontWeight: FontWeight.bold },
                      ]}>
                        {t(stepKey)}
                      </Text>
                    </View>
                    {i < STEP_KEYS.length - 1 && (
                      <View style={[styles.stepLine, { backgroundColor: done ? '#22C55E' : theme.border }]} />
                    )}
                  </View>
                );
              })}
            </View>

            {/* The map. Sits above the driver card because "where is it"
                is the question this screen exists to answer, and the
                socket was already delivering the answer with nowhere to
                put it. */}
            <View style={[styles.card, { backgroundColor: theme.surface, padding: 0, overflow: 'hidden' }, Shadows.sm]}>
              <DeliveryTrackMap
                pickup={{ lat: deliveryData.pickupLat, lng: deliveryData.pickupLng }}
                dropoff={{ lat: deliveryData.dropoffLat, lng: deliveryData.dropoffLng }}
                driver={driverLocation}
                isDark={isDark}
                theme={theme}
              />
            </View>

            {/* Driver card */}
            {(assignedDriver ?? deliveryData.driver) && (
              <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Your Rider</Text>
                <View style={styles.driverRow}>
                  <View style={[styles.driverAvatar, { backgroundColor: theme.primary }]}>
                    <Text style={styles.driverAvatarText}>
                      {(assignedDriver?.name ?? deliveryData.driver?.user?.name ?? 'D')[0]}
                    </Text>
                  </View>
                  <View style={styles.driverInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.driverName, { color: theme.text }]}>
                        {assignedDriver?.name ?? deliveryData.driver?.user?.name}
                      </Text>
                      {/* Verified Pro badge: the Premium perk customers
                          were promised (Spec V8 §2.13), now real. */}
                      {(deliveryData.driver?.verifiedPro || (assignedDriver as any)?.verifiedPro) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#0F2B4C', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Ionicons name="shield-checkmark" size={10} color="#FFBE0B" />
                          <Text style={{ color: '#FFBE0B', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 }}>PRO</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.driverMeta}>
                      <Text style={[styles.driverMetaText, { color: theme.textSecond }]}>
                        {assignedDriver?.vehicleType ?? deliveryData.driver?.vehicleType}
                      </Text>
                      <View style={styles.ratingRow}>
                        <Ionicons name="star" size={12} color="#FFBE0B" />
                        <Text style={[styles.driverMetaText, { color: theme.textSecond }]}>
                          {(assignedDriver?.rating ?? deliveryData.driver?.rating ?? 0).toFixed(1)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                {driverLocation && (
                  <View style={[styles.liveLocationRow, { backgroundColor: theme.surfaceSecond }]}>
                    <Ionicons name="location" size={14} color={theme.primary} />
                    <Text style={[styles.liveLocationText, { color: theme.textSecond }]}>
                      Driver location updating live
                    </Text>
                    <View style={styles.liveDotSmall} />
                  </View>
                )}
              </View>
            )}

            {/* URGENT: driver is at the door, nobody home. The sender's
                5-minute response window (failed-delivery flow 2026-08-11).
                Silence = the booked fallback applies automatically. */}
            {deliveryData?.arrivalIssueAt && !deliveryData?.arrivalResolution &&
              deliveryData?.senderResponseBy && new Date(deliveryData.senderResponseBy) > new Date() && (
              <View style={[styles.card, { backgroundColor: '#FEF3C7', borderWidth: 1.5, borderColor: '#F59E0B' }]}>
                <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold as any, color: '#92400E', marginBottom: 4 }}>
                  Driver is at the door: nobody to receive
                </Text>
                <Text style={{ fontSize: FontSize.sm, color: '#92400E', marginBottom: Spacing.md, lineHeight: 19 }}>
                  Choose within 5 minutes or your booked fallback applies automatically.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                  {([
                    { key: 'wait',      label: 'Receiver is coming: wait' },
                    { key: 'neighbour', label: 'Leave with neighbour' },
                    { key: 'gate',      label: 'Leave at gate' },
                    { key: 'store',     label: 'Send to partner store' },
                  ] as const)
                    .filter(o => !(deliveryData?.requiresRecipientVerification && (o.key === 'gate' || o.key === 'neighbour')))
                    .map(o => (
                      <Pressable
                        key={o.key}
                        style={{ backgroundColor: '#92400E', borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10 }}
                        onPress={async () => {
                          try {
                            await deliveriesApi.arrivalResponse(deliveryData.id, o.key);
                            Alert.alert('Driver notified', 'Your choice went straight to the driver\'s chat.');
                            handleSearch();
                          } catch (e: any) {
                            Alert.alert('Could not send', e?.message ?? 'Try again.');
                          }
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold as any }}>{o.label}</Text>
                      </Pressable>
                    ))}
                </View>
              </View>
            )}

            {/* Redirect fee owed: the pay-to-release notice. */}
            {deliveryData?.redirectFeeOwedNgn > 0 && (
              <View style={[styles.card, { backgroundColor: theme.surface, borderWidth: 1.5, borderColor: '#F59E0B' }, Shadows.sm]}>
                <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold as any, color: theme.text, marginBottom: 4 }}>
                  Package waiting at a partner store
                </Text>
                <Text style={{ fontSize: FontSize.sm, color: theme.textSecond, lineHeight: 19 }}>
                  Nobody was available at the door, so your package is safe at a nearby SEIRS partner store.
                  A redirect fee of ₦{Number(deliveryData.redirectFeeOwedNgn).toLocaleString()} (plus any storage days)
                  applies. Contact support from the app to settle it and receive the pickup location and collection code.
                </Text>
              </View>
            )}

            {/* Recipient-not-available rescue: redirect to a partner
                store near the dropoff. Mid-flight statuses only. */}
            {['assigned', 'picked_up', 'in_transit'].includes(String(currentStatus)) && (
              <Pressable
                onPress={openRedirect}
                style={[styles.redirectBtn, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
              >
                <Ionicons name="storefront-outline" size={18} color={theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.redirectTitle, { color: theme.text }]}>Recipient not available?</Text>
                  <Text style={[styles.redirectSub, { color: theme.textSecond }]}>
                    Redirect the drop-off to a partner store near the destination.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
              </Pressable>
            )}

            {/* Delivery details */}
            <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Delivery Details</Text>
              <View style={styles.detailRow}>
                <View style={[styles.dot, { backgroundColor: theme.success }]} />
                <View style={styles.detailText}>
                  <Text style={[styles.detailLabel, { color: theme.textSecond }]}>Pickup</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{deliveryData.pickupAddress}</Text>
                </View>
              </View>
              <View style={[styles.routeConnector, { backgroundColor: theme.border }]} />
              <View style={styles.detailRow}>
                <View style={[styles.dot, { backgroundColor: theme.error }]} />
                <View style={styles.detailText}>
                  <Text style={[styles.detailLabel, { color: theme.textSecond }]}>Dropoff</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{deliveryData.dropoffAddress}</Text>
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: theme.divider }]} />
              <View style={styles.metaRow}>
                <View style={styles.metaChip}>
                  <Ionicons name="cube-outline" size={14} color={theme.textSecond} />
                  <Text style={[styles.metaItem, { color: theme.textSecond }]}>{deliveryData.packageDescription}</Text>
                </View>
                <View style={styles.metaChip}>
                  <Ionicons name="map-outline" size={14} color={theme.textSecond} />
                  <Text style={[styles.metaItem, { color: theme.textSecond }]}>{deliveryData.distanceKm} km</Text>
                </View>
                <Text style={[styles.metaPrice, { color: theme.primary }]}>
                  ₦{deliveryData.price?.toLocaleString()}
                </Text>
              </View>
            </View>
          </>
        )}

        {!deliveryData && !notFound && (
          <View style={styles.placeholder}>
            <View style={[styles.placeholderIconWrap, { backgroundColor: theme.surface }]}>
              <Ionicons name="cube-outline" size={52} color={theme.textThird} />
            </View>
            <Text style={[styles.placeholderTitle, { color: theme.text }]}>Track your delivery</Text>
            <Text style={[styles.placeholderDesc, { color: theme.textSecond }]}>
              Enter a tracking code above to see live status and driver location.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Store picker: nearest to the ORIGINAL dropoff first */}
      <Modal visible={redirectOpen} transparent animationType="slide" onRequestClose={() => setRedirectOpen(false)}>
        <View style={styles.redirectOverlay}>
          {/* Bottom padding clears the phone's navigation bar, same fix
              as send.tsx: this sheet's Cancel button sat right on top of
              it, so a tap could hit Back instead. insets.bottom is 0 on
              gesture navigation and ~48dp on the 3-button layout, so it
              adapts rather than hardcoding a gap. */}
          <View style={[
            styles.redirectCard,
            { backgroundColor: theme.surface, paddingBottom: Spacing.lg + insets.bottom },
          ]}>
            <View style={styles.redirectHandle} />
            <Text style={[styles.redirectModalTitle, { color: theme.text }]}>Redirect to a partner store</Text>
            <Text style={[styles.redirectModalSub, { color: theme.textSecond }]}>
              For when the recipient cannot receive the package. Stores are sorted nearest to the delivery address.
              One redirect per delivery.
            </Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {redirectStores.length === 0 ? (
                <Text style={[styles.redirectModalSub, { color: theme.textThird, paddingVertical: 20, textAlign: 'center' }]}>
                  No partner stores available near the destination right now.
                </Text>
              ) : redirectStores.map(s => (
                <Pressable
                  key={s.id}
                  disabled={redirectBusy}
                  onPress={() => confirmRedirect(s)}
                  style={[styles.redirectStoreRow, { borderBottomColor: theme.border }]}
                >
                  <View style={[styles.redirectStoreIcon, { backgroundColor: theme.primary + '15' }]}>
                    <Ionicons name="storefront-outline" size={18} color={theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.redirectStoreName, { color: theme.text }]}>{s.storeName}</Text>
                    <Text style={[styles.redirectStoreAddr, { color: theme.textSecond }]} numberOfLines={1}>{s.storeAddress}</Text>
                    <Text style={[styles.redirectStoreMeta, { color: theme.textThird }]}>
                      {s.distanceKm != null ? `${Number(s.distanceKm).toFixed(1)} km from drop-off` : ''}
                      {(s.openTime || s.closeTime) ? ` · Open ${s.openTime ?? '?'}–${s.closeTime ?? '?'}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={[styles.redirectClose, { backgroundColor: theme.surfaceSecond }]} onPress={() => setRedirectOpen(false)}>
              <Text style={{ color: theme.text, fontWeight: FontWeight.semibold }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:   { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  subtitle: { fontSize: FontSize.sm, marginTop: 2 },

  searchCard:      { marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, flexDirection: 'row', gap: Spacing.sm },
  searchInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md },
  searchInput:     { flex: 1, fontSize: FontSize.base, letterSpacing: 1 },
  searchBtn:       { height: 52, paddingHorizontal: Spacing.lg, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center' },
  searchBtnText:   { color: '#fff', fontWeight: FontWeight.semibold, fontSize: FontSize.base },

  notFoundBox:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  notFoundText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  cardWrap:      { marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, overflow: 'hidden' },
  statusCard:    { padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm },
  statusIconWrap:{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  statusLabel:   { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  trackingCode:  { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm, letterSpacing: 2 },
  livePill:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full },
  liveDot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  liveText:      { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1 },

  card:       { marginHorizontal: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.md },
  cardTitle:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.md },

  stepRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  stepDot:    { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.sm },
  stepNum:    { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  stepLabel:  { flex: 1, fontSize: FontSize.base },
  stepLine:   { width: 2, height: 14, marginLeft: 13, marginBottom: 4 },

  driverRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  driverAvatar:    { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  driverAvatarText:{ color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  driverInfo:      { flex: 1, gap: 4 },
  driverName:      { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  driverMeta:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  driverMetaText:  { fontSize: FontSize.sm },
  ratingRow:       { flexDirection: 'row', alignItems: 'center', gap: 3 },
  liveLocationRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, padding: Spacing.sm, borderRadius: Radius.md },
  liveLocationText:{ flex: 1, fontSize: FontSize.xs },
  liveDotSmall:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },

  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  dot:            { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  routeConnector: { width: 1.5, height: 14, marginLeft: 4, marginVertical: 2 },
  detailText:     { flex: 1, gap: 2 },
  detailLabel:    { fontSize: FontSize.xs },
  detailValue:    { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  divider:        { height: 1, marginVertical: Spacing.md },
  metaRow:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  metaChip:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaItem:       { fontSize: FontSize.sm },
  metaPrice:      { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginLeft: 'auto' },

  placeholder:        { paddingTop: Spacing.xl * 2, alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md },
  placeholderIconWrap:{ width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  placeholderTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  placeholderDesc:    { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 22 },

  redirectBtn:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  redirectTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  redirectSub:   { fontSize: FontSize.xs, marginTop: 2, lineHeight: 16 },

  redirectOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  redirectCard:       { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm },
  redirectHandle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: 4 },
  redirectModalTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  redirectModalSub:   { fontSize: FontSize.xs, lineHeight: 17 },
  redirectStoreRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderBottomWidth: 0.5 },
  redirectStoreIcon:  { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  redirectStoreName:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  redirectStoreAddr:  { fontSize: FontSize.xs, marginTop: 1 },
  redirectStoreMeta:  { fontSize: 10, marginTop: 2 },
  redirectClose:      { height: 46, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs },
});
