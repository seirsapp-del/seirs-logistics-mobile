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
  Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/context/ThemeContext';
import { SeirsSheet, type SeirsSheetSpec } from '@/components/SeirsSheet';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { HamburgerButton } from '@/components/HamburgerButton';
import { driversApi, earningsApi, notificationsApi, usersApi } from '@/services/api';
import { naira, nairaShort } from '@/utils/money';
import { alertDialog } from '@/components/SeirsDialog';
import { savePdf } from '@seirs/shared/utils/dataExport';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

// The marketing site is the single home for FAQ and the legal documents:
// it is edited without shipping a release, and it teaches people SEIRS
// has a site they can navigate on their own (founder 2026-09-01).
const SITE = 'https://seirs-website.vercel.app';

interface MenuSection {
  title: string;
  items: { icon: string; label: string; sub?: string; route?: string; danger?: boolean; badge?: string; onPress?: () => void }[];
}

export default function DriverProfileScreen() {
  const [sheet, setSheet] = useState<SeirsSheetSpec | null>(null);
  const router           = useRouter();
  const cs               = useColorScheme();
  const { setTheme, setFollowSystem, followSystem } = useTheme();
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
  // The Driver entity has `totalDeliveries` and no `totalTrips` field at
  // all, so this read undefined and every driver's profile showed 0 trips
  // forever while the home screen, which falls back correctly, showed the
  // real number. Found on device 2026-08-31.
  const totalTrips  = Number(driverData?.totalDeliveries ?? driverData?.totalTrips ?? 0);
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
      title: tr('auto.editProfile.account', 'Account'),
      items: [
        { icon: 'person-outline',           label: tr('auto.editProfile.editProfile', 'Edit Profile'),     sub: tr('auto.profile.namePhotoContactDetails', 'Name, photo, contact details'), route: '/(driver)/edit-profile' },
        // One row, not two. Identity and vehicle were separate screens that
        // asked for three of the same documents, and a rider could not tell
        // which one wanted what (founder 2026-09-01). They are one screen now.
        { icon: 'shield-checkmark-outline', label: tr('auto.vehicle.kycVerification', 'KYC Verification'), sub: `Documents, and ${vehicleSub}`, route: '/(driver)/vehicle' },
      ],
    },
    {
      title: tr('auto.earnings.earnings', 'Earnings'),
      items: [
        { icon: 'cash-outline',     label: tr('auto.profile.earningsWallet', 'Earnings & Wallet'),   sub: tr('auto.profile.chartsCalendarHistory', 'Charts, calendar, history'), route: '/(driver)/earnings' },
        { icon: 'business-outline', label: tr('auto.addBank.payoutBankAccount', 'Payout Bank Account'), sub: tr('auto.profile.manageWhereYouGetPaid', 'Manage where you get paid'), route: '/(driver)/add-bank' },
      ],
    },
    {
      title: tr('auto.profile.work', 'Work'),
      items: [
        // SEIRS Premium row removed: the program is paused platform-wide
        // (founder decision 2026-08-10).
        { icon: 'calendar-outline',       label: tr('auto.profile.mySchedule', 'My Schedule'),   sub: tr('auto.profile.setWorkingHours', 'Set working hours'),           route: '/(driver)/schedule' },
        { icon: 'receipt-outline',        label: tr('auto.profile.statement', 'Statement'),     sub: tr('auto.profile.whatYouEarnedReadyTo', 'What you earned, ready to download'), route: '/(driver)/statement' },
        { icon: 'document-text-outline',  label: tr('auto.documents.documents', 'Documents'),     sub: tr('auto.profile.lettersAndDocumentsFromSeirs', 'Letters and documents from SEIRS'), route: '/(driver)/documents' },
      ],
    },
    {
      title: tr('auto.profile.preferences', 'Preferences'),
      items: [
        /*
         * No Notifications row here, matching business (founder 2026-08-16,
         * restated 2026-09-01). Two reasons, and the second is the real one:
         *
         * The bell in this screen's own header already opens the inbox, so
         * this was a second door to the same place.
         *
         * And there is nothing worth configuring. Everything the app sends
         * is something the person wants: a job offer, an earning, a message
         * from the other party, a payment. A settings screen full of toggles
         * nobody would ever turn off is furniture that implies these are
         * optional. They are not.
         */
        {
          icon:  'contrast-outline',
          label: tr('auto.profile.appearance', 'Appearance'),
          sub:   followSystem ? 'Following your phone' : (isDark ? 'Dark' : 'Light'),
          onPress: () => alertDialog(
            'Appearance',
            `How should the app look? Currently ${isDark ? 'Dark' : 'Light'}.`,
            [
              { text: tr('auto.profile.followMyPhone', 'Follow my phone'), onPress: () => setFollowSystem(true) },
              { text: tr('auto.profile.light', 'Light'),           onPress: () => setTheme('light') },
              { text: tr('auto.profile.dark', 'Dark'),            onPress: () => setTheme('dark') },
              { text: tr('auto.parcelRequests.cancel', 'Cancel'), style: 'cancel' },
            ],
          ),
        },
      ],
    },
    {
      /*
       * Support, Legal and Account actions now match business and customer,
       * which the founder signed off on 2026-09-01. Driver was the only one
       * of the three that folded the ticket row into help, so a rider who
       * wanted to raise something had no obvious row for it.
       *
       * Help opens the website rather than the in-app help screen: it is
       * edited without shipping a release, and it teaches riders SEIRS has
       * a site they can navigate on their own.
       */
      title: tr('auto.profile.support', 'Support'),
      items: [
        { icon: 'help-circle-outline',  label: tr('auto.profile.helpFaq', 'Help & FAQ'),      sub: tr('auto.profile.answersToTheCommonQuestions', 'Answers to the common questions'), onPress: () => Linking.openURL(`${SITE}/faq`).catch(() => {}) },
        { icon: 'chatbubble-outline',   label: tr('auto.profile.contactSupport', 'Contact Support'), sub: tr('auto.profile.raiseATicketWithA', 'Raise a ticket with a person'),    route: '/(driver)/support/new' },
        { icon: 'alert-circle-outline', label: tr('auto.sos.sosEmergency', 'SOS Emergency'),   sub: tr('auto.profile.immediateHelpWithLiveLocation', 'Immediate help with live location'), route: '/(driver)/sos', danger: true },
      ],
    },
    {
      /*
       * Legal was scattered: customer linked Terms and not Privacy,
       * business linked Privacy and not Terms, driver linked neither. Both
       * documents in every app now. The Code of Conduct joins them here,
       * because it is the third thing a rider agrees to and it belongs
       * beside the other two rather than under Support.
       */
      title: tr('auto.profile.legal', 'Legal'),
      items: [
        { icon: 'document-text-outline', label: tr('auto.driverRegister.termsOfService', 'Terms of Service'), sub: tr('auto.profile.theAgreementYouSignedUp', 'The agreement you signed up under'), onPress: () => Linking.openURL(`${SITE}/terms-of-service`).catch(() => {}) },
        { icon: 'lock-closed-outline',   label: tr('auto.driverRegister.privacyPolicy', 'Privacy Policy'),   sub: tr('auto.profile.howSeirsHandlesYourData', 'How SEIRS handles your data'),      onPress: () => Linking.openURL(`${SITE}/privacy-policy`).catch(() => {}) },
        { icon: 'book-outline',          label: tr('auto.codeOfConduct.driverCodeOfConduct', 'Driver Code of Conduct'), sub: tr('auto.profile.theStandardEverySeirsDriver', 'The standard every SEIRS driver agrees to'), route: '/(driver)/code-of-conduct' },
      ],
    },
    {
      /*
       * Its own group, at the end, in red. Google Play requires in-app
       * account deletion wherever an app creates accounts, and it has to be
       * findable, not merely present. The screen existed already, reachable
       * only from inside Privacy.
       */
      title: tr('auto.profile.accountActions', 'Account actions'),
      items: [
        /*
         * Carried off the Privacy & Data screen when that screen was
         * deleted (founder 2026-09-01). It is the only thing on it that
         * did something: GET /users/me/export really exists and really
         * queues an export. Everything else there was a duplicate, a dead
         * link, or a toggle nothing honoured.
         */
        { icon: 'download-outline', label: tr('auto.profile.downloadMyData', 'Download my data'), sub: tr('auto.profile.savedToYourDocuments', 'Saved to your Documents'), onPress: () => handleExportData() },
        { icon: 'trash-outline',    label: tr('auto.deleteAccount.deleteAccount', 'Delete Account'),   sub: tr('auto.profile.closeYourSeirsAccountFor', 'Close your SEIRS account for good'), route: '/(driver)/delete-account', danger: true },
      ],
    },
  ];

  const handleExportData = async () => {
    try {
      // Was: await usersApi.exportData() with the response DISCARDED, then a
      // promise of an email within 24 hours. No export email exists anywhere
      // in the backend, so nothing ever arrived. The bundle now lands in
      // Documents, next to statements and letters, where it can be read and
      // shared. Rate limited server-side to one per 24 hours: building it
      // walks every delivery, payment and audit row the person owns.
      const r: any = await usersApi.requestExportToDocuments();
      /**
       * Ready, and now something can be DONE with it. The shelf copy is a
       * readable summary; a rider asking for their data usually wants to keep
       * it or take it to an accountant, and the machine-readable copy is what
       * NDPR Article 24 actually asks for, which a PDF is not.
       */
      alertDialog(
        r?.ok ? 'Your data is ready' : 'Already prepared',
        r?.message ?? 'Open Documents to read or share it.',
        [
          { text: tr('auto.profile.saveAsPdf', 'Save as PDF'),           onPress: () => void exportAsPdf() },
          { text: tr('auto.documents.close', 'Close'), style: 'cancel' },
        ],
      );
    } catch {
      alertDialog('Could not prepare it', 'Please try again later, or contact support.');
    }
  };

  const exportAsPdf = async () => {
    try {
      const html = await usersApi.exportHtml();
      const out  = await savePdf(html, 'Your SEIRS data');
      if (!out.ok) alertDialog('Could not make the PDF', out.message);
      else if (!out.shared) alertDialog('Saved', 'The PDF was created on this phone.');
    } catch {
      alertDialog('Could not make the PDF', 'Your data is still in Documents and can be read there.');
    }
  };


  const handleLogout = () => {
    setSheet({
      title: tr('auto.profile.signOut2', 'Sign out?'),
      message: tr('auto.profile.youWillNeedYourEmail', 'You will need your email and password to get back in.'),
      options: [{ label: tr('auto.profile.signOut3', 'Sign out'), variant: 'destructive', icon: 'log-out-outline', onPress: logout }],
      cancelLabel: tr('auto.profile.staySignedIn', 'Stay signed in'),
    });
  };

  const handleItemPress = (item: MenuSection['items'][0]) => {
    // onPress wins: a row that does something in place (Appearance) has no
    // route to push. Every pre-existing row defines route and not onPress,
    // so this changes none of them.
    if (item.onPress) { item.onPress(); return; }
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
            <Text style={[styles.pageTitle, { color: theme.text }]}>{tx('auto.profile.profile', 'Profile')}</Text>
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
              accessibilityLabel={user?.profilePhoto ? tx9('auto.profile.changeProfilePhoto', 'Change profile photo') : tx9('auto.profile.addYourProfilePhoto', 'Add your profile photo')}
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
                  <Text style={[styles.tierText, { color: isOnline ? '#16A34A' : '#9CA3AF' }]}>{isOnline ? tx9('auto.profile.online', 'Online') : tx9('auto.profile.offline', 'Offline')}</Text>
                </View>
                {/* ID-Verified badge is now tied to user.identityVerifiedAt.
                    Previously hardcoded to always show, which was misleading.
                    Driver KYC status is separate (driver.status = approved)
                    and would need its own badge if we want to expose it. */}
                {(user as any)?.identityVerifiedAt && (
                  <View style={[styles.approvedBadge, { backgroundColor: '#22C55E18' }]}>
                    <Ionicons name="shield-checkmark" size={11} color="#22C55E" />
                    <Text style={[styles.approvedText, { color: '#22C55E' }]}>{tx('auto.profile.idVerified', 'ID Verified')}</Text>
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
                <Text style={[styles.photoPromptTitle, { color: theme.text }]}>{tx('auto.profile.addYourPhoto', 'Add your photo')}</Text>
                <Text style={[styles.photoPromptBody, { color: theme.textSecond }]}>
                  {tr('auto.profile.customersCheckYourFaceBefore', 'Customers check your face before handing over a package. A clear photo gets you accepted faster.')}
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
                <Text style={[styles.seirsIdLabel, { color: theme.textSecond }]}>{tr('auto.profile.seirsIdTapForQr', 'SEIRS ID · tap for QR')}</Text>
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
              { label: tr('auto.profile.totalTrips', 'Total Trips'),  value: totalTrips.toLocaleString(), route: '/(driver)/history' },
              { label: tr('auto.index.rating', 'Rating'),       value: ratingCount > 0 ? rating.toFixed(1) : '-', route: '/(driver)/ratings' },
              { label: tr('auto.profile.totalEarned', 'Total Earned'), value: nairaShort(allTime), route: '/(driver)/earnings' },
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
            <Text style={[styles.balLabel, { color: theme.textSecond }]}>{tx('auto.profile.withdrawableBalance', 'Withdrawable Balance')}</Text>
            <Text style={[styles.balAmount, { color: theme.text }]}>{naira(available)}</Text>
          </View>
          <View style={[styles.withdrawQuick, { backgroundColor: theme.primary }]}>
            <Ionicons name="arrow-up-circle-outline" size={16} color="#fff" />
            <Text style={styles.withdrawQuickText}>{tx('auto.profile.withdraw', 'Withdraw')}</Text>
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
                  {/* Plain muted glyph, no tinted tile. Customer and driver
                      wrapped every row icon in a 38pt surfaceSecond square and
                      drew it in theme.primary, so a dark-mode profile was a
                      column of blue badges down the left edge. Business draws
                      the glyph on its own in textSecond, and business is the
                      restraint reference (founder 2026-09-01). Danger rows keep
                      their colour, because there the colour carries meaning. */}
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={item.danger ? theme.error : theme.textSecond}
                    style={styles.menuIcon}
                  />
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

        <Text style={[styles.version, { color: theme.textThird }]}>{tx('auto.profile.seirsDriverV100', 'Seirs Driver v1.0.0')}</Text>

        <Pressable
          style={[styles.logoutBtn, { backgroundColor: theme.error + '12', borderColor: theme.error + '30' }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.error} />
          <Text style={[styles.logoutText, { color: theme.error }]}>{tx('auto.profile.signOut', 'Sign Out')}</Text>
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
            <Text style={{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: theme.text }}>{tx('auto.profile.yourSeirsId', 'Your SEIRS ID')}</Text>
            <Text style={{ fontSize: FontSize.xs, color: theme.textSecond, textAlign: 'center' }}>
              {tr('auto.profile.showThisToACustomer', 'Show this to a customer at handoff to prove you are the assigned driver.')}
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
                <Text style={{ color: theme.text, fontWeight: FontWeight.semibold, fontSize: FontSize.sm }}>{tr('auto.profile.copy', 'Copy')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowQrModal(false)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.primary, borderRadius: Radius.lg, paddingVertical: 12 }}
              >
                <Text style={{ color: '#fff', fontWeight: FontWeight.bold, fontSize: FontSize.sm }}>{tr('auto.profile.done', 'Done')}</Text>
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
  menuIcon:      { width: 24, textAlign: 'center' },
  menuLabel:     { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  menuSub:       { fontSize: FontSize.xs, marginTop: 1 },
  menuBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  menuBadgeText: { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },

  version:    { textAlign: 'center', fontSize: FontSize.xs, marginTop: Spacing.md, marginBottom: Spacing.sm },
  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, height: 52, borderRadius: Radius.xl, borderWidth: 1 },
  logoutText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
