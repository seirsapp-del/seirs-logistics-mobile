import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { HamburgerButton } from '@/components/HamburgerButton';
import { driversApi, earningsApi, notificationsApi } from '@/services/api';
import { naira, nairaShort } from '@/utils/money';
import { alertDialog } from '@/components/SeirsDialog';

interface MenuSection {
  title: string;
  items: { icon: string; label: string; sub?: string; route?: string; danger?: boolean; badge?: string }[];
}

export default function DriverProfileScreen() {
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  const router           = useRouter();
  const cs               = useColorScheme();
  const theme            = Colors[cs ?? 'light'];
  const isDark           = cs === 'dark';
  const { user, logout } = useAuth();
  const [showQrModal, setShowQrModal] = useState(false);

  // Real profile data (production-readiness audit 2026-08-10: this
  // screen previously rendered MOCK_DRIVER's phone, tier, stats, and
  // balance for every driver). Refetched on every focus so the online
  // toggle from the home tab is reflected immediately.
  const [driverData, setDriverData] = useState<any>(null);
  const [dashboard,  setDashboard]  = useState<any>(null);
  const [ratings,    setRatings]    = useState<any>(null);
  const [unread,     setUnread]     = useState(0);

  useFocusEffect(useCallback(() => {
    driversApi.me().then(setDriverData).catch(() => {});
    earningsApi.dashboard().then(setDashboard).catch(() => {});
    driversApi.myRatings().then(setRatings).catch(() => {});
    notificationsApi.unreadCount().then(r => setUnread(r?.count ?? 0)).catch(() => {});
  }, []));

  // Rating comes from the REAL ratings aggregate, never a DB default:
  // a driver with zero ratings shows a dash, not a fake five stars.
  const ratingCount = Number(ratings?.total ?? 0);
  const rating      = ratingCount > 0 ? Number(ratings?.average ?? 0) : 0;
  const totalTrips  = Number(driverData?.totalTrips ?? 0);
  const available   = Number(dashboard?.available ?? 0);
  const allTime     = Number(dashboard?.allTime?.earned ?? 0);
  const isOnline    = !!driverData?.isOnline;
  const vehicleSub  = [driverData?.vehicleType, driverData?.plateNumber].filter(Boolean).join(' · ') || 'View vehicle details';

  // Final structure (founder decision 2026-08-10): Profile is THE
  // account hub. Ratings + Trip History rows are gone because the
  // stats above are tappable; Withdraw row gone because the balance
  // card IS the withdraw entry; Notifications row gone because the
  // header bell owns it. Documents + SOS deliberately duplicated from
  // the drawer (founder wants them reachable from both).
  const MENU_SECTIONS: MenuSection[] = [
    {
      title: 'Account',
      items: [
        { icon: 'person-outline',           label: 'Edit Profile',     sub: 'Name, photo, contact details', route: '/(driver)/edit-profile' },
        { icon: 'shield-checkmark-outline', label: 'KYC Verification', sub: 'Documents & verification',   route: '/(driver)/kyc' },
        { icon: 'car-outline',              label: 'My Vehicle',        sub: vehicleSub,                   route: '/(driver)/vehicle' },
      ],
    },
    {
      title: 'Earnings',
      items: [
        { icon: 'cash-outline',     label: 'Earnings & Wallet',   sub: 'Charts, calendar, history', route: '/(driver)/earnings' },
        { icon: 'business-outline', label: 'Payout Bank Account', sub: 'Manage where you get paid', route: '/(driver)/add-bank' },
      ],
    },
    {
      title: 'Work',
      items: [
        // SEIRS Premium row removed: the program is paused platform-wide
        // (founder decision 2026-08-10).
        { icon: 'calendar-outline',       label: 'My Schedule',   sub: 'Set working hours',           route: '/(driver)/schedule' },
        { icon: 'document-text-outline',  label: 'Documents',     sub: 'Statements, contracts, letters', route: '/(driver)/tax-docs' },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: 'notifications-outline', label: 'Notification Settings', route: '/(driver)/notification-settings' },
        { icon: 'lock-closed-outline',   label: 'Privacy & Data',        route: '/(driver)/privacy' },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-circle-outline', label: 'Help & Support', sub: 'FAQs and live chat', route: '/(driver)/help' },
        // Deliberately duplicated from the drawer (founder 2026-08-10),
        // like Documents and SOS.
        { icon: 'book-outline',        label: 'Driver Code of Conduct', sub: 'The standard every SEIRS driver agrees to', route: '/(driver)/code-of-conduct' },
        { icon: 'alert-circle-outline', label: 'SOS Emergency', sub: 'Immediate help with live location', route: '/(driver)/sos', danger: true },
      ],
    },
  ];

  const handleLogout = () => {
    setSheet({
      title: 'Sign out?',
      message: 'You will need your email and password to get back in.',
      options: [{ label: 'Sign out', variant: 'destructive', icon: 'log-out-outline', onPress: logout }],
      cancelLabel: 'Stay signed in',
    });
  };

  const handleItemPress = (item: MenuSection['items'][0]) => {
    if (item.route) router.push(item.route as any);
  };

  // Show only the FIRST name for privacy. Customers only need the first
  // name during a delivery; the full legal name lives on the KYC document.
  const displayName = (user as any)?.firstName
    ?? (user?.name ? String(user.name).trim().split(/\s+/)[0] : 'Driver');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.pageHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <HamburgerButton />
            <Text style={[styles.pageTitle, { color: theme.text }]}>Profile</Text>
          </View>
          <Pressable
            style={[styles.notifBtn, { backgroundColor: theme.surfaceSecond }]}
            onPress={() => router.push('/(driver)/notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={theme.text} />
            {unread > 0 && <View style={[styles.notifDot, { backgroundColor: theme.primary }]} />}
          </Pressable>
        </View>

        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={styles.profileTop}>
            {/* Tap the avatar to open edit-profile (photo picker lives
                there). A driver's face is a safety feature: the customer
                waiting on the street matches it against whoever walks up,
                so this is prompted harder than on the customer side.
                See the missing-photo banner below. */}
            <Pressable
              style={[styles.avatarWrap, { borderColor: theme.primary + '50' }]}
              onPress={() => router.push('/(driver)/edit-profile' as any)}
              accessibilityRole="button"
              accessibilityLabel={user?.profilePhoto ? 'Change profile photo' : 'Add your profile photo'}
            >
              <Avatar name={displayName} uri={user?.profilePhoto} size={72} />
              <View style={[styles.onlineDot, { backgroundColor: isOnline ? '#16A34A' : '#9CA3AF', borderColor: theme.surface }]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.driverName, { color: theme.text }]}>{displayName}</Text>
              <Text style={[styles.driverPhone, { color: theme.textSecond }]}>{user?.phone ?? ''}</Text>
              <View style={styles.badgeRow}>
                {/* The fake Bronze/Gold/Platinum tier badge is gone: no
                    driver tier system exists in the backend. Show the
                    honest online state instead. */}
                <View style={[styles.tierBadge, { backgroundColor: (isOnline ? '#16A34A' : '#9CA3AF') + '18', borderColor: (isOnline ? '#16A34A' : '#9CA3AF') + '40' }]}>
                  <Ionicons name={isOnline ? 'wifi-outline' : 'moon-outline'} size={11} color={isOnline ? '#16A34A' : '#9CA3AF'} />
                  <Text style={[styles.tierText, { color: isOnline ? '#16A34A' : '#9CA3AF' }]}>{isOnline ? 'Online' : 'Offline'}</Text>
                </View>
                {/* ID-Verified badge is now tied to user.identityVerifiedAt.
                    Previously hardcoded to always show, which was misleading.
                    Driver KYC status is separate (driver.status = approved)
                    and would need its own badge if we want to expose it. */}
                {(user as any)?.identityVerifiedAt && (
                  <View style={[styles.approvedBadge, { backgroundColor: '#22C55E18' }]}>
                    <Ionicons name="shield-checkmark" size={11} color="#22C55E" />
                    <Text style={[styles.approvedText, { color: '#22C55E' }]}>ID Verified</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Missing-photo prompt. Customers are told to check the face
              of whoever collects their package, which only works if the
              face is there. Persistent (not dismissible) until a photo
              is set, but it does not block earning: a driver mid-shift
              should not be locked out over a portrait. */}
          {!user?.profilePhoto && (
            <Pressable
              onPress={() => router.push('/(driver)/edit-profile' as any)}
              style={[styles.photoPrompt, { backgroundColor: '#F59E0B14', borderTopColor: theme.border }]}
            >
              <Ionicons name="camera-outline" size={18} color="#B45309" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.photoPromptTitle, { color: theme.text }]}>Add your photo</Text>
                <Text style={[styles.photoPromptBody, { color: theme.textSecond }]}>
                  Customers check your face before handing over a package. A clear photo gets you accepted faster.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
            </Pressable>
          )}

          {/* SEIRS ID row. Tap opens QR modal so drivers can show it to
              customers for in-person identity match, or share with support
              for dispatch escalations + payout disputes. */}
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

          {/* Stats. Tappable: each opens its detail screen, replacing
              the old Trip History + My Ratings menu rows. */}
          <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
            {[
              { label: 'Total Trips',  value: totalTrips.toLocaleString(), route: '/(driver)/history' },
              { label: 'Rating',       value: ratingCount > 0 ? rating.toFixed(1) : '-', route: '/(driver)/ratings' },
              { label: 'Total Earned', value: nairaShort(allTime), route: '/(driver)/earnings' },
            ].map(s => (
              <Pressable
                key={s.label}
                style={({ pressed }) => [styles.statItem, pressed && { opacity: 0.6 }]}
                onPress={() => router.push(s.route as any)}
              >
                <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: theme.textThird }]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Balance quick-access (neutral card; the green wash clashed
            with the design language, same call as the withdraw screen) */}
        <Pressable
          style={[styles.balanceCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}
          onPress={() => router.push('/(driver)/withdrawal')}
        >
          <View>
            <Text style={[styles.balLabel, { color: theme.textSecond }]}>Withdrawable Balance</Text>
            <Text style={[styles.balAmount, { color: theme.text }]}>{naira(available)}</Text>
          </View>
          <View style={[styles.withdrawQuick, { backgroundColor: theme.primary }]}>
            <Ionicons name="arrow-up-circle-outline" size={16} color="#fff" />
            <Text style={styles.withdrawQuickText}>Withdraw</Text>
          </View>
        </Pressable>

        {/* Menu sections */}
        {MENU_SECTIONS.map(section => (
          <View key={section.title}>
            <Text style={[styles.sectionHeader, { color: theme.textThird }]}>{section.title.toUpperCase()}</Text>
            <View style={[styles.menuCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              {section.items.map((item, i) => (
                <Pressable
                  key={item.label}
                  style={({ pressed }) => [
                    styles.menuRow,
                    i < section.items.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 0.5 },
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => handleItemPress(item)}
                >
                  <View style={[styles.menuIcon, { backgroundColor: theme.surfaceSecond }]}>
                    <Ionicons name={item.icon as any} size={18} color={item.danger ? '#EF4444' : theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, { color: item.danger ? '#EF4444' : theme.text }]}>{item.label}</Text>
                    {item.sub ? <Text style={[styles.menuSub, { color: theme.textSecond }]}>{item.sub}</Text> : null}
                  </View>
                  {item.badge && (
                    <View style={[styles.menuBadge, { backgroundColor: theme.primary }]}>
                      <Text style={styles.menuBadgeText}>{item.badge}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Text style={[styles.version, { color: theme.textThird }]}>Seirs Driver v1.0.0</Text>

        <Pressable
          style={[styles.logoutBtn, { backgroundColor: theme.error + '12', borderColor: theme.error + '30' }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.error} />
          <Text style={[styles.logoutText, { color: theme.error }]}>Sign Out</Text>
        </Pressable>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* SEIRS ID QR modal. Shown on tap of the SEIRS ID row. Drivers
          show this to customers at handoff for in-person identity match. */}
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
              Show this to a customer at handoff to prove you are the assigned driver.
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
                  alertDialog('Copied', 'Your SEIRS ID has been copied.');
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
      <SeirsSheet spec={sheet} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: Spacing.xl },

  pageHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  pageTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  notifBtn:    { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  notifDot:    { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },

  profileCard: { marginHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.md, overflow: 'hidden' },
  profileTop:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  avatarWrap:  { position: 'relative', width: 78, height: 78, borderRadius: 39, borderWidth: 2.5, justifyContent: 'center', alignItems: 'center' },
  onlineDot:   { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  photoPrompt:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: 1 },
  photoPromptTitle: { fontSize: 13, fontWeight: '700' },
  photoPromptBody:  { fontSize: 11.5, lineHeight: 16, marginTop: 1 },
  driverName:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  driverPhone: { fontSize: FontSize.sm, marginTop: 2, marginBottom: 6 },
  badgeRow:    { flexDirection: 'row', gap: Spacing.sm },
  tierBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  tierText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  approvedBadge:{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
  approvedText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#22C55E' },

  seirsIdRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, borderTopWidth: 1 },
  seirsIdLabel:  { fontSize: FontSize.xs - 1, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: FontWeight.semibold },
  seirsIdValue:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, letterSpacing: 1, marginTop: 2 },
  statsRow:  { flexDirection: 'row', borderTopWidth: 1, paddingVertical: Spacing.md },
  statItem:  { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  statLabel: { fontSize: FontSize.xs },

  balanceCard:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.md },
  balLabel:       { fontSize: FontSize.sm, marginBottom: 2 },
  balAmount:      { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  withdrawQuick:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.full },
  withdrawQuickText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  sectionHeader: { paddingHorizontal: Spacing.md + 4, paddingTop: Spacing.sm, paddingBottom: Spacing.xs, fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1 },
  menuCard:      { marginHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.sm },
  menuRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 14, gap: Spacing.md },
  menuIcon:      { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  menuLabel:     { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  menuSub:       { fontSize: FontSize.xs, marginTop: 1 },
  menuBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  menuBadgeText: { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },

  version:    { textAlign: 'center', fontSize: FontSize.xs, marginTop: Spacing.md, marginBottom: Spacing.sm },
  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, height: 52, borderRadius: Radius.xl, borderWidth: 1 },
  logoutText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
