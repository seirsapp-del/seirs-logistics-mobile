import { View, Text, StyleSheet, Linking } from 'react-native';
import Constants from 'expo-constants';
import { useRouter, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Drawer as SharedDrawer, type DrawerItem } from '@seirs/shared/components/Drawer';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Palette } from '@/constants/theme';
import { FAQ_URL } from '@/constants/config';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Business-app drawer adapter: wires the shared headless Drawer to the
 * sender and partner-store menus.
 *
 * Rebuilt 2026-09-06 on the customer drawer's rule, which the founder
 * pointed at as the one that "did it well": the drawer is the quick-tools
 * menu, and every row is something you open the drawer to DO. Account
 * management (edit details, privacy, terms, delete) lives in the Profile
 * tab and is not repeated here. Rows are grouped under a heading the
 * shared drawer prints once per run, so rows sharing a section sit
 * together.
 *
 * What left, and why:
 * - "Business Profile" and "Partner Profile" opened the home tab you had
 *   just left. A door back into the room you are standing in.
 * - "Edit Business Details", "Privacy Policy" and "Apply to be a Partner
 *   Store" are all in Profile already, under Account, Legal and Partner
 *   network. Two copies of a row means two places to keep in step.
 * - "Notifications" had a bell in the top bar and an Alerts chip on the
 *   home screen; this was the third door.
 * - "Settings" in the partner list was a TAB.
 *
 * - "Drop at Partner Store", API Keys, API Usage and Webhook Log are gone
 *   with their screens (founder, same day): counter drop-off is a step of
 *   Send, and the developer platform is not something we can offer yet.
 *
 * What arrived: Rewards and Invite a business (both screens existed and
 * were reachable only from the Wallet tab), Special Cargo (the quote
 * lane, findable until now only from the home card), and for a hybrid
 * account a row that switches between sending and running the counter.
 *
 * The mode comes from the route group, not from the account. The old
 * `isPartner ? partnerItems : senderItems` meant an approved partner who
 * also sends ALWAYS got the partner list, even on the sender home, and
 * so lost Cargo Space, Trip Requests, Recurring and the developer rows
 * the moment their store was approved.
 */
