import {
  View, Text, Pressable, StyleSheet, Alert, ScrollView, StatusBar, Linking, Platform, Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { HamburgerButton } from '@/components/HamburgerButton';
import { deliveriesApi, loyaltyApi, promotionsApi } from '@/services/api';

type MenuSection = { title: string; items: MenuItem[] };
type MenuItem = { icon: string; label: string; sub?: string; onPress: () => void; danger?: boolean };

export default function ProfileScreen() {
  const router           = useRouter();
  const cs               = useColorScheme();
  const theme            = Colors[cs ?? 'light'];
  const isDark           = cs === 'dark';
  const { user, logout } = useAuth();
  const { t }            = useTranslation();

  // Real backend-sourced stats. Default to 0 / null while loading so we
  // never show MOCK_USER numbers masquerading as the user's own data.
  const [loyaltyPoints,   setLoyaltyPoints]   = useState<number | null>(null);
  const [loyaltyTier,     setLoyaltyTier]     = useState<string | null>(null);
  const [completedTrips,  setCompletedTrips]  = useState<number | null>(null);
  const [activePromos,    setActivePromos]    = useState<number | null>(null);
  const [referralCode,    setReferralCode]    = useState<string | null>(null);
  const [showQrModal,     setShowQrModal]     = useState(false);

  // Show only the FIRST name (privacy. never expose full govt name on
  // read-only screens; drivers and other users don't need the full legal
  // name). Falls back to the legacy `name` split for accounts that
  // pre-date the firstName/lastName rollout.
  const displayName = (user as any)?.firstName
    ?? (user?.name ? String(user.name).trim().split(/\s+/)[0] : '');

  useFocusEffect(
    // Re-fetch on every focus so coming back from wallet top-up etc.
    // shows fresh numbers without a full restart.
    useCallback(() => {
      let cancelled = false;
      (async () => {
        // paymentsApi.wallet() ran here on every focus and its result was
        // never read: the wallet cell was removed when customers stopped
        // holding NGN, the fetch was not (sweep C-1.5).
        const [l, h, p] = await Promise.all([
          loyaltyApi.balance().catch(() => null),
          deliveriesApi.myDeliveries(1, 1).catch(() => null),
          promotionsApi.listActive().catch(() => null),
        ]);
        if (cancelled) return;
        setLoyaltyPoints(l?.balance ?? 0);
        setLoyaltyTier(l?.tier ?? null);
        setCompletedTrips((h as any)?.total ?? (h as any)?.items?.filter?.((i: any) => i.status === 'completed').length ?? 0);
        setActivePromos((p ?? []).length);
        // Your referral code IS your SEIRS ID: the backend matches
        // referrers by accountId, and there is no user.referralCode field
        // anywhere server-side. Reading it left this row blank for every
        // user since launch prep (found 2026-08-15). referral.tsx already
        // used accountId correctly.
        setReferralCode((user as any)?.accountId ?? null);
      })();
      return () => { cancelled = true; };
    }, [user]),
  );

  const handleLogout = () => {
    Alert.alert(t('profile.signOut'), t('profile.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: logout },
    ]);
  };

  const SECTIONS: MenuSection[] = [
    {
      title: t('profile.sectionAccount'),
      items: [
        { icon: 'person-outline',    label: t('profile.editProfile'),     sub: t('profile.editProfileSub'),     onPress: () => router.push('/(customer)/edit-profile') },
        // Identity verification. see [[project_seirs_identity_policy]]. Optional
        // trust-tier upgrade; unverified users have full app access. The screen
        // itself handles status (not-started / pending / rejected / verified)
        // + benefits copy + doc-type picker + upload + submit.
        { icon: 'shield-outline',    label: t('profile.verifyIdentity'),  sub: t('profile.verifyIdentitySub'),  onPress: () => router.push('/(customer)/verify-identity') },
        { icon: 'card-outline',      label: t('profile.paymentMethods'),  sub: t('profile.paymentMethodsSub'),  onPress: () => router.push('/(customer)/payment-methods') },
        { icon: 'location-outline',  label: t('profile.savedAddresses'),  sub: t('profile.savedAddressesSub'),  onPress: () => router.push('/(customer)/addresses') },
      ],
    },
    {
      title: t('profile.sectionActivity'),
      items: [
        // My Trips + Rewards rows removed (founder 2026-08-10): the
        // stats above are tappable and the bottom tabs own both. The
        // Refer & Earn row is gone too; the referral banner below the
        // menu is the single entry.
        { icon: 'ticket-outline',    label: t('profile.promotions'),  sub: t('profile.promotionsSub', { count: activePromos ?? 0 }), onPress: () => router.push('/(customer)/promotions') },
      ],
    },
    {
      title: t('profile.sectionPreferences'),
      items: [
        { icon: 'notifications-outline', label: t('profile.notifications'), sub: t('profile.notificationsSub'), onPress: () => router.push('/(customer)/notifications' as any) },
        { icon: 'document-text-outline', label: 'Documents', sub: 'Letters and documents from SEIRS', onPress: () => router.push('/(customer)/documents' as any) },
        { icon: 'language-outline',      label: t('profile.language'),      sub: t('profile.languageSub'),      onPress: () => router.push('/(customer)/language') },
        { icon: 'lock-closed-outline',   label: t('profile.privacy'),       sub: t('profile.privacySub'),       onPress: () => router.push('/(customer)/privacy') },
      ],
    },
    {
      title: t('profile.sectionSupport'),
      items: [
        // One help entry, not two: the old "Live Chat" row went to the
        // exact same help screen. Live chat now means a real ticket.
        { icon: 'help-circle-outline',   label: t('profile.helpCenter'), sub: t('profile.helpCenterSub'), onPress: () => router.push('/(customer)/help') },
        { icon: 'chatbubble-outline',    label: t('profile.liveChat'),   sub: t('profile.liveChatSub'),   onPress: () => router.push('/(customer)/support/new' as any) },
        { icon: 'alert-circle-outline',  label: t('profile.sos', { defaultValue: 'SOS Emergency' }), sub: t('profile.sosSub', { defaultValue: 'Immediate help with live location' }), onPress: () => router.push('/(customer)/sos' as any), danger: true },
        { icon: 'document-text-outline', label: t('profile.terms'),      sub: t('profile.termsSub'),      onPress: () => Linking.openURL('https://seirs-website.vercel.app/terms-of-service').catch(() => Alert.alert(t('common.comingSoon'), t('profile.termsComingSoon'))) },
      ],
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <HamburgerButton />
            <Text style={[styles.title, { color: theme.text }]}>{t('profile.title')}</Text>
          </View>
          {/* Bell to the notification INBOX (was a gear to settings;
              settings already has its row under Preferences). Matches
              the driver profile header. */}
          <Pressable
            style={[styles.settingsBtn, { backgroundColor: theme.surfaceSecond }]}
            onPress={() => router.push('/notifications' as any)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={theme.text} />
          </Pressable>
        </View>

        {/* User card */}
        <View style={[styles.userCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={styles.userCardTop}>
            {/* Tapping the avatar opens edit-profile, where the photo
                picker already lives. The camera badge is the discovery
                cue: without it nobody knew a photo could be uploaded
                (founder 2026-08-12). Badge hides once a photo is set. */}
            <Pressable
              onPress={() => router.push('/(customer)/edit-profile' as any)}
              accessibilityRole="button"
              accessibilityLabel={user?.profilePhoto ? t('profile.changePhoto', { defaultValue: 'Change profile photo' }) : t('profile.addPhoto', { defaultValue: 'Add a profile photo' })}
            >
              <Avatar name={displayName} uri={user?.profilePhoto} size={68} />
              {!user?.profilePhoto && (
                <View style={[styles.photoBadge, { backgroundColor: theme.accent, borderColor: theme.surface }]}>
                  <Ionicons name="camera" size={12} color="#fff" />
                </View>
              )}
            </Pressable>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[styles.userName, { color: theme.text }]}>{displayName || '-'}</Text>
                {/* Verified badge appears once admin approves the identity
                    submission (user.identityVerifiedAt is set). Silent when
                    unverified. see [[project_seirs_identity_policy]]. */}
                {(user as any)?.identityVerifiedAt && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#10B98118', borderColor: '#10B98140', borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Ionicons name="shield-checkmark" size={11} color="#059669" />
                    <Text style={{ color: '#065F46', fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>Verified</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.userEmail, { color: theme.textSecond }]}>{user?.email ?? '-'}</Text>
              <Text style={[styles.userPhone, { color: theme.textSecond }]}>{user?.phone ?? '-'}</Text>
            </View>
            {/* Show tier pill only once the user has earned above Bronze (the
                entry tier. every new user is Bronze, so showing it adds
                visual noise for the ~90% who haven't unlocked anything).
                Silver / Gold / Platinum are aspirational and worth showing. */}
            {loyaltyTier && loyaltyTier.toLowerCase() !== 'bronze' && (
              <View style={[styles.tierPill, { backgroundColor: '#FFBE0B20', borderColor: '#FFBE0B40' }]}>
                <Ionicons name="medal" size={13} color="#FFBE0B" />
                <Text style={[styles.tierText, { color: '#B45309' }]}>{loyaltyTier}</Text>
              </View>
            )}
          </View>

          {/* SEIRS ID row. Tap to open the QR modal (also has copy button).
              Primary identifier for support flows; the QR is for in-person
              identification (a driver can scan a customer's QR or vice versa). */}
          {(user as any)?.accountId && (
            <Pressable
              onPress={() => setShowQrModal(true)}
              style={[styles.seirsIdRow, { borderTopColor: theme.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.seirsIdLabel, { color: theme.textSecond }]}>SEIRS ID · tap for QR</Text>
                <Text style={[styles.seirsIdValue, { color: theme.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>
                  {(user as any).accountId}
                </Text>
              </View>
              <Ionicons name="qr-code-outline" size={18} color={theme.textThird} />
            </Pressable>
          )}

          {/* Stats row. drivers get rated, customers don't. Tier replaces
              the old "Wallet ₦" cell because customers cannot hold NGN
              (see [[feedback_wallet_is_rewards]]): tier is the natural
              at-a-glance value alongside Trips and Points.
              Falls back to '-' while real data loads. NEVER mock values. */}
          {/* Tappable stats replace the old My Trips + Rewards menu
              rows (founder 2026-08-10). */}
          <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
            {[
              { label: t('profile.statTrips'),  value: completedTrips != null ? `${completedTrips}` : '-', route: '/(customer)/history' },
              { label: t('profile.statPoints'), value: loyaltyPoints  != null ? loyaltyPoints.toLocaleString() : '-', route: '/(customer)/rewards' },
              { label: t('profile.statTier'),   value: loyaltyTier ? loyaltyTier.charAt(0).toUpperCase() + loyaltyTier.slice(1) : '-', route: '/(customer)/rewards' },
            ].map((s, i) => (
              <Pressable
                key={s.label}
                style={({ pressed }) => [styles.statItem, i < 2 && { borderRightWidth: 1, borderRightColor: theme.border }, pressed && { opacity: 0.6 }]}
                onPress={() => router.push(s.route as any)}
              >
                <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecond }]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Referral code quick access. only show the code if the user
            actually has one; otherwise tap-through to the referral screen
            where they can generate or claim one. */}
        <Pressable
          style={[styles.refRow, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '40' }]}
          onPress={() => router.push('/(customer)/referral')}
        >
          <Ionicons name="gift-outline" size={18} color={theme.primary} />
          <Text style={[styles.refText, { color: theme.text }]}>
            {t('profile.yourReferralCode')}{' '}
            {referralCode && (
              <Text style={{ color: theme.primary, fontWeight: FontWeight.bold }}>{referralCode}</Text>
            )}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
        </Pressable>

        {/* Menu sections */}
        {SECTIONS.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>{section.title}</Text>
            <View style={[styles.menuCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              {section.items.map((item, i, arr) => (
                <Pressable
                  key={item.label}
                  style={[
                    styles.menuRow,
                    i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                  ]}
                  onPress={item.onPress}
                >
                  <View style={[styles.menuIcon, { backgroundColor: item.danger ? '#FEF2F2' : theme.surfaceSecond }]}>
                    <Ionicons name={item.icon as any} size={19} color={item.danger ? '#EF4444' : theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, { color: item.danger ? '#EF4444' : theme.text }]}>{item.label}</Text>
                    {item.sub && <Text style={[styles.menuSub, { color: theme.textSecond }]}>{item.sub}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* Read from the app manifest, never typed by hand. This line said
            "SEIRS Logistics v2.0.0 Build 204" while app.json said 1.0.0, so
            support asking "what version are you on?" got a made-up answer
            (sweep C-5.6). */}
        <Text style={[styles.version, { color: theme.textThird }]}>
          {t('profile.version', { version: Constants.expoConfig?.version ?? '?' })}
        </Text>

        {/* Sign out */}
        <Pressable
          style={[styles.logoutBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>{t('profile.signOut')}</Text>
        </Pressable>

      </ScrollView>

      {/* SEIRS ID QR modal. Shown on tap of the SEIRS ID row.
          Doubles as identity handshake (a driver / support person scans
          the QR to identify the user) and quick-copy for phone support. */}
      <Modal
        visible={showQrModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQrModal(false)}
      >
        <Pressable
          onPress={() => setShowQrModal(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg }}
        >
          <Pressable
            onPress={() => { /* absorb tap so modal doesn't close when tapping card */ }}
            style={{ backgroundColor: theme.surface, borderRadius: Radius.xl, padding: Spacing.lg, alignItems: 'center', gap: Spacing.md, width: '100%', maxWidth: 340 }}
          >
            <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: theme.text }}>Your SEIRS ID</Text>
            <Text style={{ fontSize: FontSize.xs, color: theme.textSecond, textAlign: 'center' }}>
              Show this to a driver or support agent to identify yourself. No personal info is encoded, just your unique account handle.
            </Text>

            <View style={{ padding: Spacing.md, backgroundColor: '#FFFFFF', borderRadius: Radius.lg }}>
              <QRCode
                value={String((user as any)?.accountId ?? '')}
                size={220}
                color="#0F2B4C"
                backgroundColor="#FFFFFF"
              />
            </View>

            <Text style={{ fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: theme.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 2 }}>
              {(user as any)?.accountId ?? ''}
            </Text>

            <View style={{ flexDirection: 'row', gap: Spacing.sm, width: '100%' }}>
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync((user as any).accountId);
                  Alert.alert('Copied', 'Your SEIRS ID has been copied.');
                }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: theme.border, borderRadius: Radius.lg, paddingVertical: 12 }}
              >
                <Ionicons name="copy-outline" size={16} color={theme.text} />
                <Text style={{ color: theme.text, fontWeight: FontWeight.semibold, fontSize: FontSize.sm }}>Copy</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowQrModal(false)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.primary, borderRadius: Radius.lg, paddingVertical: 12 }}
              >
                <Text style={{ color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.sm }}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll:  { paddingBottom: Spacing.xl * 2 },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title:       { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  userCard:    { marginHorizontal: Spacing.md, borderRadius: Radius.xxl, borderWidth: 1, marginBottom: Spacing.md, overflow: 'hidden' },
  userCardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  photoBadge:  { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  userName:    { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  userEmail:   { fontSize: FontSize.xs, marginTop: 2 },
  userPhone:   { fontSize: FontSize.xs, marginTop: 1 },
  tierPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, alignSelf: 'flex-start' },
  tierText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  seirsIdRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, borderTopWidth: 1 },
  seirsIdLabel:  { fontSize: FontSize.xs - 1, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: FontWeight.semibold },
  seirsIdValue:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, letterSpacing: 1, marginTop: 2 },

  statsRow:  { flexDirection: 'row', borderTopWidth: 1 },
  statItem:  { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  statValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  statLabel: { fontSize: FontSize.xs, marginTop: 2 },

  refRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.md },
  refText: { flex: 1, fontSize: FontSize.sm },

  section:      { marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm, paddingLeft: Spacing.xs },
  menuCard:     { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  menuRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
  menuIcon:     { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuLabel:    { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  menuSub:      { fontSize: FontSize.xs, marginTop: 2 },

  version:    { textAlign: 'center', fontSize: FontSize.xs, marginBottom: Spacing.md, marginTop: Spacing.xs },
  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, height: 52, borderRadius: Radius.xl, borderWidth: 1.5 },
  logoutText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: '#EF4444' },
});
