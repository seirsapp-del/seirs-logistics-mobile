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
import { useColors } from '@/context/ThemeContext';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default function PartnerDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
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
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} showsVerticalScrollIndicator={false}>
        {/* Brand-navy header gradient stays constant in both modes */}
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
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <>
              <View style={styles.statsRow}>
                <StatCard label="In Store"        value={data?.packagesInStore ?? 0}  icon="Package"      color="#3A7BD5" />
                <StatCard label="Collected Today"  value={data?.collectedToday ?? 0}  icon="CheckCircle2" color="#16A34A" />
                <StatCard label="Awaiting Pickup"  value={data?.awaitingPickup ?? 0}  icon="Clock"        color="#D97706" />
              </View>

              {/* Earnings card stays navy — feature card */}
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

              {/* Amber receive card — semantic warm-coloured action */}
              <Pressable
                style={[styles.scanBtn, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}
                onPress={() => router.push('/(partner)/receive-dropoff' as any)}
              >
                <View style={[styles.scanIcon, { backgroundColor: '#fff' }]}>
                  <Icon name="PackagePlus" size={24} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scanLabel, { color: '#0F2B4C' }]}>Receive Drop-off</Text>
                  <Text style={[styles.scanSub, { color: '#92400E' }]}>Sender walking in to drop a package at your store</Text>
                </View>
                <Icon name="ChevronRight" size={18} color="#9CA3AF" />
              </Pressable>

              {/* Green release card — semantic success-coloured action */}
              <Pressable
                style={[styles.scanBtn, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                onPress={() => router.push('/(partner)/release-pickup' as any)}
              >
                <View style={[styles.scanIcon, { backgroundColor: '#fff' }]}>
                  <Icon name="PackageCheck" size={24} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scanLabel, { color: '#0F2B4C' }]}>Release to Recipient</Text>
                  <Text style={[styles.scanSub, { color: '#14532D' }]}>Hand a package to recipient with ID + OTP verification</Text>
                </View>
                <Icon name="ChevronRight" size={18} color="#9CA3AF" />
              </Pressable>

              {/* Legacy scan — adapts to theme */}
              <Pressable
                style={[styles.scanBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push('/(partner)/scan' as any)}
              >
                <View style={[styles.scanIcon, { backgroundColor: colors.primaryLight }]}>
                  <Icon name="ScanLine" size={24} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scanLabel, { color: colors.text }]}>Quick Scan (legacy)</Text>
                  <Text style={[styles.scanSub, { color: colors.textSecond }]}>Mark a BusinessPackage as collected (older flow)</Text>
                </View>
                <Icon name="ChevronRight" size={18} color={colors.textThird} />
              </Pressable>

              <View style={styles.manageRow}>
                <Pressable style={[styles.manageTile, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/(partner)/capacity' as any)}>
                  <Icon name="Gauge" size={20} color={colors.accent} />
                  <Text style={[styles.manageLabel, { color: colors.text }]}>Capacity</Text>
                </Pressable>
                <Pressable style={[styles.manageTile, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/(partner)/storage' as any)}>
                  <Icon name="Clock" size={20} color="#D97706" />
                  <Text style={[styles.manageLabel, { color: colors.text }]}>Storage Fees</Text>
                </Pressable>
                <Pressable style={[styles.manageTile, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/(partner)/billing' as any)}>
                  <Icon name="TrendingUp" size={20} color="#16A34A" />
                  <Text style={[styles.manageLabel, { color: colors.text }]}>Sponsored</Text>
                </Pressable>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Packages</Text>
                <Pressable onPress={() => router.push('/(partner)/inventory' as any)}>
                  <Text style={[styles.viewAll, { color: colors.accent }]}>View all</Text>
                </Pressable>
              </View>

              {(data?.recentPackages ?? []).length === 0 ? (
                <View style={styles.empty}>
                  <Icon name="Package" size={32} color={colors.textThird} />
                  <Text style={[styles.emptyText, { color: colors.textThird }]}>No packages in store yet</Text>
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
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecond }]}>{label}</Text>
    </View>
  );
}

function PackageRow({ pkg }: { pkg: any }) {
  const colors = useColors();
  const isCollected = pkg.status === 'collected';
  return (
    <View style={[styles.pkgRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.pkgIconWrap, { backgroundColor: isCollected ? '#DCFCE7' : '#FEF3C7' }]}>
        <Icon name={isCollected ? 'PackageCheck' : 'Package'} size={18} color={isCollected ? '#16A34A' : '#D97706'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.pkgId, { color: colors.text }]} numberOfLines={1}>{pkg.trackingNumber ?? pkg.id?.slice(0, 12)}</Text>
        <Text style={[styles.pkgName, { color: colors.textSecond }]} numberOfLines={1}>{pkg.recipientName}</Text>
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
  statCard:      { flex: 1, borderRadius: 14, padding: 14, borderWidth: 1, alignItems: 'center' },
  statIcon:      { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue:     { fontSize: 22, fontWeight: '800' },
  statLabel:     { fontSize: 10, textAlign: 'center', marginTop: 2 },
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
  scanBtn:       { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1 },
  scanIcon:      { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  scanLabel:     { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  scanSub:       { fontSize: 12 },
  manageRow:     { flexDirection: 'row', gap: 10, marginVertical: 12 },
  manageTile:    { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, borderWidth: 1 },
  manageLabel:   { fontSize: 12, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:  { fontSize: 16, fontWeight: '700' },
  viewAll:       { fontSize: 13, fontWeight: '600' },
  empty:         { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:     { fontSize: 14 },
  pkgRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1 },
  pkgIconWrap:   { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pkgId:         { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  pkgName:       { fontSize: 12, marginTop: 2 },
  pkgBadge:      { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pkgBadgeText:  { fontSize: 11, fontWeight: '700' },
});