export function Drawer({ visible, onClose }: Props) {
  const router   = useRouter();
  const segments = useSegments();
  const { t }    = useTranslation();
  const { user, logout, businessRole } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const c = Colors[isDark ? 'dark' : 'light'];

  // capabilities.canPartner is the truth source; businessRole is kept for
  // back-compat. canPartner flips true only after admin approves the
  // user's partner-store application.
  const canPartner  = !!user?.capabilities?.canPartner || businessRole === 'partner';
  const partnerMode = (segments as string[])[0] === '(partner)';

  const navigate = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as any), 220);
  };
  const switchTo = (path: string) => {
    onClose();
    setTimeout(() => router.replace(path as any), 220);
  };
  const openUrl = (url: string) => { onClose(); Linking.openURL(url); };

  const handleLogout = async () => {
    onClose();
    setTimeout(async () => {
      await logout();
      router.replace('/(auth)/onboarding');
    }, 220);
  };

  const sec = {
    you:     t('drawer.sectionYou',     { defaultValue: 'You' }),
    send:    t('drawer.sectionSend',    { defaultValue: 'Send & move' }),
    counter: t('drawer.sectionCounter', { defaultValue: 'Your counter' }),
    help:    t('drawer.sectionHelp',    { defaultValue: 'Help' }),
  };

  // Shared by both modes. SOS carries danger so it draws in red on a
  // plate, the way Profile already draws it; without the flag it was a
  // plain grey row weighted like everything else.
  const helpItems: DrawerItem[] = [
    { icon: 'FileText',      label: t('drawer.documents',      { defaultValue: 'Documents' }),
      onPress: () => navigate(partnerMode ? '/(partner)/documents' : '/(business)/documents'), section: sec.help },
    { icon: 'Globe',         label: t('drawer.language',       { defaultValue: 'Language' }),
      onPress: () => navigate(partnerMode ? '/(partner)/language' : '/(business)/language'), section: sec.help },
    // The canonical FAQ lives on the site; opening it beats a stub screen.
    { icon: 'HelpCircle',    label: t('drawer.help',           { defaultValue: 'Help & FAQ' }),
      onPress: () => openUrl(FAQ_URL), section: sec.help },
    // Straight to a NEW ticket (founder 2026-08-10: the old path bounced
    // through the Messages tab first).
    { icon: 'MessageCircle', label: t('drawer.contactSupport', { defaultValue: 'Contact Support' }),
      onPress: () => navigate('/(business)/support/new'), section: sec.help },
    { icon: 'AlertTriangle', label: t('drawer.sos',            { defaultValue: 'SOS Emergency' }),
      onPress: () => navigate('/(business)/sos'), danger: true, section: sec.help },
  ];

  const senderItems: DrawerItem[] = [
    { icon: 'QrCode',   label: t('drawer.seirsId',  { defaultValue: 'My SEIRS ID' }),
      onPress: () => navigate('/(business)/seirs-id'), section: sec.you },
    { icon: 'Gift',     label: t('drawer.rewards',  { defaultValue: 'Rewards' }),
      onPress: () => navigate('/(business)/rewards'), section: sec.you },
    { icon: 'Share2',   label: t('drawer.referral', { defaultValue: 'Invite a business' }),
      onPress: () => navigate('/(business)/referral'), section: sec.you },
    { icon: 'Banknote', label: t('drawer.billing',  { defaultValue: 'Billing & Invoices' }),
      onPress: () => navigate('/(business)/billing'), section: sec.you },
    // Only for an account that also runs an approved counter.
    ...(canPartner ? [{
      icon: 'Store' as const, label: t('drawer.switchToPartner', { defaultValue: 'Open my Partner Store' }),
      onPress: () => switchTo('/(partner)'), section: sec.you,
    }] : []),

    /* The quote-first lane: the same thing the customer app calls Special
       delivery. Loads a rate card must not price, so a person does. */
    { icon: 'Truck',        label: t('drawer.specialCargo',  { defaultValue: 'Special Cargo (get a quote)' }),
      onPress: () => navigate('/(business)/special-request'), section: sec.send },
    /* Cargo Space, NOT Travel Buddy. Same declared trips underneath,
       filtered to riders actually carrying freight. A trader moving
       100kg of yam should never be shown a car with two seats free, nor
       a product name that reads as lift-sharing. "Interstate" says what
       it is for (founder 2026-09-06). */
    { icon: 'Route',        label: t('drawer.cargoSpace',    { defaultValue: 'Cargo Space (interstate trips)' }),
      onPress: () => navigate('/(business)/cargo-space'), section: sec.send },
    /* Answers to the loads you asked drivers to carry. Nothing is charged
       while a request waits, so this is also where you withdraw one for
       free. */
    { icon: 'PackageCheck', label: t('drawer.tripRequests',  { defaultValue: 'Trip Requests' }),
      onPress: () => navigate('/(business)/trip-requests'), section: sec.send },
    { icon: 'Repeat',       label: t('drawer.recurring',     { defaultValue: 'Recurring Deliveries' }),
      onPress: () => navigate('/(business)/recurring'), section: sec.send },
    /*
     * No "Drop at Partner Store" row, and no screen behind it any more
     * (founder 2026-09-06): dropping at a counter is the second option on
     * Send's Pickup step, with nearby counters suggested by distance and
     * capacity. One Send flow people get used to, not a second door with
     * its own form.
     *
     * No Developers section either. API keys, usage and the webhook log
     * were rows to screens for a product we cannot offer yet; the screens
     * and the backend routes are deleted with them, not hidden.
     */

    ...helpItems,
  ];

  /*
   * Counter tools. Scanning in and releasing out are the Scan TAB, so
   * they are not repeated here; these are the things a shopkeeper goes
   * looking for less often and could not find.
   */
  const partnerItems: DrawerItem[] = [
    { icon: 'QrCode',     label: t('drawer.seirsId',       { defaultValue: 'My SEIRS ID' }),
      onPress: () => navigate('/(business)/seirs-id'), section: sec.you },
    { icon: 'FileText',   label: t('drawer.statement',     { defaultValue: 'Earnings statement' }),
      onPress: () => navigate('/(partner)/statement'), section: sec.you },
    { icon: 'Banknote',   label: t('drawer.payoutAccount', { defaultValue: 'Payout account' }),
      onPress: () => navigate('/(partner)/payout-account'), section: sec.you },
    { icon: 'Package',    label: t('drawer.switchToSender', { defaultValue: 'Send a package instead' }),
      onPress: () => switchTo('/(business)'), section: sec.you },

    { icon: 'Clock',      label: t('drawer.storage',       { defaultValue: 'Storage & overstays' }),
      onPress: () => navigate('/(partner)/storage'), section: sec.counter },
    { icon: 'Gauge',      label: t('drawer.capacity',      { defaultValue: 'Capacity' }),
      onPress: () => navigate('/(partner)/capacity'), section: sec.counter },
    { icon: 'Truck',      label: t('drawer.moveShop',      { defaultValue: 'Move the shop' }),
      onPress: () => navigate('/(partner)/move'), section: sec.counter },
    { icon: 'ShieldCheck', label: t('drawer.verification', { defaultValue: 'Verification documents' }),
      onPress: () => navigate('/(partner)/verification'), section: sec.counter },

    ...helpItems,
  ];

  const displayName = partnerMode ? (user?.storeName ?? 'Partner Store')
                                  : (user?.companyName ?? user?.name ?? 'Business');
  const initial = (displayName?.[0] ?? '?').toUpperCase();

  return (
    <SharedDrawer
      visible={visible}
      onClose={onClose}
      user={{
        name:  displayName,
        email: user?.email ?? '',
        avatar: (
          <View style={[styles.avatar, { backgroundColor: Palette.sky500 }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        ),
      }}
      items={partnerMode ? partnerItems : senderItems}
      themeToggle={{
        isDark,
        onToggle:   toggleTheme,
        darkLabel:  t('drawer.darkMode',  { defaultValue: 'Dark Mode' }),
        lightLabel: t('drawer.lightMode', { defaultValue: 'Light Mode' }),
      }}
      signOut={{
        label:   t('drawer.signOut', { defaultValue: 'Sign Out' }),
        onPress: handleLogout,
      }}
      /* Same footer as the customer drawer: the empty lower half gets
         something true to say. */
      footerNote={`SEIRS Business v${Constants.expoConfig?.version ?? '?'}`}
      theme={{
        surface:    c.surface,
        background: c.background,
        text:       c.text,
        textSecond: c.textSecond,
        textThird:  c.textThird,
        border:     c.border,
        accent:     c.accent,
        isDark,
      }}
      Icon={Icon}
    />
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: {
    color: '#fff', fontSize: 22, fontWeight: '700',
  },
});
