import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { NotificationBell } from '@/components/NotificationBell';

const QUICK_ACTIONS: { id: string; icon: string; label: string; desc: string; route: string }[] = [
  { id: 'send',     icon: '📤', label: 'Send Package',  desc: 'Book a delivery', route: '/(customer)/send' },
  { id: 'track',    icon: '📍', label: 'Track Package', desc: 'Live tracking',   route: '/(customer)/track' },
  { id: 'schedule', icon: '🗓️', label: 'Schedule',      desc: 'Book in advance', route: '/(customer)/schedule' },
  { id: 'business', icon: '🏢', label: 'Business',      desc: 'Bulk deliveries', route: '/(customer)/business' },
];

const DELIVERY_OPTIONS = [
  {
    id: 'instant',
    icon: '⚡',
    label: 'Instant',
    desc: 'Delivered within hours',
    color: '#F4600C',
    eta: '1-3 hrs',
  },
  {
    id: 'standard',
    icon: '🚀',
    label: 'Standard',
    desc: 'Next day delivery',
    color: '#3B82F6',
    eta: '24 hrs',
  },
  {
    id: 'economy',
    icon: '💚',
    label: 'Economy',
    desc: 'Affordable option',
    color: '#22C55E',
    eta: '2-3 days',
  },
];

export default function CustomerHomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { user, logout } = useAuth();

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.primary }]}>
          <View>
            <Text style={styles.greeting}>Good day, {firstName} 👋</Text>
            <Text style={styles.headerSub}>Where are you sending to today?</Text>
          </View>
          <View style={styles.headerRight}>
            <NotificationBell />
            <Pressable onPress={logout} style={styles.avatarBtn}>
              <Text style={styles.avatarText}>{firstName[0].toUpperCase()}</Text>
            </Pressable>
          </View>
        </View>

        {/* Main CTA */}
        <View style={[styles.ctaCard, { backgroundColor: theme.surface }, Shadows.md]}>
          <Text style={[styles.ctaTitle, { color: theme.text }]}>Send a package</Text>
          <Text style={[styles.ctaDesc, { color: theme.textSecond }]}>
            Enter pickup and drop-off to get instant quotes
          </Text>
          <Pressable
            style={[styles.ctaBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.push('/(customer)/send')}
          >
            <Text style={styles.ctaBtnText}>Book Delivery →</Text>
          </Pressable>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.id}
                style={[styles.actionCard, { backgroundColor: theme.surface }, Shadows.sm]}
                onPress={() => router.push(action.route as any)}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text style={[styles.actionLabel, { color: theme.text }]}>{action.label}</Text>
                <Text style={[styles.actionDesc, { color: theme.textSecond }]}>{action.desc}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Delivery Options */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Delivery Options</Text>
          <View style={styles.optionsRow}>
            {DELIVERY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.id}
                style={[styles.optionCard, { backgroundColor: theme.surface }, Shadows.sm]}
                onPress={() => {}}
              >
                <View style={[styles.optionIconWrap, { backgroundColor: opt.color + '18' }]}>
                  <Text style={styles.optionIcon}>{opt.icon}</Text>
                </View>
                <Text style={[styles.optionLabel, { color: theme.text }]}>{opt.label}</Text>
                <Text style={[styles.optionEta, { color: opt.color }]}>{opt.eta}</Text>
                <Text style={[styles.optionDesc, { color: theme.textSecond }]}>{opt.desc}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Recent deliveries placeholder */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Deliveries</Text>
          <View style={[styles.emptyState, { backgroundColor: theme.surface }, Shadows.sm]}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No deliveries yet</Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
              Your delivery history will appear here
            </Text>
          </View>
        </View>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  greeting: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: '#fff',
    marginBottom: 4,
  },
  headerSub: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.80)',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  ctaCard: {
    marginHorizontal: Spacing.xl,
    marginTop: -Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  ctaTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  ctaDesc: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  ctaBtn: {
    height: 48,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnText: {
    color: '#fff',
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  actionCard: {
    width: '47%',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    gap: 4,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  actionDesc: {
    fontSize: FontSize.xs,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  optionCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: 4,
  },
  optionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  optionIcon: {
    fontSize: 24,
  },
  optionLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  optionEta: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  optionDesc: {
    fontSize: FontSize.xs,
    textAlign: 'center',
  },
  emptyState: {
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  emptyDesc: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
