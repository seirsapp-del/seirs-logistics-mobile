import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { useColors } from '@/context/ThemeContext';

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
  const colors = useColors();
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
      setPackages((prev) => p === 1 ? items : [...prev, ...items]);
      setHasMore(data?.hasMore ?? false);
      setPage(p);
    } finally { setLoading(false); }
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
            } finally { setCollecting(null); }
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
    const color = STATUS_COLOR[item.status] ?? colors.textThird;
    const isCollectable = item.status === 'awaiting_pickup' || item.status === 'in_store';
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={[styles.pkgIcon, { backgroundColor: color + '18' }]}>
            <Icon name={item.status === 'collected' ? 'PackageCheck' : 'Package'} size={20} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.trackNum, { color: colors.text }]}>{item.trackingNumber ?? item.id.slice(0, 12).toUpperCase()}</Text>
            <Text style={[styles.recipient, { color: colors.text }]}>{item.recipientName}</Text>
            {item.recipientPhone && <Text style={[styles.phone, { color: colors.textThird }]}>{item.recipientPhone}</Text>}
          </View>
          <View style={[styles.badge, { backgroundColor: color + '18' }]}>
            <Text style={[styles.badgeText, { color }]}>{item.status.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.meta}>
            <Icon name="Calendar" size={12} color={colors.textThird} />
            <Text style={[styles.metaText, { color: colors.textThird }]}>
              Arrived {new Date(item.arrivedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
          {isCollectable && (
            <Pressable
              style={[styles.collectBtn, { backgroundColor: colors.primary }, collecting === item.id && styles.collectBtnDisabled]}
              onPress={() => handleCollect(item)}
              disabled={collecting === item.id}
            >
              {collecting === item.id
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Icon name="CheckSquare" size={13} color="#fff" />
                    <Text style={styles.collectBtnText}>Mark Collected</Text>
                  </>}
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
        <Text style={[styles.heading, { color: colors.text }]}>Package Inventory</Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="Search" size={16} color={colors.textThird} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by tracking or recipient…"
          placeholderTextColor={colors.textThird}
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
        renderItem={({ item: s }) => {
          const active = status === s;
          return (
            <Pressable
              style={[
                styles.tab,
                { backgroundColor: colors.surface, borderColor: colors.border },
                active && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.tabText, { color: colors.textSecond }, active && { color: '#fff' }]}>
                {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
              </Text>
            </Pressable>
          );
        }}
      />

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
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
              <Icon name="PackageX" size={40} color={colors.textThird} />
              <Text style={[styles.emptyText, { color: colors.textThird }]}>No packages found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  heading:     { fontSize: 20, fontWeight: '800' },
  searchWrap:  {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 16, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14 },
  tabs:        { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  tabText:     { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  card:        { borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1 },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  pkgIcon:     { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trackNum:    { fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  recipient:   { fontSize: 13, marginTop: 2 },
  phone:       { fontSize: 11, marginTop: 1 },
  badge:       { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:   { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  cardBottom:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:    { fontSize: 11 },
  collectBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
  },
  collectBtnDisabled: { opacity: 0.5 },
  collectBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty:       { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText:   { fontSize: 14 },
});
