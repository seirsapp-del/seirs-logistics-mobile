import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, Switch, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

// Spec V8 §4.9 — partner staff sees real-time store load + can pause
// incoming bookings when overwhelmed. Backend enforces capacity preflight,
// this surface lets staff manage the upper bound consciously.

interface CapacityData {
  partnerStoreId: string;
  currentLoad:    number;
  maxCapacity:    number;
  percent:        number;
  bucket:         'plenty' | 'limited' | 'full';
  full:           boolean;
}

interface Dropoff {
  id:            string;
  dropCode:      string;
  recipientName: string;
  weightKg:      number;
  status:        string;
  createdAt:     string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  scheduled:           { label: 'Awaiting drop-off',      color: '#9CA3AF' },
  received_at_store:   { label: 'Received',                color: '#3A7BD5' },
  awaiting_driver:     { label: 'Waiting for driver',      color: '#D97706' },
  driver_en_route:     { label: 'Driver en route',         color: '#3A7BD5' },
  in_transit:          { label: 'In transit',              color: '#3A7BD5' },
  at_dropoff_store:    { label: 'Ready for collection',    color: '#16A34A' },
  awaiting_collection: { label: 'Awaiting collection',     color: '#16A34A' },
  collected:           { label: 'Collected',               color: '#16A34A' },
  return_triggered:    { label: 'Return-triggered',        color: '#DC2626' },
  cancelled:           { label: 'Cancelled',               color: '#9CA3AF' },
};

