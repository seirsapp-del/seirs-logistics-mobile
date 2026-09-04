import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { HeroCarousel } from '@/components/HeroCarousel';
import { Drawer } from '@/components/Drawer';
import { SeirsMarkBold } from '@/components/SeirsLogoV2';
import { NotificationBell } from '@/components/NotificationBell';
import { businessApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useColors, useTheme } from '@/context/ThemeContext';
import { tint, statusTint } from '@/constants/tint';

export default function BusinessDashboard() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const colors   = useColors();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    businessApi.dashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Hue, not a raw hex. The icon circle used to be `color + '18'` with
  // the same hex as its own icon, which composites to under 3:1 over
  // the light surface for the green and amber tiles: below the WCAG
  // floor for a graphical object, and on the first screen of the app
  // (2026-08-24).
  const stats = [
    { label: 'Today\'s Deliveries', value: data?.todayDeliveries ?? 0, icon: 'Package' as const, hue: 'blue'  as const },
    { label: 'Active',              value: data?.activeDeliveries ?? 0, icon: 'Zap'     as const, hue: 'green' as const },
    { label: 'Pending',             value: data?.pendingDeliveries ?? 0, icon: 'Clock'   as const, hue: 'amber' as const },
    { label: 'Loyalty Points',      value: data?.loyaltyPoints ?? 0,    icon: 'Star'    as const, hue: 'amber' as const },
  ];

  return (
    <>
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      {/* Greeting + bell + drawer stay pinned (founder 2026-08-15: the
          hamburger scrolled away with the header, stranding the drawer).
          Solid navy matches the top of the gradient below so the seam is
          invisible; only the wallet card scrolls. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.avatarBtn} onPress={() => setDrawerOpen(true)}>
          <Icon name="AlignLeft" size={20} color="#fff" strokeWidth={1.75} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          {/* Brand eyebrow: screenshots carry the okada (founder
              2026-08-22), and the greeting stays as this app's voice. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <SeirsMarkBold size={34} color="#FFFFFF" hubColor="#0F2B4C" />
            <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800', letterSpacing: 1.8 }}>SEIRS</Text>
          </View>
          <Text style={styles.companyName}>Hi, {user?.name?.split(' ')[0] ?? user?.companyName?.split(' ')[0]}</Text>
        </View>
        <View style={styles.avatarBtn}>
          <NotificationBell size={20} color="#fff" />
        </View>
      </View>
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} showsVerticalScrollIndicator={false}>
        {/* Header: keeps the brand navy gradient in both modes since it
            is intentionally dark-on-dark (text reads on either scheme). */}
        {/* The wallet hero is gone (founder 2026-08-16): the dashboard
            leads with the same living carousel the customer app has, so
            businesses get the news, promos and product updates too. */}
        <View style={{ marginTop: 12 }}>
          <HeroCarousel />
        </View>

        {/* Quick-access chips: points lead (they open the Wallet tab's
            Rewards), then Stories and Alerts: the customer pattern. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          <Pressable
            style={[styles.chip, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
            onPress={() => router.push('/(business)/(tabs)/wallet' as any)}
          >
            <Icon name="Star" size={14} color={colors.primary} />
            <Text style={[styles.chipText, { color: colors.primary }]}>
              {(data?.loyaltyPoints ?? 0).toLocaleString()} pts
            </Text>
          </Pressable>
          <Pressable
            style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push('/(business)/stories' as any)}
          >
            <Icon name="FileText" size={14} color={colors.textSecond} />
            <Text style={[styles.chipText, { color: colors.textSecond }]}>Stories</Text>
          </Pressable>
          <Pressable
            style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push('/(business)/notifications' as any)}
          >
            <Icon name="Bell" size={14} color={colors.textSecond} />
            <Text style={[styles.chipText, { color: colors.textSecond }]}>Alerts</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
              <View style={styles.actions}>
                <ActionCard icon="Package"         label="Send a Package" sub="One or many packages, one payment"
                  onPress={() => router.push('/(business)/send-package' as any)} primary />
                {/* Both cards pushed the same route with no distinguishing
                    param and send-package read none, so "Special Cargo"
                    promised trucks and cold chain and preselected nothing
                    (B-1.3). It now arrives on the vehicle step with a truck
                    already chosen. */}
                <ActionCard icon="Truck"           label="Special Cargo" sub="Trucks, cold chain & heavy loads"
                  onPress={() => router.push({ pathname: '/(business)/send-package', params: { preset: 'cargo' } } as any)} />
                {/*
                  * Cargo Space was reachable from the drawer only, while the
                  * customer app puts its equivalent on the home screen. That
                  * is backwards: room on a lorry already making the run is
                  * worth more to a trader than Travel Buddy is to a customer,
                  * and it is the harder of the two to stumble across. Founder
                  * approved promoting it on 2026-09-04; the drawer entry
                  * stays. Route, not Truck, so it does not read as a second
                  * Special Cargo sitting next to the first.
                  */}
                <ActionCard icon="Route"           label="Cargo Space" sub="Room on a trip already being made"
                  onPress={() => router.push('/(business)/cargo-space' as any)} />
              </View>

              <View style={styles.statsGrid}>
                {stats.map((s) => (
                  <View
                    key={s.label}
                    style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <View style={[styles.statIcon, { backgroundColor: tint(s.hue, isDark).bg }]}>
                      <Icon name={s.icon} size={18} color={tint(s.hue, isDark).fg} />
                    </View>
                    <Text style={[styles.statValue, { color: colors.text }]}>{s.value.toLocaleString()}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecond }]}>{s.label}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Deliveries</Text>
                <Pressable onPress={() => router.push('/(business)/(tabs)/deliveries' as any)}>
                  <Text style={[styles.viewAll, { color: colors.accent }]}>View all</Text>
                </Pressable>
              </View>

              {(data?.recentDeliveries ?? []).length === 0 ? (
                <View style={styles.emptyBox}>
                  <Icon name="Package" size={32} color={colors.textThird} />
                  <Text style={[styles.emptyText, { color: colors.textThird }]}>No deliveries yet</Text>
                  <Pressable
                    style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                    onPress={() => router.push('/(business)/send-package' as any)}
                  >
                    <Text style={styles.emptyBtnText}>Create your first delivery</Text>
                  </Pressable>
                </View>
              ) : (
                data.recentDeliveries.map((d: any) => (
                  <DeliveryRow key={d.id} delivery={d} />
                ))
              )}
            </>
          )}
        </View>
      </ScrollView>
    </>
  );
}

