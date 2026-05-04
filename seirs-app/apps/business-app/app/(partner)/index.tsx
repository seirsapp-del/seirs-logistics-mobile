import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/Icon';
import { Drawer } from '@/components/Drawer';
import { partnerApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function PartnerDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    partnerApi.dashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const capacity       = data?.maxCapacity ?? 50;
  const inStock        = data?.packagesInStore ?? 0;
  const capacityPct    = Math.min(100, Math.round((inStock / capacity) * 100));
  const capacityColor  = capacityPct >= 90 ? '#DC2626' : capacityPct >= 70 ? '#D97706' : '#16A34A';

  return (
    <>
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <ScrollView style={{ flex: 1, backgroundColor: '#F5F5F0' }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient
          colors={['#0F2B4C', '#163050']}
          style={[styles.header, { paddingTop: insets.top + 16 }]}
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.partnerLabel}>Partner Store</Text>
              <Text style={styles.storeName}>{user?.storeName ?? user?.name}</Text>
              <Text style={styles.partnerId}>{user?.accountId ?? 'PART-XXXXXXXX'}</Text>
            </View>
            <Pressable style={styles.logoutBtn} onPress={() => setDrawerOpen(true)}>
              <Icon name="Menu" size={20} color="#fff" strokeWidth={1.5} />
            </Pressable>
          </View>

          {/* Capacity bar */}
          <View style={styles.capacityCard}>
            <View style={styles.capacityTop}>
              <Text style={styles.capacityLabel}>Store Capacity</Text>
              <Text style={[styles.capacityPct, { color: capacityColor }]}>{capacityPct}%</Text>
            </View>
            <View style={styles.capacityTrack}>
              <View style={[styles.capacityFill, { width: `${capacityPct}%`, backgroundColor: capacityColor }]} />
            </View>
            <Text style={styles.capacityCount}>
              {inStock} / {capacity} packages
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color="#3A7BD5" style={{ marginTop: 40 }} />
          ) : (
            <>
              {/* Stats */}
              <View style={styles.statsRow}>
                <StatCard label="In Store"        value={data?.packagesInStore ?? 0}  icon="Package"      color="#3A7BD5" />
                <StatCard label="Collected Today"  value={data?.collectedToday ?? 0}  icon="CheckCircle2" color="#16A34A" />
                <StatCard label="Awaiting Pickup"  value={data?.awaitingPickup ?? 0}  icon="Clock"        color="#D97706" />
              </View>

              {/* This week's earnings */}
              <View style={styles.earningsCard}>
                <View style={styles.earningsLeft}>
                  <Text style={styles.earningsLabel}>This Week's Earnings</Text>
                  <Text style={styles.earningsAmount}>{fmt(data?.weekEarnings ?? 0)}</Text>
                  <Text style={styles.earningsSub}>Payout every Monday</Text>
                </View>
                <Pressable
                  style={styles.earningsBtn}
                  onPress={() => router.push('/(partner)/earnings' as any)}
                >
                  <Icon name="ArrowRight" size={18} color="#0F2B4C" />
                </Pressable>
              </View>

              {/* Quick actions */}
              <Pressable
                style={[styles.scanBtn, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}
                onPress={() => router.push('/(partner)/receive-dropoff' as any)}
              >
                <View style={styles.scanIcon}>
                  <Icon name="PackagePlus" size={24} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scanLabel}>Receive Drop-off</Text>
                  <Text style={styles.scanSub}>Sender walking in to drop a package at your store</Text>
                </View>
                <Icon name="ChevronRight" size={18} color="#9CA3AF" />
              </Pressable>

              <Pressable
                style={[styles.scanBtn, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                onPress={() => router.push('/(partner)/release-pickup' as any)}
              >
                <View style={styles.scanIcon}>
                  <Icon name="PackageCheck" size={24} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scanLabel}>Release to Recipient</Text>
                  <Text style={styles.scanSub}>Hand a package to recipient with ID + OTP verification</Text>
                </View>
                <Icon name="ChevronRight" size={18} color="#9CA3AF" />
              </Pressable>

              <Pressable
                style={styles.scanBtn}
                onPress={() => router.push('/(partner)/scan' as any)}
              >
                <View style={styles.scanIcon}>
                  <Icon name="ScanLine" size={24} color="#3A7BD5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scanLabel}>Quick Scan (legacy)</Text>
                  <Text style={styles.scanSub}>Mark a BusinessPackage as collected (older flow)</Text>
                </View>
                <Icon name="ChevronRight" size={18} color="#9CA3AF" />
              </Pressable>

              {/* Spec V8 §4.9-§4.11 — manage tiles */}
              <View style={styles.manageRow}>
                <Pressable style={styles.manageTile} onPress={() => router.push('/(partner)/capacity' as any)}>
                  <Icon name="Gauge" size={20} color="#3A7BD5" />
                  <Text style={styles.manageLabel}>Capacity</Text>
                </Pressable>
                <Pressable style={styles.manageTile} onPress={() => router.push('/(partner)/storage' as any)}>
                  <Icon name="Clock" size={20} color="#D97706" />
                  <Text style={styles.manageLabel}>Storage Fees</Text>
                </Pressable>
                <Pressable style={styles.manageTile} onPress={() => router.push('/(partner)/billing' as any)}>
                  <Icon name="TrendingUp" size={20} color="#16A34A" />
                  <Text style={styles.manageLabel}>Sponsored</Text>
                </Pressable>
              </View>

              {/* Recent packages */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Packages</Text>
                <Pressable onPress={() => router.push('/(partner)/inventory' as any)}>
                  <Text style={styles.viewAll}>View all</Text>
                </Pressable>
              </View>

              {(data?.recentPackages ?? []).length === 0 ? (
                <View style={styles.empty}>
                  <Icon name="Package" size={32} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No packages in store yet</Text>
                </View>
              ) : (
                data.recentPackages.map((p: any) => (
                  <PackageRow key={p.id} pkg={p} />
                ))
              )}
            </>
          )}
        </View>
      </ScrollView>
    </>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PackageRow({ pkg }: { pkg: any }) {
  const isCollected = pkg.status === 'collected';
  return (
    <View style={styles.pkgRow}>
      <View style={[styles.pkgIconWrap, { backgroundColor: isCollected ? '#DCFCE7' : '#FEF3C7' }]}>
        <Icon name={isCollected ? 'PackageCheck' : 'Package'} size={18} color={isCollected ? '#16A34A' : '#D97706'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pkgId} numberOfLines={1}>{pkg.trackingNumber ?? pkg.id?.slice(0, 12)}</Text>
        <Text style={styles.pkgName} numberOfLines={1}>{pkg.recipientName}</Text>
      </View>
      <View style={[styles.pkgBadge, { backgroundColor: isCollected ? '#DCFCE7' : '#FEF3C7' }]}>
        <Text style={[styles.pkgBadgeText, { color: isCollected ? '#16A34A' : '#D97706' }]}>
          {isCollected ? 'Collected' : 'Awaiting'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header:        { paddingHorizontal: 24, paddingBottom: 28 },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  partnerLabel:  { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  storeName:     { fontSize: 20, fontWeight: '800', color: '#fff' },
  partnerId:     { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', marginTop: 4 },
  logoutBtn:     {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  capacityCard:  {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  capacityTop:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  capacityLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  capacityPct:   { fontSize: 16, fontWeight: '800' },
  capacityTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  capacityFill:  { height: 8, borderRadius: 4 },
  capacityCount: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  body:          { padding: 20 },
  statsRow:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard:      {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#F3F4F6', alignItems: 'center',
  },
  statIcon:      { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue:     { fontSize: 22, fontWeight: '800', color: '#0F2B4C' },
  statLabel:     { fontSize: 10, color: '#6B7280', textAlign: 'center', marginTop: 2 },
  earningsCard:  {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#0F2B4C', borderRadius: 14, padding: 20, marginBottom: 16,
  },
  earningsLeft:  {},
  earningsLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  earningsAmount:{ fontSize: 24, fontWeight: '800', color: '#fff' },
  earningsSub:   { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  earningsBtn:   {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  scanBtn:       {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#EBF3FF', borderRadius: 14, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  scanIcon:      {
    width: 48, height: 48, borderRadius: 14, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  scanLabel:     { fontSize: 15, fontWeight: '700', color: '#0F2B4C', marginBottom: 2 },
  scanSub:       { fontSize: 12, color: '#6B7280' },
  manageRow:     { flexDirection: 'row', gap: 10, marginVertical: 12 },
  manageTile:    {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#F3F4F6',
  },
  manageLabel:   { fontSize: 12, fontWeight: '600', color: '#0F2B4C' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: '#0F2B4C' },
  viewAll:       { color: '#3A7BD5', fontSize: 13, fontWeight: '600' },
  empty:         { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:     { fontSize: 14, color: '#9CA3AF' },
  pkgRow:        {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  pkgIconWrap:   { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pkgId:         { fontSize: 12, fontWeight: '700', color: '#0F2B4C', fontFamily: 'monospace' },
  pkgName:       { fontSize: 12, color: '#6B7280', marginTop: 2 },
  pkgBadge:      { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pkgBadgeText:  { fontSize: 11, fontWeight: '700' },
});
