import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

// Universal/web fallback link — when the receiver doesn't have the app,
// the page on seirs.app/r/<code> can show download links and forward
// the code through to the play store / app store via deferred deep linking.
const WEB_REFERRAL_BASE = 'https://seirs.app/r/';

const REFERRAL_HISTORY = [
  { id: 'r1', name: 'Kemi Adeyemo',  status: 'completed', earned: 1000, date: '2026-04-20' },
  { id: 'r2', name: 'Femi Oladele',  status: 'completed', earned: 1000, date: '2026-04-15' },
  { id: 'r3', name: 'Aisha Mohammed', status: 'pending', earned: 0, date: '2026-04-28' },
];

export default function ReferralScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { user } = useAuth();
  const { t }   = useTranslation();

  // Use the user's accountId (e.g. CUST-A7K2P9) as the referral code so
  // it doubles as their SEIRS Verified ID per Spec V8.
  const referralCode = user?.accountId ?? 'JOIN-SEIRS';

  // Deep link: opens the app directly to register screen with code prefilled.
  // Web URL is the public fallback for receivers without the app installed.
  const deepLink = Linking.createURL('(auth)/register', { queryParams: { ref: referralCode } });
  const webLink  = `${WEB_REFERRAL_BASE}${referralCode}`;

  const [copied, setCopied] = useState(false);

  const totalEarned = REFERRAL_HISTORY.filter(r => r.status === 'completed').reduce((s, r) => s + r.earned, 0);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message:
          `Join SEIRS Logistics and get ₦500 off your first ride! Use my code: ${referralCode}\n\n` +
          `Tap to install and apply automatically: ${webLink}\n` +
          `Already have the app? ${deepLink}`,
      });
    } catch {}
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('referral2.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Hero */}
        <LinearGradient
          colors={isDark ? ['#FF6B00', '#0A0A0A'] : ['#3A86FF', '#2EC4B6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="gift" size={36} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{t('referral2.heroTitle')}</Text>
          <Text style={styles.heroDesc}>
            You get ₦1,000 and your friend gets ₦500 off their first ride when they sign up with your code.
          </Text>
        </LinearGradient>

        {/* Referral code */}
        <View style={[styles.codeCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.codeLabel, { color: theme.textSecond }]}>{t('referral2.yourCode')}</Text>
          <View style={[styles.codeRow, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
            <Text style={[styles.codeText, { color: theme.primary }]}>{referralCode}</Text>
            <Pressable
              style={[styles.copyBtn, { backgroundColor: copied ? '#22C55E' : theme.primary }]}
              onPress={handleCopy}
            >
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color="#fff" />
              <Text style={styles.copyBtnText}>{copied ? 'Copied!' : 'Copy'}</Text>
            </Pressable>
          </View>
          <Pressable style={[styles.shareBtn, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '40' }]} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={18} color={theme.primary} />
            <Text style={[styles.shareBtnText, { color: theme.primary }]}>{t('referral2.share')}</Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          {[
            { label: 'Total Referred', value: `${REFERRAL_HISTORY.length}`, icon: 'people-outline', color: theme.primary },
            { label: 'Completed',      value: `${REFERRAL_HISTORY.filter(r => r.status === 'completed').length}`, icon: 'checkmark-circle-outline', color: '#22C55E' },
            { label: 'Total Earned',   value: `₦${totalEarned.toLocaleString()}`, icon: 'cash-outline', color: '#FFBE0B' },
          ].map((stat, i) => (
            <View key={stat.label} style={[styles.statItem, i < 2 && { borderRightWidth: 1, borderRightColor: theme.border }]}>
              <Ionicons name={stat.icon as any} size={20} color={stat.color} />
              <Text style={[styles.statValue, { color: theme.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecond }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* How it works */}
        <View style={[styles.howCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.howTitle, { color: theme.text }]}>How it works</Text>
          {[
            { step: '1', text: 'Share your referral code with friends' },
            { step: '2', text: 'Friend signs up and completes their first ride' },
            { step: '3', text: 'You both get rewarded!' },
          ].map(s => (
            <View key={s.step} style={styles.howRow}>
              <View style={[styles.howStep, { backgroundColor: theme.primary }]}>
                <Text style={styles.howStepText}>{s.step}</Text>
              </View>
              <Text style={[styles.howText, { color: theme.text }]}>{s.text}</Text>
            </View>
          ))}
        </View>

        {/* Referral history */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Referral History</Text>

        {REFERRAL_HISTORY.map(ref => (
          <View key={ref.id} style={[styles.refRow, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
            <View style={[styles.refAvatar, { backgroundColor: theme.primary + '20' }]}>
              <Text style={[styles.refAvatarText, { color: theme.primary }]}>
                {ref.name.charAt(0)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.refName, { color: theme.text }]}>{ref.name}</Text>
              <Text style={[styles.refDate, { color: theme.textSecond }]}>
                {new Date(ref.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>
            {ref.status === 'completed' ? (
              <Text style={styles.refEarned}>+₦{ref.earned.toLocaleString()}</Text>
            ) : (
              <View style={[styles.pendingBadge, { backgroundColor: '#FEF9C3', borderColor: '#FDE68A' }]}>
                <Text style={styles.pendingBadgeText}>Pending</Text>
              </View>
            )}
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  hero:     { borderRadius: Radius.xxl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  heroIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  heroTitle:{ color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.bold, textAlign: 'center' },
  heroDesc: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },

  codeCard:  { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  codeLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  codeRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, paddingLeft: Spacing.md, overflow: 'hidden' },
  codeText:  { flex: 1, fontSize: FontSize.xl, fontWeight: FontWeight.bold, letterSpacing: 2 },
  copyBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 14 },
  copyBtnText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  shareBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  shareBtnText:{ fontSize: FontSize.base, fontWeight: FontWeight.semibold },

  statsRow:  { flexDirection: 'row', borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  statItem:  { flex: 1, alignItems: 'center', gap: 4, padding: Spacing.md },
  statValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  statLabel: { fontSize: FontSize.xs, textAlign: 'center' },

  howCard:  { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  howTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  howRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  howStep:  { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  howStepText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  howText:  { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },

  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  refRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  refAvatar:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  refAvatarText:{ fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  refName:     { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  refDate:     { fontSize: FontSize.xs, marginTop: 2 },
  refEarned:   { color: '#22C55E', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  pendingBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.md, borderWidth: 1 },
  pendingBadgeText:{ color: '#92400E', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
});
