import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';

const STATUSES = ['all', 'pending', 'assigned', 'in_transit', 'delivered', 'cancelled'];

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
  dropoffAddress:  string;
  status:          string;
  price:           number;
  vehicleType:     string;
  createdAt:       string;
  stops?:          number;
}

export default function DeliveriesScreen() {
  const insets = useSafeAreaInsets();
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
      setDeliveries(reset || p === 1 ? items : (prev) => [...prev, ...items]);
      setHasMore(data?.hasMore ?? false);
      setPage(p);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, search]);

  useEffect(() => { load(1, true); }, [status, search]);

  const onRefresh = () => { setRefreshing(true); load(1, true); };

  const renderItem = ({ item }: { item: Delivery }) => {
    const color = STATUS_COLOR[item.status] ?? '#9CA3AF';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.trackNum}>{item.trackingNumber ?? item.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={styles.address} numberOfLines={1}>{item.dropoffAddress}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.badgeText, { color }]}>{item.status.replace('_', ' ')}</Text>
          </View>
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.meta}>
            <Icon name="Truck" size={12} color="#9CA3AF" />
            <Text style={styles.metaText}>{item.vehicleType?.replace('_', ' ')}</Text>
          </View>
          {(item.stops ?? 0) > 1 && (
            <View style={styles.meta}>
              <Icon name="MapPin" size={12} color="#9CA3AF" />
              <Text style={styles.metaText}>{item.stops} stops</Text>
            </View>
          )}
          <View style={styles.meta}>
            <Icon name="Calendar" size={12} color="#9CA3AF" />
            <Text style={styles.metaText}>
              {new Date(item.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <Text style={styles.price}>{fmt(item.price)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.heading}>Deliveries</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Icon name="Search" size={16} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by tracking number…"
          placeholderTextColor="#9CA3AF"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <Icon name="X" size={16} color="#9CA3AF" />
          </Pressable>
        )}
      </View>

      {/* Status tabs */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={STATUSES}
        keyExtractor={(s) => s}
        contentContainerStyle={styles.tabs}
        renderItem={({ item: s }) => (
          <Pressable
            style={[styles.tab, status === s && styles.tabActive]}
            onPress={() => setStatus(s)}
          >
            <Text style={[styles.tabText, status === s && styles.tabTextActive]}>
              {s === 'all' ? 'All' : s.replace('_', ' ')}
            </Text>
          </Pressable>
        )}
      />

      {loading ? (
        <ActivityIndicator color="#3A7BD5" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={deliveries}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={() => hasMore && load(page + 1)}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="Package" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>No deliveries found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:       { paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  heading:      { fontSize: 20, fontWeight: '800', color: '#0F2B4C' },
  searchWrap:   {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', margin: 16, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput:  { flex: 1, fontSize: 14, color: '#0F2B4C' },
  tabs:         { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab:          {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
  },
  tabActive:    { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  tabText:      { fontSize: 12, color: '#6B7280', fontWeight: '600', textTransform: 'capitalize' },
  tabTextActive: { color: '#fff' },
  card:         {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  trackNum:     { fontSize: 13, fontWeight: '700', color: '#0F2B4C', fontFamily: 'monospace' },
  address:      { fontSize: 12, color: '#6B7280', marginTop: 3 },
  badge:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:    { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  cardBottom:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  meta:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:     { fontSize: 11, color: '#9CA3AF', textTransform: 'capitalize' },
  price:        { marginLeft: 'auto', fontSize: 13, fontWeight: '700', color: '#0F2B4C' },
  empty:        { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText:    { fontSize: 14, color: '#9CA3AF' },
});
