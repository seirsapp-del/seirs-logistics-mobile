import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, StatusBar,
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
import { naira } from '@/utils/money';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

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
    { label: tr('auto.tabsIndex.todaySDeliveries', 'Today\'s Deliveries'), value: data?.todayDeliveries ?? 0, icon: 'Package' as const, hue: 'blue'  as const },
    { label: tr('auto.tabsIndex.active', 'Active'),              value: data?.activeDeliveries ?? 0, icon: 'Zap'     as const, hue: 'green' as const },
    { label: tr('auto.tabsIndex.pending', 'Pending'),             value: data?.pendingDeliveries ?? 0, icon: 'Clock'   as const, hue: 'amber' as const },
    { label: tr('auto.tabsIndex.loyaltyPoints', 'Loyalty Points'),      value: data?.loyaltyPoints ?? 0,    icon: 'Star'    as const, hue: 'amber' as const },
  ];

  return (
    <>
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      {/*
       * The customer app's top bar, exactly (founder 2026-09-06): the
       * page background, the hamburger and the bell on light plates, the
       * okada mark and wordmark centred and theme-coloured. The solid navy
       * bar this replaced painted the status bar navy too, so in light
       * mode a user could not read their own clock or signal. It stays
       * pinned above the scroll (founder 2026-08-15).
       */}
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.topBar, { paddingTop: insets.top + 8, backgroundColor: colors.background }]}>
        <Pressable style={[styles.menuBtn, { backgroundColor: colors.surface }]} onPress={() => setDrawerOpen(true)}>
          <Icon name="AlignLeft" size={20} color={colors.text} strokeWidth={2} />
        </Pressable>
        <View style={styles.brandSlot}>
          <SeirsMarkBold size={46} color={colors.text} hubColor={colors.background} />
          <Text style={[styles.brandWord, { color: colors.text }]}>SEIRS</Text>
        </View>
        <View style={[styles.menuBtn, { backgroundColor: colors.surface }]}>
          <NotificationBell size={20} color={colors.text} />
        </View>
      </View>
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} showsVerticalScrollIndicator={false}>
        {/* Header: keeps the brand navy gradient in both modes since it
            is intentionally dark-on-dark (text reads on either scheme). */}
        {/* The wallet hero is gone (founder 2026-08-16): the dashboard
            leads with the same living carousel the customer app has, so
            businesses get the news, promos and product updates too. */}
        {/* The customer home's amber banner, for a booking still waiting to
            be paid (founder 2026-09-06: the business app had nothing like
            it, so a recurring run created an hour before pickup was
            invisible until somebody opened the Deliveries tab). */}
        {data?.awaitingPayment && (
          <Pressable
            style={[styles.activeBanner, { backgroundColor: isDark ? '#1C2128' : '#FFF8E6', borderColor: '#FFBE0B' }]}
            onPress={() => router.push(`/(business)/delivery/${data.awaitingPayment.id}` as any)}
          >
            <View style={[styles.activeDot, { backgroundColor: '#FFBE0B' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.activeBannerTitle, { color: colors.text }]}>
                {data.awaitingPayment.isRecurring ? tx9('auto.tabsIndex.recurringRunWaitingForPayment', 'Recurring run waiting for payment') : tx9('auto.tabsIndex.waitingForPayment', 'Waiting for payment')}
                {data.awaitingPayment.scheduledFor
                  ? tx9('auto.tabsIndex.payBefore', '· pay before {{v0}}', { v0: new Date(data.awaitingPayment.scheduledFor).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) })
                  : ''}
              </Text>
              <Text style={[styles.activeBannerSub, { color: colors.textSecond }]} numberOfLines={1}>
                {data.awaitingPayment.trackingCode} · {naira(data.awaitingPayment.price)}
                {data.awaitingPayment.dropoffAddress ? ` · to ${data.awaitingPayment.dropoffAddress}` : ''}
              </Text>
            </View>
            <Icon name="ChevronRight" size={18} color={colors.primary} />
          </Pressable>
        )}
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
            <Text style={[styles.chipText, { color: colors.textSecond }]}>{tx('auto.index.stories', 'Stories')}</Text>
          </Pressable>
          <Pressable
            style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push('/(business)/notifications' as any)}
          >
            <Icon name="Bell" size={14} color={colors.textSecond} />
            <Text style={[styles.chipText, { color: colors.textSecond }]}>{tx('auto.index.alerts', 'Alerts')}</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{tx('auto.index.quickActions', 'Quick Actions')}</Text>
              <View style={styles.actions}>
                <ActionCard icon="Package"         label={tx('auto.index.sendAPackage', 'Send a Package')} sub={tr('auto.tabsIndex.oneOrManyPackagesOne', 'One or many packages, one payment')}
                  onPress={() => router.push('/(business)/send-package' as any)} primary />
                {/* Special Cargo is the quote-first lane, the same thing the
                    customer app calls Special delivery (founder 2026-09-06).
                    It used to open Send with a truck preselected, which made
                    it the same button as Send a Package with one chip moved.
                    A generator, a transformer or a shop's worth of fittings
                    is not a rate-card job: a person prices it, so the card
                    opens the request form and never the rate card. */}
                <ActionCard icon="Truck"           label={tx('auto.index.specialCargo', 'Special Cargo')} sub={tr('auto.tabsIndex.heavyOrUnusualLoadsQuoted', 'Heavy or unusual loads, quoted by a person')}
                  onPress={() => router.push('/(business)/special-request' as any)} />
                {/*
                  * Cargo Space was reachable from the drawer only, while the
                  * customer app puts its equivalent on the home screen. That
                  * is backwards: room on a lorry already making the run is
                  * worth more to a trader than Travel Buddy is to a customer,
                  * and it is the harder of the two to stumble across. Founder
                  * approved promoting it on 2026-09-04; the drawer entry
                  * stays. Route, not Truck, so it does not read as a second
                  * Special Cargo sitting next to the first. "Interstate" is
                  * in the line because nobody could tell what it was for
                  * (founder 2026-09-06).
                  */}
                <ActionCard icon="Route"           label={tx('auto.index.cargoSpace', 'Cargo Space')} sub={tr('auto.tabsIndex.interstateTripsRoomOnA', 'Interstate trips: room on a run already being made')}
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
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{tx('auto.index.recentDeliveries', 'Recent Deliveries')}</Text>
                <Pressable onPress={() => router.push('/(business)/(tabs)/deliveries' as any)}>
                  <Text style={[styles.viewAll, { color: colors.accent }]}>{tx('auto.index.viewAll', 'View all')}</Text>
                </Pressable>
              </View>

              {(data?.recentDeliveries ?? []).length === 0 ? (
                <View style={styles.emptyBox}>
                  <Icon name="Package" size={32} color={colors.textThird} />
                  <Text style={[styles.emptyText, { color: colors.textThird }]}>{tx('auto.index.noDeliveriesYet', 'No deliveries yet')}</Text>
                  <Pressable
                    style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                    onPress={() => router.push('/(business)/send-package' as any)}
                  >
                    <Text style={styles.emptyBtnText}>{tx('auto.index.createYourFirstDelivery', 'Create your first delivery')}</Text>
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
  // Awaiting-payment banner, same shape as the customer home (2026-09-06).
  activeBanner:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  activeDot:         { width: 10, height: 10, borderRadius: 5 },
  activeBannerTitle: { fontSize: 14, fontWeight: '600' },
  activeBannerSub:   { fontSize: 12, marginTop: 2 },
  header:      { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 28 },
  topBar:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  // Same plates and lockup as the customer home (2026-09-06).
  menuBtn:   { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 1 },
  brandSlot: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  brandWord: { fontSize: 15, fontWeight: '900', letterSpacing: 2.2 },
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
