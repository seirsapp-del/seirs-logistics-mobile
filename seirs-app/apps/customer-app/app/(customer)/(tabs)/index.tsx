import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
  TextInput, Dimensions, Alert, RefreshControl, Animated, Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Colors, Spacing, Radius, FontSize, FontWeight, Shadows,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { NotificationBell } from '@/components/NotificationBell';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/Drawer';
import { Illustration } from '@/components/Illustration';
import { HeroCarousel } from '@/components/HeroCarousel';
import { SeirsMarkBold } from '@/components/SeirsLogoV2';
import { deliveriesApi, loyaltyApi } from '@/services/api';
import {
  AlignLeft, MapPin, Package, Car, Search,
  Bell, TrendingUp, ChevronRight, Sparkles,
  Newspaper, Truck,
} from 'lucide-react-native';

const { width: W } = Dimensions.get('window');

function getGreetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'home.goodMorning';
  if (h < 17) return 'home.goodAfternoon';
  return 'home.goodEvening';
}

type TripTab = 'in_progress' | 'delivered' | 'featured';

function statusVariant(s: string): any {
  return s === 'completed' ? 'success' : s === 'in_progress' ? 'info' : s === 'cancelled' ? 'error' : 'default';
}

export default function CustomerHomeScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { user } = useAuth();
  const { t }    = useTranslation();

  const firstName  = user?.name?.split(' ')[0] ?? 'there';

  const insets = useSafeAreaInsets();
  const [activeTab,     setActiveTab]     = useState<TripTab>('in_progress');
  const [drawerVisible, setDrawerVisible] = useState(false);
  // Points (loyalty) replaces NGN balance on the home: customers don't
  // hold NGN per CBN rules. Rewards/Points are the value-on-account proxy.
  const [points,        setPoints]        = useState<number | null>(null);

  // Floating action buttons (Send + Ride): auto-hide on scroll-down,
  // show on scroll-up. Each button expands its label briefly on press
  // for a satisfying tap-to-action animation.
  const fabTranslate = useRef(new Animated.Value(0)).current;
  const lastScrollY  = useRef(0);
  const fabHidden    = useRef(false);
  const sendWidth    = useRef(new Animated.Value(56)).current;
  const rideWidth    = useRef(new Animated.Value(56)).current;

  const showFabs = useCallback(() => {
    if (!fabHidden.current) return;
    fabHidden.current = false;
    Animated.timing(fabTranslate, { toValue: 0, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start();
  }, [fabTranslate]);

  const hideFabs = useCallback(() => {
    if (fabHidden.current) return;
    fabHidden.current = true;
    Animated.timing(fabTranslate, { toValue: 140, duration: 200, useNativeDriver: true, easing: Easing.in(Easing.cubic) }).start();
  }, [fabTranslate]);

  const onScrollEvent = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y > lastScrollY.current + 8) hideFabs();
    else if (y < lastScrollY.current - 8) showFabs();
    lastScrollY.current = y;
  };

  const animateAndGo = (which: 'send' | 'ride') => {
    const widthRef = which === 'send' ? sendWidth : rideWidth;
    Animated.sequence([
      Animated.timing(widthRef, { toValue: 180, duration: 180, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(widthRef, { toValue: 56,  duration: 180, useNativeDriver: false, easing: Easing.in(Easing.cubic), delay: 80 }),
    ]).start();
    setTimeout(() => router.push((which === 'send' ? '/(customer)/send' : '/(customer)/request') as any), 220);
  };
  const [trips,         setTrips]         = useState<Array<{
    id: string; status: string; date: string; dropoffAddress: string; price: number; distance: string;
  }>>([]);
  const [refreshing,    setRefreshing]    = useState(false);

  const reload = useCallback(async () => {
    try {
      const [loyalty, deliveries] = await Promise.all([
        loyaltyApi.balance().catch(() => null),
        deliveriesApi.myDeliveries(1, 20).catch(() => ({ items: [] })),
      ]);
      if (loyalty) setPoints(Number(loyalty.balance ?? 0));
      const mapped = (deliveries.items ?? []).map((d: any) => ({
        id:             d.id,
        status:         String(d.status ?? 'pending').replace('picked_up', 'in_progress').replace('in_transit', 'in_progress'),
        date:           d.deliveredAt ?? d.createdAt ?? new Date().toISOString(),
        dropoffAddress: d.dropoffAddress ?? '-',
        price:          Number(d.price ?? 0),
        unpaid:         !d.paymentHeldAt && String(d.status ?? 'pending') === 'pending',
        distance:       d.distanceKm ? `${Number(d.distanceKm).toFixed(1)} km` : '',
      }));
      setTrips(mapped);
    } catch {}
  }, []);

  // Refresh every time the tab gains focus so a freshly-completed
  // delivery shows up without a manual pull-to-refresh.
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const TRIPS = trips;
  const tabTrips = activeTab === 'in_progress'
    ? TRIPS.filter(t => t.status === 'in_progress' || t.status === 'pending' || t.status === 'assigned')
    : activeTab === 'delivered'
    ? TRIPS.filter(t => t.status === 'completed' || t.status === 'delivered')
    : TRIPS.slice(0, 2);

  const activeTrip = TRIPS.find(t => ['in_progress', 'pending', 'assigned'].includes(t.status));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        onScroll={onScrollEvent}
        scrollEventThrottle={16}
      >

        {/* ── Top bar: hamburger + SEIRS lockup (no pill bg) + avatar ────
            Logo replaces the greeting text. Same bold mark + wordmark
            as the drawer header; theme-coloured so it auto-flips
            navy/white between light + dark mode. Yellow package stays
            constant: the brand signal. */}
        <View style={styles.topBar}>
          <Pressable
            style={[styles.menuBtn, { backgroundColor: theme.surface }, Shadows.xs]}
            onPress={() => setDrawerVisible(true)}
          >
            <AlignLeft size={20} color={theme.text} strokeWidth={2} />
          </Pressable>

          <View style={styles.brandSlot}>
            <SeirsMarkBold size={38} color={theme.text} hubColor={theme.background} />
            <Text style={[styles.brandWord, { color: theme.text }]}>SEIRS</Text>
          </View>

          {/* Bell with unread count, same as the driver hub (founder
              2026-08-22): Profile already lives on the tab bar, and a
              customer should SEE they have unread notifications. */}
          <View style={[styles.menuBtn, { backgroundColor: theme.surface }, Shadows.xs]}>
            <NotificationBell size={20} />
          </View>
        </View>

        {/* ── Search bar ──────────────────────────────────────────────────── */}
        <Pressable
          style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
          onPress={() => router.push('/(customer)/send' as any)}
        >
          <MapPin size={18} color={theme.accent} strokeWidth={1.75} />
          <Text style={[styles.searchPlaceholder, { color: theme.textThird }]}>
            {t('home.whereToSend')}
          </Text>
          <Search size={16} color={theme.textThird} strokeWidth={1.75} />
        </Pressable>

        {/* ── Active delivery banner ───────────────────────────────────────── */}
        {activeTrip && (
          <Pressable
            style={[styles.activeBanner, { backgroundColor: isDark ? '#1C2128' : '#EBF5FF', borderColor: theme.accent }]}
            onPress={() => router.push({ pathname: '/(customer)/trip/[id]', params: { id: activeTrip.id } } as any)}
          >
            {/* Green pulses only for real movement. An unpaid booking is
                amber and says so: "in progress" was a lie for it. */}
            <View style={[styles.activeDot, { backgroundColor: activeTrip.unpaid ? '#D97706' : theme.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.activeBannerTitle, { color: theme.text }]}>
                {activeTrip.unpaid
                  ? t('home.deliveryAwaitingPayment', { defaultValue: 'Waiting for payment' })
                  : activeTrip.status === 'pending'
                    ? t('home.deliveryFindingRider', { defaultValue: 'Finding you a rider' })
                    : t('home.deliveryInProgress')}
              </Text>
              <Text style={[styles.activeBannerSub, { color: theme.textSecond }]} numberOfLines={1}>
                To {activeTrip.dropoffAddress}
              </Text>
            </View>
            <ChevronRight size={18} color={theme.accent} strokeWidth={2} />
          </Pressable>
        )}

        {/* ── Hero carousel ─────────────────────────────────────────────────
            5-card swipeable stack, auto-advance with pause-on-touch.
            Card 1 = animated SEIRS okada (brand anchor). Cards 2-5
            cycle through editable content (new outlets, weekly tips,
            upcoming features, promos): content lives in
            constants/heroCards.ts, swap to backend-driven once the
            admin Hero Cards CMS lands. */}
        <View style={styles.cardWrap}>
          <HeroCarousel />
        </View>

        {/* ── Secondary chips row ───────────────────────────────────────────
            Sits directly under the hero so the brand banner is followed by
            lightweight quick-access pills, then by the commitment tiles
            below. Points chip first: leads with reward value, replaces
            the old wallet pill. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          <Pressable
            style={[styles.chip, { backgroundColor: theme.primary + '15', borderColor: theme.primary }]}
            onPress={() => router.push('/(customer)/wallet' as any)}
          >
            <Sparkles size={14} color={theme.primary} strokeWidth={2} />
            <Text style={[styles.chipText, { color: theme.primary }]}>
              {points != null ? t('home.pointsChip', { n: points.toLocaleString() }) : t('home.pointsChipEmpty')}
            </Text>
          </Pressable>

          {/* Stories: real SEIRS news + offers, read in the app
              (founder 2026-08-12). Was a dead "coming soon" alert. */}
          <Pressable
            style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => router.push('/(customer)/stories' as any)}
          >
            <Newspaper size={14} color={theme.textSecond} strokeWidth={1.75} />
            <Text style={[styles.chipText, { color: theme.textSecond }]}>{t('home.stories')}</Text>
          </Pressable>

          {/* Alerts: the actual notification centre (driver assigned,
              package picked up, arriving). Used to open notification
              SETTINGS, which is not what "Alerts" promises. */}
          <Pressable
            style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => router.push('/notifications' as any)}
          >
            <Bell size={14} color={theme.textSecond} strokeWidth={1.75} />
            <Text style={[styles.chipText, { color: theme.textSecond }]}>{t('home.alerts')}</Text>
          </Pressable>

          {/* "Suggestions" removed (founder 2026-08-12): it was a dead
              "coming soon" alert and nobody could say what it would ever
              show. A chip that promises nothing is worse than no chip. */}
        </ScrollView>

        {/* ── Primary actions ──────────────────────────────────────────────
            Two tiles in the content flow. These replaced the floating
            circles (founder 2026-08-12), which hovered over the Recent
            Trips list and covered the delivery amounts. Same two
            actions, nothing obscured. */}
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionTile, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
            onPress={() => router.push('/(customer)/send' as any)}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: theme.primary + '15' }]}>
              <Package size={28} color={theme.primary} strokeWidth={1.75} />
            </View>
            <Text style={[styles.actionTitle, { color: theme.text }]}>{t('home.sendTile')}</Text>
            <Text style={[styles.actionHint, { color: theme.textSecond }]}>{t('home.sendTileHint')}</Text>
          </Pressable>

          <Pressable
            style={[styles.actionTile, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
            onPress={() => router.push('/(customer)/request' as any)}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: theme.accent + '15' }]}>
              <Car size={28} color={theme.accent} strokeWidth={1.75} />
            </View>
            <Text style={[styles.actionTitle, { color: theme.text }]}>{t('home.rideTile')}</Text>
            <Text style={[styles.actionHint, { color: theme.textSecond }]}>{t('home.rideTileHint')}</Text>
          </Pressable>
        </View>

        {/* ── Recent Trips (3 tabs) ────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('home.recentTrips')}</Text>
            <Pressable onPress={() => router.push('/(customer)/history' as any)}>
              <Text style={[styles.seeAll, { color: theme.accent }]}>{t('home.seeAll')}</Text>
            </Pressable>
          </View>

          {/* Tab bar */}
          <View style={[styles.tabBar, { backgroundColor: theme.surfaceSecond }]}>
            {([
              { key: 'in_progress', label: t('home.inProgress') },
              { key: 'delivered',   label: t('home.delivered')  },
              { key: 'featured',    label: t('home.features')   },
            ] as { key: TripTab; label: string }[]).map(tab => (
              <Pressable
                key={tab.key}
                style={[
                  styles.tabItem,
                  activeTab === tab.key && { backgroundColor: theme.surface, ...Shadows.xs },
                ]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[
                  styles.tabLabel,
                  { color: activeTab === tab.key ? theme.text : theme.textSecond },
                  activeTab === tab.key && { fontWeight: FontWeight.semibold },
                ]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Trip list */}
          {tabTrips.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Illustration
                name={activeTab === 'in_progress' ? 'empty-no-active' : 'empty-no-deliveries'}
                size={120}
              />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {activeTab === 'in_progress' ? 'No active deliveries' : 'No deliveries yet'}
              </Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
                {activeTab === 'in_progress' ? 'Book a delivery to get started' : 'Your delivery history appears here'}
              </Text>
              <Pressable
                style={[styles.emptyBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/(customer)/send' as any)}
              >
                <Text style={styles.emptyBtnText}>{t('home.sendPackage')}</Text>
              </Pressable>
            </View>
          ) : (
            tabTrips.map(t => (
              <Pressable
                key={t.id}
                style={[styles.tripRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
                onPress={() => router.push({ pathname: '/(customer)/trip/[id]', params: { id: t.id } } as any)}
              >
                <View style={[styles.tripIconWrap, { backgroundColor: theme.surfaceSecond }]}>
                  <Truck size={20} color={theme.accent} strokeWidth={1.75} />
                </View>
                <View style={styles.tripInfo}>
                  <Text style={[styles.tripDest, { color: theme.text }]} numberOfLines={1}>
                    {t.dropoffAddress}
                  </Text>
                  <Text style={[styles.tripMeta, { color: theme.textSecond }]}>
                    {new Date(t.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                    {(t as any).distance ? ` · ${(t as any).distance}` : ''}
                  </Text>
                </View>
                <View style={styles.tripRight}>
                  <Text style={[styles.tripPrice, { color: theme.text }]}>
                    ₦{t.price.toLocaleString()}
                  </Text>
                  <Badge label={t.status.replace('_', ' ')} variant={statusVariant(t.status)} isDark={isDark} />
                </View>
              </Pressable>
            ))
          )}
        </View>

      </ScrollView>

      {/* Floating Send / Ride circles removed (founder 2026-08-12):
          they hovered over the Recent Trips list and covered the
          delivery amounts on the rows behind them. The two tiles in the
          content flow above carry the same actions without obscuring
          anything. */}

      {/* ── Hamburger Drawer ────────────────────────────────────────────── */}
      <Drawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
  },
  menuBtn:  { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  greeting: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, flex: 1, textAlign: 'center', marginHorizontal: Spacing.sm },

  // Bare brand lockup in the top bar centre: same look as the drawer
  // header (no pill background). flex:1 so it fills the gap between
  // hamburger and avatar; flexDirection row so mark + wordmark sit
  // side-by-side, centred horizontally.
  brandSlot: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
  },
  brandWord: {
    fontSize: 18, fontWeight: '900', letterSpacing: 2.5,
  },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5,
  },
  searchPlaceholder: { flex: 1, fontSize: FontSize.base },

  activeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5,
  },
  activeDot:        { width: 10, height: 10, borderRadius: 5 },
  activeBannerTitle:{ fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  activeBannerSub:  { fontSize: FontSize.xs },

  // Hero wrapper: full-bleed so the carousel can render each page at
  // SCREEN_WIDTH (it handles its own internal 16 px gutter so cards
  // stay flush with the Rewards / chips / tiles below). Don't add
  // marginHorizontal here: it'd clip the right edge of every card.
  cardWrap: { marginBottom: Spacing.md },

  // Primary action tiles: Send + Ride.
  actionRow:        { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  actionTile:       { flex: 1, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 6, minHeight: 130 },
  actionIconWrap:   { width: 52, height: 52, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  actionTitle:      { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  actionHint:       { fontSize: FontSize.xs },

  // Secondary chip row.
  chipsRow:  { paddingHorizontal: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.sm, marginBottom: Spacing.md },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1 },
  chipText:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  section:       { paddingHorizontal: Spacing.md, marginBottom: Spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  seeAll:        { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  tabBar:   { flexDirection: 'row', borderRadius: Radius.lg, padding: 4, marginBottom: Spacing.md },
  tabItem:  { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.md },
  tabLabel: { fontSize: FontSize.xs },

  tripRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  tripIconWrap: { width: 44, height: 44, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  tripInfo:     { flex: 1, gap: 3 },
  tripDest:     { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  tripMeta:     { fontSize: FontSize.xs },
  tripRight:    { alignItems: 'flex-end', gap: 4 },
  tripPrice:    { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  emptyCard:  { padding: Spacing.xl, borderRadius: Radius.xl, alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, marginTop: Spacing.xs },
  emptyDesc:  { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  emptyBtn:   { marginTop: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: 12, borderRadius: Radius.full },
  emptyBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  // Floating Action Buttons (Send + Ride): bottom-right corner.
  fabPair: {
    position: 'absolute', right: 16, gap: 12,
  },
  fabRow: {
    height: 56, borderRadius: 28, overflow: 'hidden',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  fabPressable: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 17, gap: 10,
  },
  fabLabel: {
    color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },

  // Drawer
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row' },
  drawer: {
    width: W * 0.78, height: '100%',
    paddingTop: 60, paddingBottom: Spacing.xl,
  },
  drawerProfile: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg,
    borderBottomWidth: 1, marginBottom: Spacing.sm,
  },
  drawerName:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  drawerEmail: { fontSize: FontSize.xs, marginTop: 2 },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerItemText: { fontSize: FontSize.base },
  drawerSignOut: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, marginTop: Spacing.sm },
  drawerSignOutText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
