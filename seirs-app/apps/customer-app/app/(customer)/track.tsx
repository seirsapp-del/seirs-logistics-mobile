import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useDeliveryTracking } from '@/hooks/useDeliveryTracking';
import { deliveriesApi } from '@/services/api';

// Labels looked up via t(`tracking.step${cap}`) at render so language
// switches reflect live.
const STATUS_CONFIG: Record<string, {
  labelKey: string; step: number;
  gradient: readonly [string, string];
  icon: string;
}> = {
  pending:    { labelKey: 'tracking.stepPending',   step: 1, gradient: ['#3A86FF', '#1D6AE5'], icon: 'search' },
  assigned:   { labelKey: 'tracking.stepAssigned',  step: 2, gradient: ['#3A86FF', '#1A56CC'], icon: 'navigate' },
  picked_up:  { labelKey: 'tracking.stepPickedUp',  step: 3, gradient: ['#FF6B00', '#C2410C'], icon: 'cube' },
  in_transit: { labelKey: 'tracking.stepInTransit', step: 4, gradient: ['#8B5CF6', '#6D28D9'], icon: 'navigate' },
  delivered:  { labelKey: 'tracking.stepDelivered', step: 5, gradient: ['#22C55E', '#15803D'], icon: 'checkmark-circle' },
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

  const [code,         setCode]         = useState(params.code ?? '');
  const [deliveryId,   setDeliveryId]   = useState<string | null>(null);
  const [deliveryData, setDeliveryData] = useState<any>(null);
  const [searching,    setSearching]    = useState(false);
  const [notFound,     setNotFound]     = useState(false);

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
                    <Text style={[styles.driverName, { color: theme.text }]}>
                      {assignedDriver?.name ?? deliveryData.driver?.user?.name}
                    </Text>
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
});
