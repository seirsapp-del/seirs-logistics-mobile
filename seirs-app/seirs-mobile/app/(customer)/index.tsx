import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  Colors, Spacing, Radius, FontSize, FontWeight, Shadows, ActionColors, CLOUD_DANCER,
} from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { NotificationBell } from '@/components/NotificationBell';
import { paymentsApi, deliveriesApi } from '@/services/api';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_ACTIONS = [
  { id: 'request', icon: 'cube-outline',    label: 'Request',  route: '/(customer)/send'     },
  { id: 'send',    icon: 'paper-plane',     label: 'Send',     route: '/(customer)/send'     },
  { id: 'track',   icon: 'location',        label: 'Track',    route: '/(customer)/track'    },
  { id: 'history', icon: 'time',            label: 'History',  route: '/(customer)/history'  },
] as const;

const FEATURES = [
  { icon: 'flash',           label: 'Fast & Reliable' },
  { icon: 'shield-checkmark', label: 'Safe & Secure' },
  { icon: 'pricetag',        label: 'Transparent Pricing' },
  { icon: 'people',          label: 'Pro Drivers' },
] as const;

export default function CustomerHomeScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';
  const { user }    = useAuth();

  const [balance,   setBalance]   = useState<number>(0);
  const [recents,   setRecents]   = useState<any[]>([]);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  useEffect(() => {
    paymentsApi.wallet()
      .then((b: any) => setBalance(b?.balanceNaira ?? 0))
      .catch(() => {});
    deliveriesApi.myDeliveries(1, 3)
      .then((d: any) => setRecents(d?.items ?? []))
      .catch(() => {});
  }, []);

  const walletGradient = isDark
    ? ([theme.walletCard, theme.walletCardEnd] as const)
    : ([theme.walletCard, theme.walletCardEnd] as const);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xl }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={[styles.header, { backgroundColor: theme.background }]}>
          <View>
            <Text style={[styles.greeting, { color: theme.textSecond }]}>{getGreeting()},</Text>
            <Text style={[styles.name, { color: theme.text }]}>{firstName} 👋</Text>
          </View>
          <View style={styles.headerRight}>
            <NotificationBell />
            <Pressable style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>{firstName[0].toUpperCase()}</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Wallet Balance Card ─────────────────────────────────────────── */}
        <View style={styles.cardWrap}>
          <LinearGradient
            colors={walletGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.walletCard, isDark ? Shadows.orange : Shadows.lg]}
          >
            {/* Top row */}
            <View style={styles.walletTop}>
              <Text style={styles.walletLabel}>Wallet Balance</Text>
              <Pressable
                style={styles.walletTopUp}
                onPress={() => router.push('/(customer)/wallet')}
              >
                <Ionicons name="add" size={18} color={isDark ? '#fff' : CLOUD_DANCER} />
              </Pressable>
            </View>

            {/* Amount */}
            <Text style={styles.walletAmount}>
              ₦{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.walletSub}>+12.5% this week</Text>

            {/* Wallet actions */}
            <View style={styles.walletActions}>
              {(['Top Up', 'Send', 'History'] as const).map((label) => (
                <Pressable
                  key={label}
                  style={styles.walletActionBtn}
                  onPress={() => router.push('/(customer)/wallet')}
                >
                  <Text style={styles.walletActionText}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* ── Quick Actions ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.actionsRow}>
            {QUICK_ACTIONS.map((a) => {
              const ac = ActionColors[a.id];
              const bg  = isDark ? ac.dark.bg   : ac.bg;
              const col = isDark ? ac.dark.icon  : ac.icon;
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

        {/* ── Recent Activity ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Activity</Text>
            <Pressable onPress={() => router.push('/(customer)/history')}>
              <Text style={[styles.seeAll, { color: theme.primary }]}>View All</Text>
            </Pressable>
          </View>

          {recents.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface }, Shadows.sm]}>
              <Ionicons name="cube-outline" size={40} color={theme.textThird} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No deliveries yet</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
                Book your first delivery and it will appear here
              </Text>
              <Pressable
                style={[styles.emptyBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/(customer)/send')}
              >
                <Text style={styles.emptyBtnText}>Book Delivery</Text>
              </Pressable>
            </View>
          ) : (
            recents.map((d) => (
              <View
                key={d.id}
                style={[styles.activityRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                <View style={[styles.activityDot, { backgroundColor: statusColor(d.status) }]} />
                <View style={styles.activityInfo}>
                  <Text style={[styles.activityTitle, { color: theme.text }]} numberOfLines={1}>
                    {d.dropoffAddress}
                  </Text>
                  <Text style={[styles.activitySub, { color: theme.textSecond }]}>
                    {d.trackingCode} · {d.status}
                  </Text>
                </View>
                <Text style={[styles.activityAmount, { color: theme.text }]}>
                  ₦{Number(d.price).toLocaleString()}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* ── Book CTA ───────────────────────────────────────────────────── */}
        <View style={[styles.ctaSection, { marginHorizontal: Spacing.md }]}>
          <Pressable
            style={[styles.ctaBtn, { backgroundColor: theme.primary }, Shadows.orange]}
            onPress={() => router.push('/(customer)/send')}
          >
            <Ionicons name="cube" size={20} color="#fff" />
            <Text style={styles.ctaBtnText}>Book a Delivery</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* ── Feature Highlights ─────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.featuresRow}
        >
          {FEATURES.map((f) => (
            <View
              key={f.label}
              style={[styles.featureChip, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Ionicons name={f.icon as any} size={16} color={theme.primary} />
              <Text style={[styles.featureText, { color: theme.textSecond }]}>{f.label}</Text>
            </View>
          ))}
        </ScrollView>

      </ScrollView>
    </SafeAreaView>
  );
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    delivered: '#22C55E',
    assigned:  '#00C2FF',
    picked_up: '#F4600C',
    failed:    '#EF4444',
    cancelled: '#71717A',
  };
  return map[status] ?? '#A1A1AA';
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  greeting: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  name: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },

  // Wallet card
  cardWrap: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  walletCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  walletTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  walletLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  walletTopUp: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletAmount: {
    color: '#fff',
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.bold,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  walletSub: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.md,
  },
  walletActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  walletActionBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  walletActionText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },

  // Quick actions
  section: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  seeAll: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionItem: {
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  actionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },

  // Recent activity
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  activityInfo: {
    flex: 1,
    gap: 3,
  },
  activityTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  activitySub: {
    fontSize: FontSize.xs,
  },
  activityAmount: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },

  // Empty state
  emptyCard: {
    padding: Spacing.xl,
    borderRadius: Radius.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    marginTop: Spacing.xs,
  },
  emptyDesc: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 240,
  },
  emptyBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },

  // CTA
  ctaSection: {
    marginBottom: Spacing.lg,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 56,
    borderRadius: Radius.xl,
  },
  ctaBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    flex: 1,
    textAlign: 'center',
  },

  // Feature chips
  featuresRow: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  featureText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
});
