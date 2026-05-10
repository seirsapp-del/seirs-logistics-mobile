import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { MOCK_USER, MOCK_REWARDS } from '@/constants/mockData';

const TIERS = [
  { name: 'Bronze', min: 0,    max: 499,  color: '#CD7F32', icon: 'medal-outline' },
  { name: 'Silver', min: 500,  max: 999,  color: '#C0C0C0', icon: 'medal-outline' },
  { name: 'Gold',   min: 1000, max: 2499, color: '#FFD700', icon: 'medal' },
  { name: 'Platinum', min: 2500, max: 99999, color: '#E5E4E2', icon: 'diamond-outline' },
];

export default function RewardsScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const points      = MOCK_USER.points;
  const currentTier = TIERS.find(t => points >= t.min && points <= t.max) ?? TIERS[0];
  const nextTier    = TIERS[TIERS.indexOf(currentTier) + 1];
  const progress    = nextTier
    ? (points - currentTier.min) / (nextTier.min - currentTier.min)
    : 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Rewards</Text>
        <Pressable onPress={() => router.push('/(customer)/referral')}>
          <Ionicons name="gift-outline" size={22} color={theme.primary} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Points hero card */}
        <LinearGradient
          colors={isDark ? ['#FF6B00', '#1A0500'] : ['#3A86FF', '#1D6AE5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Your Points</Text>
              <Text style={styles.heroPoints}>{points.toLocaleString()}</Text>
            </View>
            <View style={[styles.tierBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Ionicons name={currentTier.icon as any} size={18} color={currentTier.color} />
              <Text style={[styles.tierName, { color: currentTier.color }]}>{currentTier.name}</Text>
            </View>
          </View>

          {/* Progress to next tier */}
          {nextTier && (
            <View style={styles.progressSection}>
              <View style={styles.progressLabels}>
                <Text style={styles.progressText}>{currentTier.name}</Text>
                <Text style={styles.progressText}>{nextTier.name} in {(nextTier.min - points).toLocaleString()} pts</Text>
              </View>
            </View>
          )}
        </LinearGradient>

        {/* Tier levels */}
        <View style={[styles.tiersCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Membership Tiers</Text>
          {TIERS.map((tier, i) => {
            const isActive = tier.name === currentTier.name;
            return (
              <View
                key={tier.name}
                style={[
                  styles.tierRow,
                  isActive && { backgroundColor: isDark ? '#111' : '#F8FAFC', borderRadius: Radius.lg },
                  i < TIERS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                ]}
              >
                <View style={[styles.tierIcon, { backgroundColor: tier.color + '20' }]}>
                  <Ionicons name={tier.icon as any} size={20} color={tier.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tierRowName, { color: theme.text }]}>{tier.name}</Text>
                  <Text style={[styles.tierRange, { color: theme.textSecond }]}>
                    {tier.min.toLocaleString()} – {tier.max === 99999 ? '∞' : tier.max.toLocaleString()} pts
                  </Text>
                </View>
                {isActive && (
                  <View style={[styles.currentBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.currentBadgeText}>Current</Text>
                  </View>
                )}
                {points >= tier.min && tier.name !== currentTier.name && (
                  <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                )}
              </View>
            );
          })}
        </View>

        {/* Redeem rewards */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Redeem Points</Text>

        {MOCK_REWARDS.map(reward => {
          const canRedeem = points >= reward.points;
          return (
            <Pressable
              key={reward.id}
              style={[
                styles.rewardRow,
                { backgroundColor: theme.surface, borderColor: canRedeem ? theme.primary : theme.border },
                Shadows.xs,
              ]}
              disabled={!canRedeem}
              onPress={() => {}}
            >
              <View style={[styles.rewardIcon, { backgroundColor: canRedeem ? (isDark ? '#001020' : '#EFF6FF') : theme.surfaceSecond }]}>
                <Ionicons name={reward.icon as any} size={22} color={canRedeem ? theme.primary : theme.textThird} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rewardLabel, { color: canRedeem ? theme.text : theme.textSecond }]}>{reward.label}</Text>
                <View style={styles.rewardMeta}>
                  <Ionicons name="star" size={12} color="#FFBE0B" />
                  <Text style={[styles.rewardPoints, { color: theme.textSecond }]}>{reward.points.toLocaleString()} pts</Text>
                </View>
              </View>
              {canRedeem ? (
                <View style={[styles.redeemBtn, { backgroundColor: theme.primary }]}>
                  <Text style={styles.redeemBtnText}>Redeem</Text>
                </View>
              ) : (
                <Text style={[styles.needMore, { color: theme.textThird }]}>
                  Need {(reward.points - points).toLocaleString()} more
                </Text>
              )}
            </Pressable>
          );
        })}

        {/* How to earn */}
        <View style={[styles.earnCard, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '30' }]}>
          <Text style={[styles.earnTitle, { color: theme.text }]}>How to earn points</Text>
          {[
            { icon: 'car-outline',    text: '1 point per ₦10 spent on trips' },
            { icon: 'people-outline', text: '500 pts for each friend referred' },
            { icon: 'star-outline',   text: '50 pts for rating a driver' },
          ].map(item => (
            <View key={item.text} style={styles.earnRow}>
              <Ionicons name={item.icon as any} size={16} color={theme.primary} />
              <Text style={[styles.earnText, { color: theme.textSecond }]}>{item.text}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  heroCard:      { borderRadius: Radius.xxl, padding: Spacing.lg, gap: Spacing.md },
  heroTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel:     { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm, marginBottom: 4 },
  heroPoints:    { color: '#fff', fontSize: 40, fontWeight: FontWeight.bold, letterSpacing: -1 },
  tierBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full },
  tierName:      { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  progressSection: { gap: 6 },
  progressLabels:  { flexDirection: 'row', justifyContent: 'space-between' },
  progressText:    { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.xs },

  tiersCard:    { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', gap: 0 },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, padding: Spacing.md, paddingBottom: 0 },
  tierRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  tierIcon:     { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  tierRowName:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  tierRange:    { fontSize: FontSize.xs, marginTop: 2 },
  currentBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  currentBadgeText: { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },

  rewardRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  rewardIcon:  { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  rewardLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  rewardMeta:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rewardPoints:{ fontSize: FontSize.xs },
  redeemBtn:   { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full },
  redeemBtnText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  needMore:    { fontSize: FontSize.xs, maxWidth: 70, textAlign: 'right' },

  earnCard:  { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  earnTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  earnRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  earnText:  { fontSize: FontSize.sm, lineHeight: 20, flex: 1 },
});
