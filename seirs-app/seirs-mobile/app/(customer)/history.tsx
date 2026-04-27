import {
  View, Text, Pressable, StyleSheet,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { deliveriesApi } from '@/services/api';
import { RatingModal } from '@/components/RatingModal';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:    { label: 'Pending',    color: '#00C2FF', icon: 'search-outline' },
  assigned:   { label: 'Assigned',   color: '#F4600C', icon: 'navigate-outline' },
  picked_up:  { label: 'Picked Up',  color: '#D95209', icon: 'cube-outline' },
  in_transit: { label: 'In Transit', color: '#8B5CF6', icon: 'navigate' },
  delivered:  { label: 'Delivered',  color: '#22C55E', icon: 'checkmark-circle' },
  cancelled:  { label: 'Cancelled',  color: '#71717A', icon: 'close-circle-outline' },
  failed:     { label: 'Failed',     color: '#EF4444', icon: 'alert-circle-outline' },
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
    reset ? setLoading(true) : setLoadingMore(true);
    try {
      const data = await deliveriesApi.myDeliveries(nextPage, 20);
      const items = data?.items ?? [];
      setDeliveries(prev => reset ? items : [...prev, ...items]);
      setPage(nextPage + 1);
      setTotalPages(data?.pages ?? 1);
    } catch {
      // silently fail
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
    const status = STATUS_CONFIG[d.status] ?? { label: d.status, color: '#A1A1AA', icon: 'cube-outline' };
    const canRate = d.status === 'delivered' && !ratedIds.has(d.id) && !d.customerRating;
    return (
      <Pressable
        style={[styles.card, { backgroundColor: theme.surface }, Shadows.sm]}
        onPress={() => router.push({ pathname: '/(customer)/track', params: { code: d.trackingCode } } as any)}
      >
        {/* Status + tracking code */}
        <View style={styles.cardTop}>
          <View style={[styles.statusBadge, { backgroundColor: status.color + '18' }]}>
            <Ionicons name={status.icon as any} size={12} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
          <Text style={[styles.trackCode, { color: theme.textSecond }]}>{d.trackingCode}</Text>
        </View>

        {/* Route */}
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: theme.success }]} />
          <Text style={[styles.routeAddr, { color: theme.text }]} numberOfLines={1}>{d.pickupAddress}</Text>
        </View>
        <View style={[styles.routeConnector, { backgroundColor: theme.border }]} />
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

        <Text style={[styles.date, { color: theme.textThird }]}>
          {new Date(d.createdAt).toLocaleDateString('en-NG', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </Text>

        {canRate && (
          <Pressable
            style={[styles.rateBtn, { borderColor: theme.primary, backgroundColor: theme.primary + '10' }]}
            onPress={() => setRatingTarget({ id: d.id, trackingCode: d.trackingCode, driverName: d.driver?.name ?? 'your driver' })}
          >
            <Ionicons name="star" size={14} color={theme.primary} />
            <Text style={[styles.rateBtnText, { color: theme.primary }]}>Rate this delivery</Text>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
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
        contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        onEndReached={() => { if (page <= totalPages && !loadingMore) load(); }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingMore
          ? <ActivityIndicator color={theme.primary} style={{ marginVertical: Spacing.lg }} />
          : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: theme.surface }]}>
              <Ionicons name="cube-outline" size={48} color={theme.textThird} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No deliveries yet</Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
              Book your first delivery to see it here
            </Text>
            <Pressable
              style={[styles.bookBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/(customer)/send')}
            >
              <Ionicons name="cube" size={16} color="#fff" />
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
  header:      { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title:       { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  subtitle:    { fontSize: FontSize.sm, marginTop: 2 },

  emptyState:   { paddingTop: Spacing.xl * 2, alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md },
  emptyIconWrap:{ width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  emptyTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  emptyDesc:    { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 22 },
  bookBtn:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 4, borderRadius: Radius.full, marginTop: Spacing.xs },
  bookBtnText:  { color: '#fff', fontWeight: FontWeight.semibold, fontSize: FontSize.base },

  card:        { borderRadius: Radius.xl, padding: Spacing.md, marginBottom: Spacing.sm },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  statusText:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  trackCode:   { fontSize: FontSize.xs, letterSpacing: 1 },

  routeRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  routeDot:       { width: 9, height: 9, borderRadius: 5 },
  routeAddr:      { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  routeConnector: { width: 1.5, height: 10, marginLeft: 4, marginVertical: 2 },

  cardDivider: { height: 1, marginVertical: Spacing.sm },
  meta:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText:    { fontSize: FontSize.sm, textTransform: 'capitalize', color: '#71717A' },
  metaPrice:   { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  date:        { fontSize: FontSize.xs, marginTop: 4 },

  rateBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.sm, borderWidth: 1.5, borderRadius: Radius.lg, height: 40 },
  rateBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
