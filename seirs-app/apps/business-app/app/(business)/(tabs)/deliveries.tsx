import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';

const STATUSES = ['all', 'pending', 'assigned', 'in_transit', 'delivered', 'cancelled'];

const STATUS_LABEL: Record<string, string> = {
  all:        'All',
  pending:    'Pending',
  assigned:   'Assigned',
  in_transit: 'In Transit',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
  pending:    '#D97706',
  assigned:   '#3A7BD5',
  in_transit: '#7C3AED',
  delivered:  '#16A34A',
  cancelled:  '#DC2626',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

interface Delivery {
  id:              string;
  trackingNumber?: string;
  trackingCode?:   string;
  dropoffAddress?: string;
  pickupAddress?:  string;
  status:          string;
  price:           number;
  vehicleType:     string;
  createdAt:       string;
  stops?:          any[];
  isMultiStop?:    boolean;
}

export default function DeliveriesScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status,     setStatus]     = useState('all');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(false);

  const load = useCallback(async (p = 1, reset = false) => {
    if (p === 1) setLoading(true);
    try {
      const data = await businessApi.deliveries(p, status !== 'all' ? status : undefined, search || undefined);
      const items = Array.isArray(data) ? data : data?.items ?? [];
      setDeliveries((prev) => (reset || p === 1 ? items : [...prev, ...items]));
      setHasMore(data?.hasMore ?? false);
      setPage(p);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, search]);

  useEffect(() => { load(1, true); }, [status, search]);

  const onRefresh = () => { setRefreshing(true); load(1, true); };

  const handleCancel = (item: Delivery) => {
    Alert.alert(
      'Cancel delivery?',
      `Tracking: ${item.trackingNumber ?? item.trackingCode ?? item.id.slice(0, 8)}. The driver will be notified and the wallet will be refunded if funds are still in escrow. This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel delivery', style: 'destructive', onPress: async () => {
          try {
            await businessApi.cancelDelivery(item.id);
            load();
          } catch (e: any) {
            Alert.alert('Could not cancel', e?.message ?? 'Try again.');
          }
        } },
      ],
    );
  };

  const renderItem = ({ item }: { item: Delivery }) => {
    const c = STATUS_COLOR[item.status] ?? colors.textThird;
    const stopCount = item.stops?.length ?? (item.isMultiStop ? 0 : 1);
    const address = item.dropoffAddress
      ?? (item.stops?.[item.stops.length - 1] as any)?.address
      ?? item.pickupAddress
      ?? '—';
    const isCancellable = item.status === 'pending' || item.status === 'assigned';
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.trackNum, { color: colors.text }]}>
              {item.trackingNumber ?? item.trackingCode ?? item.id.slice(0, 8).toUpperCase()}
            </Text>
            <Text style={[styles.address, { color: colors.textSecond }]} numberOfLines={1}>{address}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: c + '20' }]}>
            <Text style={[styles.badgeText, { color: c }]}>{item.status.replace('_', ' ')}</Text>
          </View>
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.meta}>
            <Icon name="Truck" size={12} color={colors.textThird} />
            <Text style={[styles.metaText, { color: colors.textThird }]}>{item.vehicleType?.replace('_', ' ')}</Text>
          </View>
          {stopCount > 1 && (
            <View style={styles.meta}>
              <Icon name="MapPin" size={12} color={colors.textThird} />
              <Text style={[styles.metaText, { color: colors.textThird }]}>{stopCount} stops</Text>
            </View>
          )}
          <View style={styles.meta}>
            <Icon name="Calendar" size={12} color={colors.textThird} />
            <Text style={[styles.metaText, { color: colors.textThird }]}>
              {new Date(item.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <Text style={[styles.price, { color: colors.text }]}>{fmt(item.price)}</Text>
          {isCancellable && (
            <Pressable
              onPress={() => handleCancel(item)}
              style={styles.cancelLink}
              hitSlop={8}
            >
              <Icon name="X" size={12} color="#DC2626" />
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Deliveries</Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="Search" size={16} color={colors.textThird} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by tracking number…"
          placeholderTextColor={colors.textThird}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Icon name="X" size={16} color={colors.textThird} />
          </Pressable>
        )}
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={STATUSES}
        keyExtractor={(s) => s}
        contentContainerStyle={styles.tabs}
        style={{ flexGrow: 0 }}
        renderItem={({ item: s }) => {
          const active = status === s;
          // 'All' has no status color of its own — uses the brand primary.
          const accent = s === 'all' ? colors.primary : STATUS_COLOR[s];
          return (
            <Pressable
              style={[
                styles.tab,
                { backgroundColor: colors.surface, borderColor: colors.border },
                active && { backgroundColor: accent, borderColor: accent },
              ]}
              onPress={() => setStatus(s)}
            >
              <View style={[
                styles.tabDot,
                { backgroundColor: active ? '#fff' : accent },
              ]} />
              <Text style={[
                styles.tabText,
                { color: colors.text },
                active && { color: '#fff' },
              ]}>
                {STATUS_LABEL[s]}
              </Text>
            </Pressable>
          );
        }}
      />

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={deliveries}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          contentContainerStyle={
            deliveries.length === 0
              ? { flexGrow: 1, padding: 16 }
              : { padding: 16, paddingBottom: 24 }
          }
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={() => hasMore && load(page + 1)}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="Package" size={40} color={colors.textThird} />
              <Text style={[styles.emptyText, { color: colors.textThird }]}>No deliveries found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:       { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  heading:      { fontSize: 20, fontWeight: '800' },
  searchWrap:   {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 16, marginBottom: 0,
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1,
  },
  searchInput:  { flex: 1, fontSize: 14 },
  tabs:         { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10, gap: 10, alignItems: 'center' },
  tab:          {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24,
    borderWidth: 1,
  },
  tabDot:       { width: 8, height: 8, borderRadius: 4 },
  tabText:      { fontSize: 14, fontWeight: '600' },
  card:         { borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1 },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  trackNum:     { fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  address:      { fontSize: 12, marginTop: 3 },
  badge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:    { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  cardBottom:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  meta:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:     { fontSize: 11, textTransform: 'capitalize' },
  price:        { marginLeft: 'auto', fontSize: 13, fontWeight: '700' },
  cancelLink:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12 },
  cancelLinkText: { color: '#DC2626', fontSize: 11, fontWeight: '700' },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText:    { fontSize: 14 },
});
