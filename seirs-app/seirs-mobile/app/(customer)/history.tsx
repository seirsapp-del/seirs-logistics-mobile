import {
  View, Text, Pressable, StyleSheet,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows, Palette } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';
import { RatingModal } from '@/components/RatingModal';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:    { label: 'Pending',    color: Palette.info,       icon: '🔍' },
  assigned:   { label: 'Assigned',   color: Palette.orange500,  icon: '🚀' },
  picked_up:  { label: 'Picked Up',  color: Palette.orange600,  icon: '📦' },
  in_transit: { label: 'In Transit', color: '#8B5CF6',          icon: '🛵' },
  delivered:  { label: 'Delivered',  color: Palette.success,    icon: '✅' },
  cancelled:  { label: 'Cancelled',  color: Palette.gray400,    icon: '🚫' },
  failed:     { label: 'Failed',     color: Palette.error,      icon: '❌' },
};

interface RatingTarget {
  id: string;
  trackingCode: string;
  driverName: string;
}

export default function HistoryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore,setLoadingMore]= useState(false);

  const [ratingTarget, setRatingTarget] = useState<RatingTarget | null>(null);
  const [ratedIds,     setRatedIds]     = useState<Set<string>>(new Set());

  const load = useCallback(async (reset = false) => {
    const nextPage = reset ? 1 : page;
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const data = await deliveriesApi.myDeliveries(nextPage, 20);
      const items = data?.items ?? [];
      setDeliveries(prev => reset ? items : [...prev, ...items]);
      setPage(nextPage + 1);
      setTotalPages(data?.pages ?? 1);
    } catch {
      // silently fail — show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [page]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    load(true);
  }, []);

  useEffect(() => { load(true); }, []);

  const handleRatingDone = (deliveryId: string) => {
    setRatedIds(prev => new Set(prev).add(deliveryId));
    setRatingTarget(null);
  };

  const renderItem = ({ item: d }: { item: any }) => {
    const status = STATUS_CONFIG[d.status] ?? { label: d.status, color: Palette.gray400, icon: '📦' };
    const canRate = d.status === 'delivered' && !ratedIds.has(d.id) && !d.customerRating;
    return (
      <Pressable
        style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}
        onPress={() => router.push({ pathname: '/(customer)/track', params: { code: d.trackingCode } } as any)}
      >
        {/* Status + tracking code */}
        <View style={styles.cardTop}>
          <View style={[styles.statusBadge, { backgroundColor: status.color + '18' }]}>
            <Text style={{ fontSize: 12 }}>{status.icon}</Text>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
          <Text style={[styles.trackCode, { color: theme.textSecond }]}>{d.trackingCode}</Text>
        </View>

        {/* Route */}
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: theme.success }]} />
          <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={1}>{d.pickupAddress}</Text>
        </View>
        <View style={[styles.routeLine, { backgroundColor: theme.border }]} />
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: theme.error }]} />
          <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={1}>{d.dropoffAddress}</Text>
        </View>

        <View style={[styles.cardDivider, { backgroundColor: theme.divider }]} />

        {/* Meta */}
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: theme.textSecond }]}>
            {d.packageSize} · {d.distanceKm ? `${Number(d.distanceKm).toFixed(1)} km` : '—'}
          </Text>
          <Text style={[styles.metaPrice, { color: theme.primary }]}>
            ₦{(d.price ?? 0).toLocaleString()}
          </Text>
        </View>

        <Text style={[styles.date, { color: theme.textSecond }]}>
          {new Date(d.createdAt).toLocaleDateString('en-NG', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </Text>

        {canRate && (
          <Pressable
            style={[styles.rateBtn, { borderColor: theme.primary }]}
            onPress={() => setRatingTarget({ id: d.id, trackingCode: d.trackingCode, driverName: d.driver?.name ?? 'your driver' })}
          >
            <Text style={[styles.rateBtnText, { color: theme.primary }]}>⭐ Rate this delivery</Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>My Deliveries</Text>
        <Text style={[styles.subtitle, { color: theme.textSecond }]}>
          {deliveries.length} order{deliveries.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={deliveries}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        onEndReached={() => { if (page <= totalPages && !loadingMore) load(); }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.primary} style={{ marginVertical: Spacing.lg }} /> : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No deliveries yet</Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
              Book your first delivery to see it here
            </Text>
            <Pressable
              style={[styles.bookBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/(customer)/send')}
            >
              <Text style={styles.bookBtnText}>Book a Delivery</Text>
            </Pressable>
          </View>
        }
      />

      {ratingTarget && (
        <RatingModal
          visible={!!ratingTarget}
          deliveryId={ratingTarget.id}
          trackingCode={ratingTarget.trackingCode}
          driverName={ratingTarget.driverName}
          onDone={() => handleRatingDone(ratingTarget.id)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { padding: Spacing.xl, paddingBottom: Spacing.md },
  title:       { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  subtitle:    { fontSize: FontSize.sm, marginTop: 4 },
  emptyState:  { paddingTop: Spacing.xxl, alignItems: 'center', gap: Spacing.md },
  emptyIcon:   { fontSize: 64 },
  emptyTitle:  { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  emptyDesc:   { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 22 },
  bookBtn:     { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.full, marginTop: Spacing.sm },
  bookBtnText: { color: '#fff', fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  card:        { borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  statusText:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  trackCode:   { fontSize: FontSize.xs, letterSpacing: 1 },
  routeRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  routeDot:    { width: 10, height: 10, borderRadius: 5 },
  routeAddr:   { flex: 1, fontSize: FontSize.sm },
  routeLine:   { width: 2, height: 12, marginLeft: 4, marginVertical: 2 },
  cardDivider: { height: 1, marginVertical: Spacing.sm },
  meta:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText:    { fontSize: FontSize.sm, textTransform: 'capitalize' },
  metaPrice:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  date:        { fontSize: FontSize.xs, marginTop: 4 },
  rateBtn:     { marginTop: Spacing.sm, borderWidth: 1.5, borderRadius: Radius.md, height: 40, justifyContent: 'center', alignItems: 'center' },
  rateBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
