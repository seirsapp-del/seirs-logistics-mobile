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
import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows, Palette } from '@/constants/theme';
import { useDeliveryTracking } from '@/hooks/useDeliveryTracking';
import { deliveriesApi } from '@/services/api';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; step: number }> = {
  pending:    { label: 'Finding Driver',  color: Palette.info,       icon: '🔍', step: 1 },
  assigned:   { label: 'Driver Assigned', color: Palette.orange500,  icon: '🚀', step: 2 },
  picked_up:  { label: 'Package Picked Up',color: Palette.orange600, icon: '📦', step: 3 },
  in_transit: { label: 'On the Way',      color: '#8B5CF6',          icon: '🛵', step: 4 },
  delivered:  { label: 'Delivered!',      color: Palette.success,    icon: '✅', step: 5 },
  failed:     { label: 'Delivery Failed', color: Palette.error,      icon: '❌', step: 0 },
  cancelled:  { label: 'Cancelled',       color: Palette.gray400,    icon: '🚫', step: 0 },
};

const STEPS = ['Finding Driver', 'Assigned', 'Picked Up', 'In Transit', 'Delivered'];

export default function TrackScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const params = useLocalSearchParams<{ code?: string }>();

  const [code, setCode] = useState(params.code ?? '');
  const [deliveryId, setDeliveryId] = useState<string | null>(null);
  const [deliveryData, setDeliveryData] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const { driverLocation, deliveryStatus, assignedDriver, isConnected } =
    useDeliveryTracking(deliveryId);

  // Auto-search when a tracking code is passed as a route param
  useEffect(() => {
    if (params.code) handleSearch();
  }, []);

  const currentStatus = deliveryStatus ?? deliveryData?.status ?? null;
  const statusInfo = currentStatus ? STATUS_CONFIG[currentStatus] : null;

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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Track Package</Text>
          <Text style={[styles.subtitle, { color: theme.textSecond }]}>
            Enter your tracking code
          </Text>
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <TextInput
            style={[
              styles.searchInput,
              { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
            ]}
            placeholder="e.g. SRS-AB12CD34"
            placeholderTextColor={theme.textSecond}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters"
          />
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
          <Text style={[styles.notFound, { color: theme.error }]}>
            No delivery found with that code.
          </Text>
        )}

        {/* Result */}
        {deliveryData && (
          <>
            {/* Status card */}
            <View style={[styles.statusCard, { backgroundColor: statusInfo?.color ?? theme.primary }]}>
              <Text style={styles.statusIcon}>{statusInfo?.icon ?? '📦'}</Text>
              <Text style={styles.statusLabel}>{statusInfo?.label ?? 'Processing'}</Text>
              <Text style={styles.trackingCode}>{deliveryData.trackingCode}</Text>
              {isConnected && (
                <View style={styles.liveDot}>
                  <View style={styles.liveDotInner} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}
            </View>

            {/* Progress steps */}
            <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Delivery Progress</Text>
              {STEPS.map((step, i) => {
                const stepNum = i + 1;
                const currentStep = statusInfo?.step ?? 0;
                const done    = stepNum < currentStep;
                const active  = stepNum === currentStep;
                const pending = stepNum > currentStep;
                return (
                  <View key={step} style={styles.stepRow}>
                    <View style={[
                      styles.stepDot,
                      done   && { backgroundColor: theme.success },
                      active && { backgroundColor: theme.primary },
                      pending && { backgroundColor: theme.border },
                    ]}>
                      <Text style={styles.stepDotText}>{done ? '✓' : stepNum}</Text>
                    </View>
                    <Text style={[
                      styles.stepLabel,
                      { color: pending ? theme.textSecond : theme.text },
                      active && { fontWeight: FontWeight.bold },
                    ]}>
                      {step}
                    </Text>
                    {i < STEPS.length - 1 && (
                      <View style={[
                        styles.stepLine,
                        { backgroundColor: done ? theme.success : theme.border },
                      ]} />
                    )}
                  </View>
                );
              })}
            </View>

            {/* Assigned driver card */}
            {(assignedDriver ?? deliveryData.driver) && (
              <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Your Driver</Text>
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
                    <Text style={[styles.driverMeta, { color: theme.textSecond }]}>
                      {assignedDriver?.vehicleType ?? deliveryData.driver?.vehicleType}
                      {' · '}⭐ {(assignedDriver?.rating ?? deliveryData.driver?.rating ?? 0).toFixed(1)}
                    </Text>
                  </View>
                </View>
                {driverLocation && (
                  <Text style={[styles.locationText, { color: theme.textSecond }]}>
                    📍 Driver location updating live
                  </Text>
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
              <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
              <View style={styles.detailRow}>
                <View style={[styles.dot, { backgroundColor: theme.error }]} />
                <View style={styles.detailText}>
                  <Text style={[styles.detailLabel, { color: theme.textSecond }]}>Dropoff</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{deliveryData.dropoffAddress}</Text>
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: theme.divider }]} />
              <View style={styles.metaRow}>
                <Text style={[styles.metaItem, { color: theme.textSecond }]}>
                  📦 {deliveryData.packageDescription}
                </Text>
                <Text style={[styles.metaItem, { color: theme.textSecond }]}>
                  📏 {deliveryData.distanceKm} km
                </Text>
                <Text style={[styles.metaItem, { color: theme.primary }]}>
                  ₦{deliveryData.price?.toLocaleString()}
                </Text>
              </View>
            </View>
          </>
        )}

        {!deliveryData && !notFound && (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderIcon}>📦</Text>
            <Text style={[styles.placeholderTitle, { color: theme.text }]}>Track your delivery</Text>
            <Text style={[styles.placeholderDesc, { color: theme.textSecond }]}>
              Enter a tracking code above to see live status and driver location.
            </Text>
          </View>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: Spacing.xl, paddingBottom: Spacing.md },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  subtitle: { fontSize: FontSize.sm, marginTop: 4 },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.base,
    letterSpacing: 1,
  },
  searchBtn: {
    height: 52,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  notFound: { textAlign: 'center', fontSize: FontSize.sm, marginBottom: Spacing.md, paddingHorizontal: Spacing.xl },
  statusCard: {
    marginHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statusIcon: { fontSize: 40, marginBottom: Spacing.sm },
  statusLabel: { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  trackingCode: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm, marginTop: 4, letterSpacing: 2 },
  liveDot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm },
  liveDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1 },
  card: {
    marginHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: Spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, position: 'relative' },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: Spacing.sm,
  },
  stepDotText: { color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  stepLabel: { flex: 1, fontSize: FontSize.base },
  stepLine: { position: 'absolute', left: 13, top: 28, width: 2, height: 16 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  driverAvatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  driverAvatarText: { color: '#fff', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  driverInfo: { flex: 1 },
  driverName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  driverMeta: { fontSize: FontSize.sm, marginTop: 2 },
  locationText: { fontSize: FontSize.xs, marginTop: Spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: 4 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  routeLine: { width: 2, height: 16, marginLeft: 5, marginBottom: 4 },
  detailText: { flex: 1 },
  detailLabel: { fontSize: FontSize.xs, marginBottom: 2 },
  detailValue: { fontSize: FontSize.sm },
  divider: { height: 1, marginVertical: Spacing.md },
  metaRow: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  metaItem: { fontSize: FontSize.sm },
  placeholder: { padding: Spacing.xl, alignItems: 'center', marginTop: Spacing.xl, gap: Spacing.md },
  placeholderIcon: { fontSize: 56 },
  placeholderTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  placeholderDesc: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 22 },
});