export default function PartnerCapacityScreen() {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { user } = useAuth();

  const [capacity,    setCapacity]    = useState<CapacityData | null>(null);
  const [dropoffs,    setDropoffs]    = useState<Dropoff[]>([]);
  const [storeStatus, setStoreStatus] = useState<'active' | 'paused'>('active');
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [toggling,    setToggling]    = useState(false);

  const storeId = user?.partnerStoreId ?? '';

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    try {
      const [cap, list, dash] = await Promise.all([
        partnerApi.storeCapacity(storeId).catch(() => null),
        partnerApi.storeListAtStore(storeId, true).catch(() => []),
        partnerApi.dashboard().catch(() => null),
      ]);
      setCapacity(cap);
      setDropoffs(Array.isArray(list) ? list : []);
      // The dashboard payload exposes partner-store status via `storeStatus`
      // when populated by the backend; fall back to 'active' otherwise.
      setStoreStatus((dash?.storeStatus ?? 'active') as 'active' | 'paused');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const toggleAcceptIncoming = async (next: boolean) => {
    if (!storeId) return;
    const target = next ? 'active' : 'paused';
    setToggling(true);
    // Optimistic update — revert on error
    setStoreStatus(target);
    try {
      await partnerApi.storeSetStatus(storeId, target);
    } catch (e: any) {
      setStoreStatus(target === 'active' ? 'paused' : 'active');
      Alert.alert('Could not update', e?.message ?? 'Try again.');
    } finally {
      setToggling(false);
    }
  };

  if (!storeId) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Icon name="Store" size={36} color="#D1D5DB" />
        <Text style={styles.emptyText}>This account isn&apos;t linked to a partner store.</Text>
      </View>
    );
  }

  const percent      = capacity?.percent ?? 0;
  const bucketColor  = capacity?.bucket === 'full' ? '#DC2626' : capacity?.bucket === 'limited' ? '#D97706' : '#16A34A';
  const bucketLabel  = capacity?.bucket === 'full' ? 'Full' : capacity?.bucket === 'limited' ? 'Limited space' : 'Plenty of space';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F5F5F0' }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={20} color="#0F2B4C" />
        </Pressable>
        <Text style={styles.title}>Store Capacity</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#3A7BD5" style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Capacity card */}
          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardLabel}>CURRENT LOAD</Text>
              <Text style={[styles.bucketChip, { color: bucketColor, borderColor: bucketColor }]}>
                {bucketLabel}
              </Text>
            </View>
            <Text style={styles.bigCount}>
              {capacity?.currentLoad ?? 0}<Text style={styles.bigCountSecond}> / {capacity?.maxCapacity ?? 0}</Text>
            </Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${percent}%`, backgroundColor: bucketColor }]} />
            </View>
            <Text style={styles.percentText}>{percent}% utilised</Text>
          </View>

          {/* Accept-incoming toggle */}
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Accept new drop-offs</Text>
                <Text style={styles.toggleSub}>
                  When off, customers won&apos;t be able to schedule new drop-offs at this store. In-store packages and driver pickups continue normally.
                </Text>
              </View>
              <Switch
                value={storeStatus === 'active'}
                onValueChange={toggleAcceptIncoming}
                disabled={toggling}
                trackColor={{ false: '#E5E7EB', true: '#3A7BD5' }}
                thumbColor="#fff"
              />
            </View>
            {storeStatus === 'paused' && (
              <View style={styles.pauseBanner}>
                <Icon name="AlertCircle" size={14} color="#92400E" />
                <Text style={styles.pauseText}>Paused — customers can&apos;t book this store right now</Text>
              </View>
            )}
          </View>

          {/* Quick actions */}
          <View style={styles.actionRow}>
            <Pressable style={styles.actionBtn} onPress={() => router.push('/(partner)/storage' as any)}>
              <Icon name="Clock" size={18} color="#D97706" />
              <Text style={styles.actionLabel}>Overstays</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => router.push('/(partner)/receive-dropoff' as any)}>
              <Icon name="PackagePlus" size={18} color="#3A7BD5" />
              <Text style={styles.actionLabel}>Receive</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => router.push('/(partner)/release-pickup' as any)}>
              <Icon name="PackageCheck" size={18} color="#16A34A" />
              <Text style={styles.actionLabel}>Release</Text>
            </Pressable>
          </View>

          {/* In-store list */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>In your store ({dropoffs.length})</Text>
            {dropoffs.length > 0 && (
              <Pressable onPress={onRefresh}>
                <Icon name="RefreshCw" size={16} color="#6B7280" />
              </Pressable>
            )}
          </View>

          {dropoffs.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="Package" size={28} color="#D1D5DB" />
              <Text style={styles.emptyText}>No packages currently in your store.</Text>
            </View>
          ) : (
            dropoffs.map(d => {
              const meta = STATUS_LABEL[d.status] ?? { label: d.status, color: '#9CA3AF' };
              return (
                <View key={d.id} style={styles.dropoffRow}>
                  <View style={[styles.dropoffIcon, { backgroundColor: meta.color + '18' }]}>
                    <Icon name="Package" size={16} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropoffName}>{d.recipientName}</Text>
                    <Text style={styles.dropoffMeta}>
                      {d.dropCode} · {d.weightKg} kg
                    </Text>
                  </View>
                  <Text style={[styles.statusBadge, { color: meta.color, borderColor: meta.color }]}>
                    {meta.label}
                  </Text>
                </View>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  content:    { padding: 16, gap: 16 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },

  card:       { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel:  { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8 },
  bucketChip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  bigCount:   { fontSize: 36, fontWeight: '800', color: '#0F2B4C' },
  bigCountSecond: { fontSize: 18, color: '#9CA3AF', fontWeight: '600' },
  bar:        { height: 10, borderRadius: 5, backgroundColor: '#F3F4F6', overflow: 'hidden' },
  barFill:    { height: 10, borderRadius: 5 },
  percentText:{ fontSize: 12, color: '#6B7280' },

  toggleRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  toggleTitle: { fontSize: 14, fontWeight: '700', color: '#0F2B4C', marginBottom: 4 },
  toggleSub:   { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  pauseBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF9C3', borderColor: '#FDE68A', borderWidth: 1, padding: 10, borderRadius: 8, marginTop: 8 },
  pauseText:   { color: '#92400E', fontSize: 12, fontWeight: '600', flex: 1 },

  actionRow:  { flexDirection: 'row', gap: 10 },
  actionBtn:  { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#E5E7EB' },
  actionLabel:{ fontSize: 12, fontWeight: '600', color: '#0F2B4C' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  sectionTitle:  { fontSize: 15, fontWeight: '700', color: '#0F2B4C' },

  empty:        { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText:    { fontSize: 13, color: '#6B7280', textAlign: 'center' },

  dropoffRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#F3F4F6' },
  dropoffIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dropoffName:  { fontSize: 14, fontWeight: '600', color: '#0F2B4C' },
  dropoffMeta:  { fontSize: 11, color: '#6B7280', marginTop: 2, fontFamily: 'monospace' },
  statusBadge:  { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
});