function ActionCard({ icon, label, sub, onPress, primary }: {
  icon: any; label: string; sub: string; onPress: () => void; primary?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={[
        styles.actionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        primary && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
      onPress={onPress}
    >
      <View style={[
        styles.actionIcon,
        { backgroundColor: colors.primaryLight },
        primary && { backgroundColor: 'rgba(255,255,255,0.15)' },
      ]}>
        <Icon name={icon} size={20} color={primary ? '#fff' : colors.primary} />
      </View>
      <Text style={[
        styles.actionLabel,
        { color: colors.text },
        primary && { color: '#fff' },
      ]}>{label}</Text>
      <Text style={[
        styles.actionSub,
        { color: colors.textSecond },
        primary && { color: 'rgba(255,255,255,0.7)' },
      ]}>{sub}</Text>
    </Pressable>
  );
}

function DeliveryRow({ delivery }: { delivery: any }) {
  const colors = useColors();
  const { isDark } = useTheme();
  // This was the THIRD private copy of a status-colour map in this
  // app, and like the other two it drew cancelled in red, which made
  // it indistinguishable from failed. One shared mapping now, and one
  // that reads in light mode as well as dark (2026-08-24).
  const st = statusTint(delivery.status, isDark);
  return (
    <View style={[styles.deliveryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.deliveryLeft}>
        <Text style={[styles.deliveryId, { color: colors.text }]}>{delivery.trackingNumber ?? delivery.trackingCode ?? delivery.id?.slice(0, 8)}</Text>
        <Text style={[styles.deliveryAddr, { color: colors.textSecond }]} numberOfLines={1}>
          {delivery.dropoffAddress ?? delivery.pickupAddress ?? '-'}
        </Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
        <Text style={[styles.statusText, { color: st.fg }]}>{delivery.status}</Text>
      </View>
    </View>
  );
}

// Structural styles only: colors come from useColors() and override at use site.
const styles = StyleSheet.create({
  header:      { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 28 },
  topBar:      {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#0F2B4C',
  },
  chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  greeting:    { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  companyName: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  avatarBtn:   {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  // walletCard / walletLabel / walletBalance / fundBtn / fundBtnText
  // removed 2026-08-23 (B-4.4): a literal fund-wallet button stylesheet
  // that outlived its JSX. Senders hold no balance with SEIRS, so there
  // is nothing here to fund.
  body:          { padding: 20 },
  statsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard:      {
    flex: 1, minWidth: '44%', borderRadius: 14,
    padding: 16, borderWidth: 1,
  },
  statIcon:      {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  statValue:     { fontSize: 22, fontWeight: '800' },
  statLabel:     { fontSize: 12, marginTop: 2 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  viewAll:       { fontSize: 14, fontWeight: '600' },
  actions:       { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  actionCard:    {
    flex: 1, minWidth: '44%', borderRadius: 14,
    padding: 16, borderWidth: 1,
  },
  actionIcon:    {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  actionLabel:   { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  actionSub:     { fontSize: 12 },
  emptyBox:      { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText:     { fontSize: 15 },
  emptyBtn:      { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  emptyBtnText:  { color: '#fff', fontWeight: '600', fontSize: 14 },
  deliveryRow:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1,
  },
  deliveryLeft:  { flex: 1 },
  deliveryId:    { fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
  deliveryAddr:  { fontSize: 13, marginTop: 2 },
  statusBadge:   { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:    { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
});
