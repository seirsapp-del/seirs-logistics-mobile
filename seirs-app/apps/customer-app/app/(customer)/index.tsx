import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Colors, Spacing, Radius, FontSize, FontWeight, Shadows, ActionColors,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { NotificationBell } from '@/components/NotificationBell';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { MOCK_TRIPS, MOCK_USER } from '@/constants/mockData';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_ACTIONS = [
  { id: 'request', icon: 'car',          label: 'Request',  route: '/(customer)/request'  },
  { id: 'send',    icon: 'paper-plane',  label: 'Send',     route: '/(customer)/send'     },
  { id: 'track',   icon: 'location',     label: 'Track',    route: '/(customer)/track'    },
  { id: 'history', icon: 'time',         label: 'History',  route: '/(customer)/history'  },
] as const;

const FEATURES = [
  { icon: 'flash',            label: 'Fast & Reliable' },
  { icon: 'shield-checkmark', label: 'Safe & Secure'   },
  { icon: 'pricetag',         label: 'Best Prices'     },
  { icon: 'star',             label: 'Rated 4.9 ⭐'    },
] as const;

function statusVariant(s: string): any {
  return s === 'completed' ? 'success' : s === 'in_progress' ? 'info' : s === 'cancelled' ? 'error' : 'default';
}

