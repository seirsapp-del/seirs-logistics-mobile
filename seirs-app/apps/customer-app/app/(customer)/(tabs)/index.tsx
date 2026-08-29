import { useCallback, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Colors, Spacing, Radius, FontSize, FontWeight, Shadows,
} from '@/constants/theme';
import { NotificationBell } from '@/components/NotificationBell';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/Drawer';
import { Illustration } from '@/components/Illustration';
import { HeroCarousel } from '@/components/HeroCarousel';
import { SeirsMarkBold } from '@/components/SeirsLogoV2';
import { deliveriesApi, loyaltyApi } from '@/services/api';
import { naira } from '@/utils/money';
import {
  AlignLeft, MapPin, Package, Car, Search,
  Bell, ChevronRight, Sparkles,
  Newspaper, Truck,
  // Aliased: a bare `Map` import shadows the built-in Map constructor
  // for the whole module, which is a trap waiting for the next person
  // who reaches for one.
  Map as MapIcon,
} from 'lucide-react-native';

type TripTab = 'in_progress' | 'delivered' | 'cancelled';

// DeliveryStatus has no 'completed' member: the terminal value is
// 'delivered'. Checking only 'completed' meant every finished delivery
// rendered the grey default badge instead of green (sweep C-8.1).
function statusVariant(s: string): any {
  if (s === 'delivered' || s === 'completed') return 'success';
  if (s === 'in_progress') return 'info';
  if (s === 'cancelled')   return 'error';
  return 'default';
}

export default function CustomerHomeScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }    = useTranslation();


  const insets = useSafeAreaInsets();
  const [activeTab,     setActiveTab]     = useState<TripTab>('in_progress');
  const [drawerVisible, setDrawerVisible] = useState(false);
  // Points (loyalty) replaces NGN balance on the home: customers don't
  // hold NGN per CBN rules. Rewards/Points are the value-on-account proxy.
  const [points,        setPoints]        = useState<number | null>(null);

  // The show/hide-on-scroll animation that used to live here drove two
  // floating action buttons (Send + Ride) that were removed from this
  // screen. Nothing rendered fabTranslate, so onScroll fired at 16ms
  // intervals to animate a value no view consumed. Deleted 2026-08-24.
  const [trips,         setTrips]         = useState<Array<{
    id: string; status: string; date: string; dropoffAddress: string; price: number; distance: string; kind?: string; unpaid?: boolean;
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
        kind:           String(d.kind ?? 'package'),
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
    : TRIPS.filter(t => t.status === 'cancelled');

  const activeTrip = TRIPS.find(t => ['in_progress', 'pending', 'assigned'].includes(t.status));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
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
            <SeirsMarkBold size={46} color={theme.text} hubColor={theme.background} />
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
            <View style={[styles.activeDot, { backgroundColor: activeTrip.unpaid ? '#FFBE0B' : theme.success }]} />
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
            onPress={() => router.push('/(customer)/(tabs)/wallet')}
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
            Tiles in the content flow. These replaced the floating
            circles (founder 2026-08-12), which hovered over the Recent
            Trips list and covered the delivery amounts.

            Travel Buddy joins them on its own row directly below
            (founder 2026-08-29). It is the thing SEIRS does that nobody
            else does, and its only entry point in the entire app was
            one line inside the hamburger: a user could hold the app for
            a month and never learn it existed. The drawer entry stays,
            so this is an addition, not a move. */}
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

        {/* Travel Buddy, its own full-width row under the pair.

            Green rather than another blue: a third tile in the same blue
            family reads as one control split in three.

            It sits beside Send and Ride rather than inside the row
            because it is a search, from a city to a city, not a one-tap
            booking, and because three across on a 360dp phone leaves
            66dp of content per tile, enough to wrap "Send a package"
            onto three lines. Full width costs the other two nothing. */}
        <Pressable
          style={[styles.travelTile, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
          onPress={() => router.push('/(customer)/travel-buddy' as any)}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: theme.success + '15', marginBottom: 0 }]}>
            <MapIcon size={28} color={theme.success} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.travelTitle, { color: theme.text }]}>{t('home.travelTile')}</Text>
            <Text style={[styles.travelHint, { color: theme.textSecond }]}>{t('home.travelTileHint')}</Text>
          </View>
          <ChevronRight size={18} color={theme.textThird} strokeWidth={2} />
        </Pressable>

        {/* ── Recent Trips (3 tabs) ────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('home.recentTrips')}</Text>
            <Pressable onPress={() => router.push('/(customer)/(tabs)/history')}>
              <Text style={[styles.seeAll, { color: theme.accent }]}>{t('home.seeAll')}</Text>
            </Pressable>
          </View>

          {/* Tab bar */}
          <View style={[styles.tabBar, { backgroundColor: theme.surfaceSecond }]}>
            {([
              { key: 'in_progress', label: t('home.inProgress') },
              { key: 'delivered',   label: t('home.delivered')  },
              { key: 'cancelled',   label: t('status.cancelled') },
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
                {activeTab === 'in_progress' ? t('home.emptyActiveTitle')
                  : activeTab === 'cancelled' ? t('home.emptyCancelledTitle')
                  : t('home.emptyHistoryTitle')}
              </Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
                {activeTab === 'in_progress' ? t('home.emptyActiveDesc')
                  : activeTab === 'cancelled' ? t('home.emptyCancelledDesc')
                  : t('home.emptyHistoryDesc')}
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
                  {(t as any).kind === 'ride'
                    ? <Car   size={20} color={theme.accent} strokeWidth={1.75} />
                    : <Truck size={20} color={theme.accent} strokeWidth={1.75} />}
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
                    {naira(t.price)}
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
    fontSize: 15, fontWeight: '900', letterSpacing: 2.2,
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
  actionRow:        { flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  actionTile:       { flex: 1, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 6, minHeight: 130 },
  actionIconWrap:   { width: 52, height: 52, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  actionTitle:      { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  actionHint:       { fontSize: FontSize.xs },

  // Travel Buddy sits on its own full-width row under the pair. Same
  // tile language, laid out sideways because it has the room: icon,
  // then the words, then a chevron that says this opens a search.
  travelTile:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
                      marginHorizontal: Spacing.md, marginBottom: Spacing.md,
                      borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md },
  travelTitle:      { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  travelHint:       { fontSize: FontSize.xs, marginTop: 2 },

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

  // The FAB styles (fabPair/fabRow/fabPressable/fabLabel) and the inline
  // drawer styles were deleted on 2026-08-24: the FABs were removed from
  // this screen and the drawer moved into components/Drawer.tsx, but both
  // style blocks and the scroll animation driving them were left behind.
});
