import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';

const STATUSES = ['all', 'in_store', 'awaiting_pickup', 'collected', 'returned'];

const STATUS_COLOR: Record<string, string> = {
  in_store:        '#3A7BD5',
  awaiting_pickup: '#D97706',
  collected:       '#16A34A',
  returned:        '#DC2626',
};

interface Package {
  id:            string;
  trackingNumber?: string;
  recipientName:   string;
  recipientPhone?: string;
  status:          string;
  arrivedAt:       string;
  qrCode?:         string;
}

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const [packages,  setPackages]  = useState<Package[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [status,    setStatus]    = useState('all');
  const [search,    setSearch]    = useState('');
  const [page,      setPage]      = useState(1);
  const [hasMore,   setHasMore]   = useState(false);
  const [collecting, setCollecting] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    if (p === 1) setLoading(true);
    try {
      const data = await partnerApi.inventory(status !== 'all' ? status : undefined, p);
      const items = Array.isArray(data) ? data : data?.items ?? [];
      setPackages(p === 1 ? items : (prev) => [...prev, ...items]);
      setHasMore(data?.hasMore ?? false);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(1); }, [status]);

  const handleCollect = (pkg: Package) => {
    Alert.alert(
      'Mark as Collected',
      `Confirm ${pkg.recipientName} has collected their package?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm', onPress: async () => {
            setCollecting(pkg.id);
            try {
              await partnerApi.markCollected(pkg.id);
              load(1);
            } finally {
              setCollecting(null);
            }
          },
        },
      ],
    );
  };

  const filtered = search
    ? packages.filter((p) =>
        p.trackingNumber?.toLowerCase().includes(search.toLowerCase()) ||
        p.recipientName.toLowerCase().includes(search.toLowerCase()),
      )
    : packages;

  const renderItem = ({ item }: { item: Package }) => {
    const color = STATUS_COLOR[item.status] ?? '#9CA3AF';
    const isCollectable = item.status === 'awaiting_pickup' || item.status === 'in_store';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.pkgIcon, { backgroundColor: color + '18' }]}>
            <Icon name={item.status === 'collected' ? 'PackageCheck' : 'Package'} size={20} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.trackNum}>{item.trackingNumber ?? item.id.slice(0, 12).toUpperCase()}</Text>
            <Text style={styles.recipient}>{item.recipientName}</Text>
            {item.recipientPhone && <Text style={styles.phone}>{item.recipientPhone}</Text>}
          </View>
          <View style={[styles.badge, { backgroundColor: color + '18' }]}>
            <Text style={[styles.badgeText, { color }]}>{item.status.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.meta}>
            <Icon name="Calendar" size={12} color="#9CA3AF" />
            <Text style={styles.metaText}>
              Arrived {new Date(item.arrivedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
          {isCollectable && (
            <Pressable
              style={[styles.collectBtn, collecting === item.id && styles.collectBtnDisabled]}
              onPress={() => handleCollect(item)}
              disabled={collecting === item.id}
            >
              {collecting === item.id
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Icon name="CheckSquare" size={13} color="#fff" />
                    <Text style={styles.collectBtnText}>Mark Collected</Text>
                  </>
              }
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.heading}>Package Inventory</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Icon name="Search" size={16} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by tracking or recipient…"
          placeholderTextColor="#9CA3AF"
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
              {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
            </Text>
          </Pressable>
        )}
      />

      {loading ? (
        <ActivityIndicator color="#3A7BD5" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          onEndReached={() => hasMore && load(page + 1)}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="PackageX" size={40} color="#D1D5DB" />
              <Text style={styles.emptyText}>No packages found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  heading:     { fontSize: 20, fontWeight: '800', color: '#0F2B4C' },
  searchWrap:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', margin: 16, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F2B4C' },
  tabs:        { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  tabActive:   { backgroundColor: '#0F2B4C', borderColor: '#0F2B4C' },
  tabText:     { fontSize: 11, color: '#6B7280', fontWeight: '600', textTransform: 'capitalize' },
  tabTextActive: { color: '#fff' },
  card:        { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  pkgIcon:     { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trackNum:    { fontSize: 13, fontWeight: '700', color: '#0F2B4C', fontFamily: 'monospace' },
  recipient:   { fontSize: 13, color: '#374151', marginTop: 2 },
  phone:       { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  badge:       { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:   { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  cardBottom:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:    { fontSize: 11, color: '#9CA3AF' },
  collectBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0F2B4C', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
  },
  collectBtnDisabled: { opacity: 0.5 },
  collectBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty:       { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText:   { fontSize: 14, color: '#9CA3AF' },
});
