import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
  TextInput, Dimensions, Alert, RefreshControl, Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Colors, Spacing, Radius, FontSize, FontWeight, Shadows,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/Drawer';
import { deliveriesApi, paymentsApi } from '@/services/api';
import {
  AlignLeft, MapPin, Package, Car, Clock, Search,
  Wallet, Bell, TrendingUp, ChevronRight, Plus,
  Newspaper, Truck, Calendar, X,
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
  const [chooserOpen,   setChooserOpen]   = useState(false);
  const [balance,       setBalance]       = useState(0);
  const [trips,         setTrips]         = useState<Array<{
    id: string; status: string; date: string; dropoffAddress: string; price: number; distance: string;
  }>>([]);
  const [refreshing,    setRefreshing]    = useState(false);

  const reload = useCallback(async () => {
    try {
      const [wallet, deliveries] = await Promise.all([
        paymentsApi.wallet().catch(() => null),
        deliveriesApi.myDeliveries(1, 20).catch(() => ({ items: [] })),
      ]);
      if (wallet) setBalance(Number(wallet.balanceNaira ?? 0));
      const mapped = (deliveries.items ?? []).map((d: any) => ({
        id:             d.id,
        status:         String(d.status ?? 'pending').replace('picked_up', 'in_progress').replace('in_transit', 'in_progress'),
        date:           d.deliveredAt ?? d.createdAt ?? new Date().toISOString(),
        dropoffAddress: d.dropoffAddress ?? '—',
        price:          Number(d.price ?? 0),
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
        contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <Pressable
            style={[styles.menuBtn, { backgroundColor: theme.surface }, Shadows.xs]}
            onPress={() => setDrawerVisible(true)}
          >
            <AlignLeft size={20} color={theme.text} strokeWidth={2} />
          </Pressable>

          <Text style={[styles.greeting, { color: theme.text }]}>
            {t(getGreetingKey())}, {firstName}
          </Text>

          <Pressable onPress={() => router.push('/(customer)/profile' as any)}>
            <Avatar name={user?.name ?? firstName} uri={user?.profilePhoto} size={40} />
          </Pressable>
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
            <View style={[styles.activeDot, { backgroundColor: theme.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.activeBannerTitle, { color: theme.text }]}>{t('home.deliveryInProgress')}</Text>
              <Text style={[styles.activeBannerSub, { color: theme.textSecond }]} numberOfLines={1}>
                To {activeTrip.dropoffAddress}
              </Text>
            </View>
            <ChevronRight size={18} color={theme.accent} strokeWidth={2} />
          </Pressable>
        )}

        {/* ── Widgets row ─────────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.widgetsRow}
        >
          {/* Customer Stories — always visible */}
          <Pressable
            style={[styles.widget, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
            onPress={() => Alert.alert(t('common.comingSoon'), t('profile.termsComingSoon'))}
          >
            <Newspaper size={20} color={theme.accent} strokeWidth={1.75} />
            <Text style={[styles.widgetLabel, { color: theme.textSecond }]}>{t('home.stories')}</Text>
          </Pressable>

          {/* Wallet Balance */}
          <Pressable
            style={[styles.widget, styles.widgetWide, { backgroundColor: theme.primary }]}
            onPress={() => router.push('/(customer)/wallet' as any)}
          >
            <View style={styles.widgetRow}>
              <Wallet size={16} color="rgba(255,255,255,0.8)" strokeWidth={1.75} />
              <Text style={styles.widgetLabelWhite}>{t('home.wallet')}</Text>
            </View>
            <Text style={styles.widgetAmount}>
              ₦{balance.toLocaleString('en-NG', { minimumFractionDigits: 0 })}
            </Text>
          </Pressable>

          {/* Notifications */}
          <Pressable
            style={[styles.widget, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
            onPress={() => router.push('/notifications' as any)}
          >
            <Bell size={20} color={theme.accent} strokeWidth={1.75} />
            <Text style={[styles.widgetLabel, { color: theme.textSecond }]}>{t('home.alerts')}</Text>
          </Pressable>

          {/* Suggestions */}
          <Pressable
            style={[styles.widget, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
            onPress={() => Alert.alert(t('common.comingSoon'), t('profile.termsComingSoon'))}
          >
            <TrendingUp size={20} color={theme.accent} strokeWidth={1.75} />
            <Text style={[styles.widgetLabel, { color: theme.textSecond }]}>{t('home.suggestions')}</Text>
          </Pressable>
        </ScrollView>

        {/* ── Wallet card ─────────────────────────────────────────────────── */}
        <View style={styles.cardWrap}>
          <LinearGradient
            colors={isDark ? ['#1C2128', '#0D1117'] : ['#0F2B4C', '#1A3A63']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.walletCard, Shadows.navy]}
          >
            <View style={styles.walletTop}>
              <Text style={styles.walletLabel}>{t('home.walletBalance')}</Text>
              <Pressable
                style={styles.walletTopUpBtn}
                onPress={() => router.push('/(customer)/wallet' as any)}
              >
                <Plus size={16} color="#fff" strokeWidth={2.5} />
              </Pressable>
            </View>
            <Text style={styles.walletAmount}>
              ₦{balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.walletSub}>{t('home.availableBalance')}</Text>
            <View style={styles.walletActions}>
              {([
                { key: 'topUp',   label: t('home.topUp') },
                { key: 'send',    label: t('home.send') },
                { key: 'history', label: t('home.history') },
              ]).map(({ key, label }) => (
                <Pressable
                  key={key}
                  style={styles.walletActionBtn}
                  onPress={() => router.push('/(customer)/wallet' as any)}
                >
                  <Text style={styles.walletActionText}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>
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
              <Package size={40} color={theme.textThird} strokeWidth={1.5} />
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

      {/* ── Primary CTA (fixed bottom) ─────────────────────────────────────
          Single-button design — opens a chooser sheet with Send Package /
          Request Ride / Schedule. Pinned to the bottom with dynamic
          paddingBottom so it never clips into the gesture bar.

          Replaces the prior dual-button row which was cramped, redundant
          with the top search bar, and harder to extend with a 3rd option
          (Schedule). */}
      <View style={[styles.ctaWrap, {
        backgroundColor: theme.surface,
        paddingBottom: 16 + insets.bottom,
      }, Shadows.lg]}>
        <Pressable
          onPress={() => setChooserOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('home.bookTrip')}
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: pressed ? theme.primary : theme.primary },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Plus size={20} color="#fff" strokeWidth={2.5} />
          <Text style={styles.ctaBtnText}>{t('home.bookTrip')}</Text>
        </Pressable>
      </View>

      {/* ── Book a Trip chooser sheet ──────────────────────────────────── */}
      <Modal
        visible={chooserOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setChooserOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setChooserOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>{t('home.bookTrip')}</Text>
            <Pressable onPress={() => setChooserOpen(false)} hitSlop={12}>
              <X size={20} color={theme.textSecond} />
            </Pressable>
          </View>

          {[
            { Icon: Package,  key: 'sendPackage',  color: theme.primary, route: '/(customer)/send' },
            { Icon: Car,      key: 'requestRide',  color: theme.accent,  route: '/(customer)/request' },
            { Icon: Calendar, key: 'scheduleTrip', color: '#16A34A',     route: '/(customer)/schedule' },
          ].map(opt => (
            <Pressable
              key={opt.key}
              style={({ pressed }) => [
                styles.sheetOption,
                { borderColor: theme.border, backgroundColor: pressed ? theme.surfaceSecond : theme.surface },
              ]}
              onPress={() => { setChooserOpen(false); router.push(opt.route as any); }}
            >
              <View style={[styles.sheetIconWrap, { backgroundColor: opt.color + '20' }]}>
                <opt.Icon size={22} color={opt.color} strokeWidth={2} />
              </View>
              <Text style={[styles.sheetOptionLabel, { color: theme.text }]}>
                {t(`home.${opt.key}`)}
              </Text>
              <ChevronRight size={18} color={theme.textThird} strokeWidth={2} />
            </Pressable>
          ))}
        </View>
      </Modal>

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

  widgetsRow: { paddingHorizontal: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.sm, marginBottom: Spacing.md },
  widget: {
    width: 72, height: 72, borderRadius: Radius.lg, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  widgetWide: { width: 120, height: 72 },
  widgetRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  widgetLabel:      { fontSize: 10, fontWeight: FontWeight.semibold },
  widgetLabelWhite: { fontSize: 10, fontWeight: FontWeight.semibold, color: 'rgba(255,255,255,0.8)' },
  widgetAmount:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#FFFFFF', marginTop: 2 },

  cardWrap:       { marginHorizontal: Spacing.md, marginBottom: Spacing.lg },
  walletCard:     { borderRadius: Radius.xl, padding: Spacing.lg },
  walletTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  walletLabel:    { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  walletTopUpBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  walletAmount:   { color: '#fff', fontSize: FontSize['3xl'], fontWeight: FontWeight.bold, letterSpacing: -0.5, marginBottom: 4 },
  walletSub:      { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs, marginBottom: Spacing.md },
  walletActions:  { flexDirection: 'row', gap: Spacing.sm },
  walletActionBtn:{ flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center' },
  walletActionText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

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

  // Bottom CTA + chooser sheet
  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
  },
  ctaBtn: {
    height: 52, borderRadius: Radius.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm,
  },
  ctaBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.bold, letterSpacing: 0.3 },

  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
  },
  sheetHandle: {
    width: 44, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginBottom: Spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm, marginBottom: Spacing.sm,
  },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  sheetOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, marginBottom: Spacing.sm,
  },
  sheetIconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sheetOptionLabel: { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.semibold },

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
