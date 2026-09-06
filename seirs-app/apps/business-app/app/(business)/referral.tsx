import {
  View, Text, Pressable, StyleSheet, ScrollView, Share, ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { useColors, useTheme } from '@/context/ThemeContext';
import { Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { loyaltyApi } from '@/services/api';
import { WEB_BASE } from '@/constants/config';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

/**
 * Refer & Earn, for business accounts.
 *
 * The business app could already be REFERRED (register.tsx takes a code) and
 * had no way to refer anybody: the screen simply did not exist, so a sender
 * who wanted to bring another business in had nowhere to get their code.
 * The backend never cared: getMyReferrals matches on accountId, which a
 * business account has like any other.
 *
 * Mirrors the customer app's Refer & Earn (founder 2026-09-05: "the business
 * app should have those screens as well"), in this app's idiom.
 */
export default function BusinessReferralScreen() {
  const insets   = useSafeAreaInsets();
  const colors   = useColors();
  const { isDark } = useTheme();
  const router   = useRouter();
  const { user } = useAuth();

  const [rows,    setRows]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState(false);

  // The account's own SEIRS ID is the referral code, exactly as in the
  // customer app: one identifier, not a second thing to keep track of.
  const code = user?.accountId ?? '';
  const link = `${WEB_BASE}/r/${code}`;

  useEffect(() => {
    loyaltyApi.myReferrals()
      .then((r: any) => setRows(Array.isArray(r) ? r : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const paid   = rows.filter((r: any) => r?.bonusPaid).length;
  const points = rows.reduce((sum: number, r: any) => sum + Number(r?.pointsAwarded ?? 0), 0);

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const share = async () => {
    if (!code) return;
    try {
      await Share.share({
        message:
          `Move your packages with SEIRS. Use my code ${code} when you sign up ` +
          `and we both earn points once your first delivery is done. ${link}`,
      });
    } catch {
      /* the sheet was dismissed, which is not a failure */
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icon name="ArrowLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{tx('auto.referral.referEarn', 'Refer & Earn')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        {/*
          The customer app's hero, exactly (founder 2026-09-05: "the customers
          screen looks better can you make the business app like that").

          Three things carried the difference and none of them was the copy: a
          blue-to-teal gradient instead of navy on navy, a gift medallion
          anchoring the top, and everything centred. The navy version read as
          another balance card, which is the one thing this screen is not.
        */}
        <LinearGradient
          colors={isDark ? ['#FF6B00', '#0A0A0A'] : ['#3A7BD5', '#2EC4B6']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadows.sm]}
        >
          <View style={styles.heroIcon}>
            <Icon name="Gift" size={34} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{tx('auto.referral.inviteABusinessEarnRewards', 'Invite a business, earn Rewards')}</Text>
          <Text style={styles.heroSub}>
            {tr('auto.referral.youEarn200SeirsPoints', 'You earn 200 SEIRS points every time a business signs up with your code and completes their first paid delivery.')}
          </Text>
        </LinearGradient>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textThird }]}>{tr('auto.referral.yourReferralCode', 'YOUR REFERRAL CODE')}</Text>
          <View style={styles.codeRow}>
            <View style={[styles.codeBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.code, { color: colors.text }]} numberOfLines={1}>
                {code || tx9('auto.referral.notAvailable', 'Not available')}
              </Text>
            </View>
            <Pressable onPress={copy} style={[styles.copyBtn, { backgroundColor: colors.primary }]}>
              <Icon name={copied ? 'Check' : 'Copy'} size={16} color="#fff" />
              <Text style={styles.copyText}>{copied ? tx9('auto.deliveryDetail.copied', 'Copied') : tx9('auto.deliveryDetail.copy', 'Copy')}</Text>
            </Pressable>
          </View>
          <Pressable onPress={share} style={[styles.shareBtn, { borderColor: colors.primary }]}>
            <Icon name="Share2" size={16} color={colors.primary} />
            <Text style={[styles.shareText, { color: colors.primary }]}>{tx('auto.referral.shareInviteLink', 'Share invite link')}</Text>
          </Pressable>
        </View>

        <View style={[styles.card, styles.statRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Colour-coded like the customer app: three grey glyphs said the
              three numbers were the same kind of thing. */}
          {[
            { icon: 'Users'         as const, value: rows.length, label: tr('auto.referral.signups', 'Signups'),       tint: colors.primary },
            { icon: 'CheckCircle2'  as const, value: paid,        label: tr('auto.referral.bonusesPaid', 'Bonuses paid'),  tint: '#22C55E' },
            { icon: 'Star'          as const, value: points,      label: tr('auto.referral.pointsEarned', 'Points earned'), tint: '#FFBE0B' },
          ].map((s) => (
            <View key={s.label} style={styles.stat}>
              <Icon name={s.icon} size={20} color={s.tint} />
              <Text style={[styles.statValue, { color: colors.text }]}>{s.value.toLocaleString()}</Text>
              <Text style={[styles.statLabel, { color: colors.textThird }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{tx('auto.referral.howItWorks', 'How it works')}</Text>
          {[
            tx9('auto.referral.shareYourCodeWithAnother', 'Share your code with another business'),
            tx9('auto.referral.theySignUpAndComplete', 'They sign up and complete their first delivery'),
            tx9('auto.referral.youBothGetRewarded', 'You both get rewarded'),
          ].map((step, i) => (
            <View key={step} style={styles.stepRow}>
              <View style={[styles.stepNo, { backgroundColor: colors.primary }]}>
                <Text style={styles.stepNoText}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.textSecond }]}>{step}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{tx('auto.referral.referralHistory', 'Referral history')}</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : rows.length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, alignItems: 'center', gap: 8 }]}>
            <Icon name="Users" size={28} color={colors.textThird} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>{tx('auto.referral.noReferralsYet', 'No referrals yet')}</Text>
            <Text style={[styles.emptySub, { color: colors.textSecond }]}>
              {tr('auto.referral.shareYourCodeWhenThey', 'Share your code. When they sign up and complete their first delivery, you both start earning points.')}
            </Text>
          </View>
        ) : (
          rows.map((r: any, i: number) => (
            <View
              key={r.id ?? i}
              style={[styles.card, styles.histRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.histName, { color: colors.text }]} numberOfLines={1}>
                  {r.name ?? r.businessName ?? tx9('auto.referral.aBusiness', 'A business')}
                </Text>
                <Text style={[styles.histSub, { color: colors.textThird }]}>
                  {r.joinedAt ? new Date(r.joinedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                </Text>
              </View>
              {/* Signed up is not the same as paid: the bonus lands on their
                  first completed delivery, and saying so here stops the
                  question of where the points went. */}
              <Text style={[styles.histState, { color: r.bonusPaid ? '#16A34A' : colors.textThird }]}>
                {r.bonusPaid ? tx9('auto.referral.bonusPaid', 'Bonus paid') : tx9('auto.referral.awaitingFirstDelivery', 'Awaiting first delivery')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: FontWeight.bold },

  hero:      { margin: 16, borderRadius: 22, padding: 22, gap: 10, alignItems: 'center' },
  heroIcon:  { width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  heroSub:   { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 19, textAlign: 'center' },

  card:      { marginHorizontal: 16, marginBottom: 14, borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  label:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },

  codeRow:  { flexDirection: 'row', gap: 10 },
  codeBox:  { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center', minHeight: 46 },
  code:     { fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  copyBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
  copyText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5 },
  shareText:{ fontSize: 14, fontWeight: '700' },

  statRow:   { flexDirection: 'row', gap: 0 },
  stat:      { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11 },

  stepRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNo:    { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNoText:{ color: '#fff', fontSize: 12, fontWeight: '800' },
  stepText:  { flex: 1, fontSize: 13, lineHeight: 18 },

  sectionTitle: { fontSize: 16, fontWeight: '700', marginHorizontal: 16, marginBottom: 12, marginTop: 4 },
  emptySub:  { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  histRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  histName:  { fontSize: 14, fontWeight: '600' },
  histSub:   { fontSize: 12, marginTop: 2 },
  histState: { fontSize: 11, fontWeight: '700' },
});