export default function CustomerHomeScreen() {
  const router      = useRouter();
  const cs          = useColorScheme();
  const theme       = Colors[cs ?? 'light'];
  const isDark      = cs === 'dark';
  const { user }    = useAuth();

  const firstName  = user?.name?.split(' ')[0] ?? MOCK_USER.name.split(' ')[0];
  const balance    = MOCK_USER.walletBalance;
  const recents    = MOCK_TRIPS.slice(0, 3);
  const activeTrip = MOCK_TRIPS.find(t => t.status === 'in_progress');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xl }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={[styles.header, { backgroundColor: theme.background }]}>
          <View>
            <Text style={[styles.greeting, { color: theme.textSecond }]}>{getGreeting()},</Text>
            <Text style={[styles.name, { color: theme.text }]}>{firstName} 👋</Text>
          </View>
          <View style={styles.headerRight}>
            <NotificationBell />
            <Pressable onPress={() => router.push('/(customer)/profile')}>
              <Avatar name={user?.name ?? MOCK_USER.name} size={40} />
            </Pressable>
          </View>
        </View>

        {/* ── Active Trip Banner ───────────────────────────────────────────── */}
        {activeTrip && (
          <Pressable
            style={[styles.activeBanner, { backgroundColor: isDark ? '#1A0C00' : '#EFF6FF', borderColor: theme.primary }]}
            onPress={() => router.push({ pathname: '/(customer)/trip-progress', params: { id: activeTrip.id } })}
          >
            <View style={[styles.activeDot, { backgroundColor: '#22C55E' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.activeBannerTitle, { color: theme.text }]}>Trip in progress</Text>
              <Text style={[styles.activeBannerSub, { color: theme.textSecond }]} numberOfLines={1}>
                To {activeTrip.dropoffAddress}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.primary} />
          </Pressable>
        )}

        {/* ── Wallet Balance Card ──────────────────────────────────────────── */}
        <View style={styles.cardWrap}>
          <LinearGradient
            colors={isDark ? ['#FF6B00', '#000000'] : ['#3A86FF', '#1D6AE5']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.walletCard, isDark ? Shadows.orange : Shadows.blue]}
          >
            <View style={styles.walletTop}>
              <Text style={styles.walletLabel}>Wallet Balance</Text>
              <Pressable style={styles.walletTopUpBtn} onPress={() => router.push('/(customer)/wallet')}>
                <Ionicons name="add" size={18} color="#fff" />
              </Pressable>
            </View>
            <Text style={styles.walletAmount}>
              ₦{balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </Text>
            <Text style={styles.walletSub}>+4.2% this week</Text>
            <View style={styles.walletActions}>
              {(['Top Up', 'Send', 'History'] as const).map((lbl) => (
                <Pressable key={lbl} style={styles.walletActionBtn} onPress={() => router.push('/(customer)/wallet')}>
                  <Text style={styles.walletActionText}>{lbl}</Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* ── Quick Actions ────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.actionsRow}>
            {QUICK_ACTIONS.map((a) => {
              const ac  = ActionColors[a.id];
              const bg  = isDark ? ac.dark.bg  : ac.bg;
              const col = isDark ? ac.dark.icon : ac.icon;
              return (
                <Pressable
                  key={a.id}
                  style={styles.actionItem}
                  onPress={() => router.push(a.route as any)}
                >
                  <View style={[styles.actionIcon, { backgroundColor: bg }]}>
                    <Ionicons name={a.icon as any} size={24} color={col} />
                  </View>
                  <Text style={[styles.actionLabel, { color: theme.textSecond }]}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Recent Activity ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Trips</Text>
            <Pressable onPress={() => router.push('/(customer)/history')}>
              <Text style={[styles.seeAll, { color: theme.primary }]}>See all</Text>
            </Pressable>
          </View>

          {recents.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Ionicons name="car-outline" size={44} color={theme.textThird} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No trips yet</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
                Your trip history will appear here
              </Text>
              <Pressable
                style={[styles.emptyBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/(customer)/request')}
              >
                <Text style={styles.emptyBtnText}>Request a ride</Text>
              </Pressable>
            </View>
          ) : (
            recents.map((t) => (
              <Pressable
                key={t.id}
                style={[styles.tripRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
                onPress={() => router.push({ pathname: '/(customer)/trip/[id]', params: { id: t.id } })}
              >
                <View style={[styles.tripIconWrap, { backgroundColor: isDark ? '#111' : '#F1F5F9' }]}>
                  <Ionicons name="car-outline" size={20} color={theme.primary} />
                </View>
                <View style={styles.tripInfo}>
                  <Text style={[styles.tripDest, { color: theme.text }]} numberOfLines={1}>
                    {t.dropoffAddress}
                  </Text>
                  <Text style={[styles.tripMeta, { color: theme.textSecond }]}>
                    {new Date(t.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                    {t.distance ? ` · ${t.distance}` : ''}
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

        {/* ── Book CTA ─────────────────────────────────────────────────────── */}
        <View style={styles.ctaWrap}>
          <Pressable
            style={[styles.ctaBtn, { backgroundColor: theme.primary }, isDark ? Shadows.orange : Shadows.blue]}
            onPress={() => router.push('/(customer)/request')}
          >
            <Ionicons name="car" size={20} color="#fff" />
            <Text style={styles.ctaBtnText}>Request a Ride</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* ── Feature Chips ────────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {FEATURES.map((f) => (
            <View key={f.label} style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name={f.icon as any} size={14} color={theme.primary} />
              <Text style={[styles.chipText, { color: theme.textSecond }]}>{f.label}</Text>
            </View>
          ))}
        </ScrollView>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
  },
  greeting: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  name:     { fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

  activeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5,
  },
  activeDot: { width: 10, height: 10, borderRadius: 5 },
  activeBannerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  activeBannerSub:   { fontSize: FontSize.xs },

  cardWrap:       { marginHorizontal: Spacing.md, marginBottom: Spacing.lg },
  walletCard:     { borderRadius: Radius.xl, padding: Spacing.lg },
  walletTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  walletLabel:    { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  walletTopUpBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  walletAmount:   { color: '#fff', fontSize: FontSize['3xl'], fontWeight: FontWeight.bold, letterSpacing: -0.5, marginBottom: 4 },
  walletSub:      { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.xs, fontWeight: FontWeight.medium, marginBottom: Spacing.md },
  walletActions:  { flexDirection: 'row', gap: Spacing.sm },
  walletActionBtn:{ flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center' },
  walletActionText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  section:       { paddingHorizontal: Spacing.md, marginBottom: Spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  seeAll:        { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  actionsRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  actionItem:    { alignItems: 'center', gap: Spacing.xs, flex: 1 },
  actionIcon:    { width: 56, height: 56, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  actionLabel:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

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
  emptyBtnText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  ctaWrap:    { marginHorizontal: Spacing.md, marginBottom: Spacing.lg },
  ctaBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 56, borderRadius: Radius.xl },
  ctaBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: FontWeight.semibold, flex: 1, textAlign: 'center' },

  chipsRow:  { paddingHorizontal: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.sm },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1 },
  chipText:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
});
