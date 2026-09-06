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
import { useColors, useTheme } from '@/context/ThemeContext';
import { naira } from '@/utils/money';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';


export default function PartnerDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useColors();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A swallowed error used to be indistinguishable from an empty,
  // correctly-configured store: the catch was silent and capacity fell
  // back to a fabricated 50, so an outage rendered a confident
  // "0 / 50 packages" bar (B-2.2). Hold the failure and say so instead.
  const [loadError,  setLoadError]  = useState(false);

  useEffect(() => {
    partnerApi.dashboard()
      .then((d) => { setData(d); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const capacity       = Number(data?.maxCapacity ?? 0);
  const inStock        = data?.packagesInStore ?? 0;
  const capacityPct    = capacity > 0 ? Math.min(100, Math.round((inStock / capacity) * 100)) : 0;
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
              <Text style={styles.partnerLabel}>{tx('auto.index.partnerStore', 'Partner Store')}</Text>
              <Text style={styles.storeName}>{data?.storeName ?? user?.storeName ?? user?.name}</Text>
              {/* The SHOP's public code, not the owner's account ID
                  (2026-08-12): this line used to print the BIZ- account
                  ID behind a PART- placeholder, which read as though the
                  account and the shop were the same thing. */}
              <Text style={styles.partnerId}>{data?.storeCode ?? 'Code pending approval'}</Text>
            {/* There was NO way back to the business side once you entered
                partner mode (founder 2026-08-16). Same account, two hats:
                this returns to sending without signing out. */}
            <Pressable
              style={styles.switchBtn}
              onPress={() => router.replace('/(business)/(tabs)' as any)}
            >
              <Icon name="ArrowLeft" size={13} color="#fff" />
              <Text style={styles.switchText}>{tx('auto.index.backToBusiness', 'Back to business')}</Text>
            </Pressable>
            </View>
            <Pressable style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
              <Icon name="Menu" size={20} color="#fff" strokeWidth={1.5} />
            </Pressable>
          </View>

          <View style={styles.capacityCard}>
            <View style={styles.capacityTop}>
              <Text style={styles.capacityLabel}>{tx('auto.index.storeCapacity', 'Store Capacity')}</Text>
              <Text style={[styles.capacityPct, { color: capacityColor }]}>{capacityPct}%</Text>
            </View>
            <View style={styles.capacityTrack}>
              <View style={[styles.capacityFill, { width: `${capacityPct}%`, backgroundColor: capacityColor }]} />
            </View>
            <Text style={styles.capacityCount}>
              {loadError
                ? 'Could not load store status. Pull to refresh.'
                : capacity > 0
                  ? `${inStock} / ${capacity} packages`
                  : `${inStock} packages, capacity not set`}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <>
              <View style={styles.statsRow}>
                <StatCard label={tx('auto.index.inStore', 'In Store')}        value={data?.packagesInStore ?? 0}  icon="Package"      color="#3A7BD5" />
                <StatCard label={tx('auto.index.collectedToday', 'Collected Today')}  value={data?.collectedToday ?? 0}  icon="CheckCircle2" color="#16A34A" />
                <StatCard label={tx('auto.index.awaitingPickup', 'Awaiting Pickup')}  value={data?.awaitingPickup ?? 0}  icon="Clock"        color="#D97706" />
              </View>

              {/* Earnings card stays navy: feature card */}
              <View style={styles.earningsCard}>
                <View style={styles.earningsLeft}>
                  <Text style={styles.earningsLabel}>{tx('auto.index.thisWeekSEarnings', 'This Week\'s Earnings')}</Text>
                  <Text style={styles.earningsAmount}>{naira(data?.weekEarnings ?? 0)}</Text>
                  <Text style={styles.earningsSub}>{tx('auto.index.payoutEveryMonday', 'Payout every Monday')}</Text>
                </View>
                <Pressable
                  style={styles.earningsBtn}
                  onPress={() => router.push('/(partner)/earnings' as any)}
                >
                  <Icon name="ArrowRight" size={18} color="#0F2B4C" />
                </Pressable>
              </View>

              {/* Amber receive card: semantic warm-coloured action */}
              <Pressable
                /* Was a cream #FFF7ED card with white icon circles: a
                   light-mode panel glaring out of a dark screen while
                   every other card used the shared palette (founder
                   2026-08-17). The amber still marks "receive", it is
                   just tinted onto the surface instead of replacing it. */
                style={[styles.scanBtn, { backgroundColor: isDark ? '#D9770622' : '#FFF7ED', borderColor: isDark ? '#D9770655' : '#FED7AA' }]}
                onPress={() => router.push('/(partner)/receive-dropoff' as any)}
              >
                <View style={[styles.scanIcon, { backgroundColor: isDark ? colors.surface : '#fff' }]}>
                  <Icon name="PackagePlus" size={24} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scanLabel, { color: colors.text }]}>{tx('auto.index.receiveDropOff', 'Receive Drop-off')}</Text>
                  <Text style={[styles.scanSub, { color: isDark ? '#F59E0B' : '#92400E' }]}>{tx('auto.index.senderWalkingInToDrop', 'Sender walking in to drop a package at your store')}</Text>
                </View>
                <Icon name="ChevronRight" size={18} color="#9CA3AF" />
              </Pressable>

              {/* Green release card: semantic success-coloured action */}
              <Pressable
                style={[styles.scanBtn, { backgroundColor: isDark ? '#16A34A22' : '#F0FDF4', borderColor: isDark ? '#16A34A55' : '#BBF7D0' }]}
                onPress={() => router.push('/(partner)/release-pickup' as any)}
              >
                <View style={[styles.scanIcon, { backgroundColor: isDark ? colors.surface : '#fff' }]}>
                  <Icon name="PackageCheck" size={24} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scanLabel, { color: colors.text }]}>{tx('auto.index.releaseToRecipient', 'Release to Recipient')}</Text>
                  <Text style={[styles.scanSub, { color: isDark ? '#86EFAC' : '#14532D' }]}>{tr('auto.tabsIndex.handAPackageToRecipient', 'Hand a package to recipient with ID + OTP verification')}</Text>
                </View>
                <Icon name="ChevronRight" size={18} color="#9CA3AF" />
              </Pressable>

              {/* Legacy scan: adapts to theme */}
              <Pressable
                style={[styles.scanBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push('/(partner)/scan' as any)}
              >
                <View style={[styles.scanIcon, { backgroundColor: colors.primaryLight }]}>
                  <Icon name="ScanLine" size={24} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  {/* "Quick Scan (legacy)" and "BusinessPackage" are our
                      words, not a shopkeeper's (founder QA 2026-08-17). */}
                  <Text style={[styles.scanLabel, { color: colors.text }]}>{tx('auto.index.scanAPackageCode', 'Scan a package code')}</Text>
                  <Text style={[styles.scanSub, { color: colors.textSecond }]}>{tx('auto.index.markAPackageCollectedBy', 'Mark a package collected by typing or scanning its code')}</Text>
                </View>
                <Icon name="ChevronRight" size={18} color={colors.textThird} />
              </Pressable>

              <View style={styles.manageRow}>
                <Pressable style={[styles.manageTile, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/(partner)/capacity' as any)}>
                  <Icon name="Gauge" size={20} color={colors.accent} />
                  <Text style={[styles.manageLabel, { color: colors.text }]}>{tx('auto.index.capacity', 'Capacity')}</Text>
                </Pressable>
                <Pressable style={[styles.manageTile, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/(partner)/storage' as any)}>
                  <Icon name="Clock" size={20} color="#D97706" />
                  <Text style={[styles.manageLabel, { color: colors.text }]}>{tx('auto.index.storageFees', 'Storage Fees')}</Text>
                </Pressable>
                <Pressable style={[styles.manageTile, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/(partner)/billing' as any)}>
                  <Icon name="TrendingUp" size={20} color="#16A34A" />
                  <Text style={[styles.manageLabel, { color: colors.text }]}>{tx('auto.index.sponsored', 'Sponsored')}</Text>
                </Pressable>
              </View>

              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{tx('auto.index.recentPackages', 'Recent Packages')}</Text>
                <Pressable onPress={() => router.push('/(partner)/inventory' as any)}>
                  <Text style={[styles.viewAll, { color: colors.accent }]}>{tx('auto.index.viewAll', 'View all')}</Text>
                </Pressable>
              </View>

              {(data?.recentPackages ?? []).length === 0 ? (
                <View style={styles.empty}>
                  <Icon name="Package" size={32} color={colors.textThird} />
                  <Text style={[styles.emptyText, { color: colors.textThird }]}>{tx('auto.index.noPackagesInStoreYet', 'No packages in store yet')}</Text>
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
  partnerLabel:  { fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  storeName:     { fontSize: 20, fontWeight: '800', color: '#fff' },
  switchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)',
  },
  switchText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  partnerId:     { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', marginTop: 4 },
  // Was called logoutBtn (B-9.4): it has opened the drawer, not signed
  // anyone out, since the header was reworked.
  menuBtn:       {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  capacityCard:  {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  capacityTop:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  capacityLabel: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  capacityPct:   { fontSize: 16, fontWeight: '800' },
  capacityTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  capacityFill:  { height: 8, borderRadius: 4 },
  capacityCount: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  body:          { padding: 20 },
  statsRow:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard:      { flex: 1, borderRadius: 14, padding: 14, borderWidth: 1, alignItems: 'center' },
  statIcon:      { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue:     { fontSize: 22, fontWeight: '800' },
  statLabel:     { fontSize: 11, textAlign: 'center', marginTop: 2 },
  earningsCard:  {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#0F2B4C', borderRadius: 14, padding: 20, marginBottom: 16,
  },
  earningsLeft:  {},
  earningsLabel: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  earningsAmount:{ fontSize: 24, fontWeight: '800', color: '#fff' },
  earningsSub:   { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  earningsBtn:   {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  scanBtn:       { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1 },
  scanIcon:      { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  scanLabel:     { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  scanSub:       { fontSize: 13 },
  manageRow:     { flexDirection: 'row', gap: 10, marginVertical: 12 },
  manageTile:    { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, borderWidth: 1 },
  manageLabel:   { fontSize: 13, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:  { fontSize: 16, fontWeight: '700' },
  viewAll:       { fontSize: 14, fontWeight: '600' },
  empty:         { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:     { fontSize: 15 },
  pkgRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1 },
  pkgIconWrap:   { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pkgId:         { fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  pkgName:       { fontSize: 13, marginTop: 2 },
  pkgBadge:      { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pkgBadgeText:  { fontSize: 12, fontWeight: '700' },
});
