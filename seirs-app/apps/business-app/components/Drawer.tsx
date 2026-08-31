import { View, Text, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Drawer as SharedDrawer, type DrawerItem } from '@seirs/shared/components/Drawer';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Palette } from '@/constants/theme';
import { FAQ_URL, PRIVACY_URL } from '@/constants/config';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Business-app drawer adapter: wires the shared headless Drawer to
 * Business Sender / Partner Store-specific menu items per Master Spec V7
 * §4.2 (sender) and §4.3 (partner). Items differ by `businessRole`.
 */
export function Drawer({ visible, onClose }: Props) {
  const router  = useRouter();
  const { t }   = useTranslation();
  const { user, logout, businessRole } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const c = Colors[isDark ? 'dark' : 'light'];

  // Hybrid-account: a user can be Sender-only, Partner-only, or BOTH.
  // capabilities.canPartner is the new truth source; businessRole is kept
  // for back-compat. canPartner flips true only after admin approves the
  // user's partner-store application.
  const canPartner = !!user?.capabilities?.canPartner;
  const isPartner  = canPartner || businessRole === 'partner';

  const navigate = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as any), 220);
  };

  const handleLogout = async () => {
    onClose();
    setTimeout(async () => {
      await logout();
      router.replace('/(auth)/onboarding');
    }, 220);
  };

  const senderItems: DrawerItem[] = [
    { icon: 'LayoutDashboard', label: t('drawer.businessProfile', { defaultValue: 'Business Profile' }), onPress: () => navigate('/(business)') },
    // Audit 2026-08-10: the account-editing screen existed but nothing
    // navigated to it: business users had no way to fix their company
    // name, RC number, or contact details.
    { icon: 'Pencil',          label: t('drawer.editProfile',     { defaultValue: 'Edit Business Details' }), onPress: () => navigate('/(business)/edit-profile') },
    { icon: 'QrCode',          label: t('drawer.seirsId',         { defaultValue: 'My SEIRS ID' }),      onPress: () => navigate('/(business)/seirs-id') },
    // Team Members removed 2026-08-23 (B-1.1): it navigated to
    // /(business)/team, which has no file and is absent from the generated
    // router union, so it dead-ended on +not-found. Inventing a team screen
    // is a product decision (seats, roles, invites, who pays), so the row
    // stays out until that is specified rather than shipping a dead end.
    // Repointed 2026-08-23 (B-1.2): this opened /(business)/wallet, the
    // Rewards tab, not invoices. billing.tsx exists and the Profile tab
    // already routes to it; only the drawer copy of the row was missed when
    // the founder-reported Profile version was fixed.
    { icon: 'Banknote',        label: t('drawer.billing',         { defaultValue: 'Billing & Invoices' }), onPress: () => navigate('/(business)/billing') },
    // Gap 6 (2026-08-09): bulk drop at a partner counter instead of
    // per-package door pickups. Each package gets its own QR.
    { icon: 'Store',           label: t('drawer.dropAtStore',     { defaultValue: 'Drop at Partner Store' }), onPress: () => navigate('/(business)/drop-at-store') },
    /* Cargo Space, NOT Travel Buddy. Same declared trips underneath,
       filtered to riders actually carrying freight. A trader moving
       100kg of yam should never be shown a car with two seats free,
       nor a product name that reads as lift-sharing. */
    { icon: 'Truck',           label: t('drawer.cargoSpace',      { defaultValue: 'Cargo Space' }),          onPress: () => navigate('/(business)/cargo-space') },
    // B-8.1: recurring.tsx is a complete Spec V8 recurring-delivery
    // scheduler wired to a live backend cron, and nothing in the app
    // navigated to it. Same for the three developer screens below.
    { icon: 'Repeat',          label: t('drawer.recurring',       { defaultValue: 'Recurring Deliveries' }), onPress: () => navigate('/(business)/recurring') },
    { icon: 'Key',             label: t('drawer.apiKeys',         { defaultValue: 'API Keys' }),         onPress: () => navigate('/(business)/api-keys') },
    { icon: 'BarChart3',       label: t('drawer.apiUsage',        { defaultValue: 'API Usage' }),        onPress: () => navigate('/(business)/api-usage') },
    { icon: 'Activity',        label: t('drawer.webhookLog',      { defaultValue: 'Webhook Log' }),      onPress: () => navigate('/(business)/webhook-log') },
    // Hybrid-account: senders can apply to additionally operate as a Partner
    // Store. Hidden once approval lands (canPartner === true): the
    // context switcher at the top of the app takes over from there.
    ...(canPartner ? [] : [{
      icon:    'Store' as const,
      label:   t('drawer.applyPartner', { defaultValue: 'Apply to be a Partner Store' }),
      onPress: () => navigate('/(business)/apply-partner'),
    }]),
    { icon: 'Bell',            label: t('drawer.notifications',   { defaultValue: 'Notifications' }),    onPress: () => navigate('/(business)/notifications') },
    { icon: 'FileText',        label: t('drawer.documents',       { defaultValue: 'Documents' }),        onPress: () => navigate('/(business)/documents') },
    { icon: 'Globe',           label: t('drawer.language',        { defaultValue: 'Language' }),         onPress: () => navigate('/(business)/language') },
    // Canonical FAQ + legal copies live on the marketing site; open in
    // browser rather than shipping stub screens with no onPress (dead
    // buttons found in live testing 2026-08-09).
    { icon: 'HelpCircle',      label: t('drawer.help',            { defaultValue: 'Help & FAQ' }),      onPress: () => { onClose(); Linking.openURL(FAQ_URL); } },
    { icon: 'Lock',            label: t('drawer.privacy',         { defaultValue: 'Privacy Policy' }),  onPress: () => { onClose(); Linking.openURL(PRIVACY_URL); } },
    // Straight to a NEW ticket (founder 2026-08-10: the old path
    // bounced through the Messages tab first).
    { icon: 'AlertTriangle',   label: t('drawer.sos',             { defaultValue: 'SOS Emergency' }),   onPress: () => navigate('/(business)/sos') },
    { icon: 'MessageCircle',   label: t('drawer.contactSupport',  { defaultValue: 'Contact Support' }), onPress: () => navigate('/(business)/support/new') },
  ];

  const partnerItems: DrawerItem[] = [
    { icon: 'Store',      label: t('drawer.partnerProfile', { defaultValue: 'Partner Profile' }), onPress: () => navigate('/(partner)') },
    { icon: 'QrCode',     label: t('drawer.seirsId',        { defaultValue: 'My SEIRS ID' }),      onPress: () => navigate('/(business)/seirs-id') },
    { icon: 'Pencil',     label: t('drawer.editProfile',    { defaultValue: 'Edit Business Details' }), onPress: () => navigate('/(business)/edit-profile') },
    { icon: 'Bell',       label: t('drawer.notifications',  { defaultValue: 'Notifications' }),   onPress: () => navigate('/(business)/notifications') },
    { icon: 'FileText',   label: t('drawer.documents',      { defaultValue: 'Documents' }),       onPress: () => navigate('/(business)/documents') },
    { icon: 'Settings',   label: t('drawer.settings',       { defaultValue: 'Settings' }),        onPress: () => navigate('/(partner)/settings') },
    { icon: 'Globe',      label: t('drawer.language',       { defaultValue: 'Language' }),        onPress: () => navigate('/(partner)/language') },
    { icon: 'HelpCircle', label: t('drawer.help',           { defaultValue: 'Help & FAQ' }),     onPress: () => { onClose(); Linking.openURL(FAQ_URL); } },
    { icon: 'Lock',       label: t('drawer.privacy',        { defaultValue: 'Privacy Policy' }), onPress: () => { onClose(); Linking.openURL(PRIVACY_URL); } },
    // Added 2026-08-23 (B-8.2): partnerItems omitted the SOS row senderItems
    // has, so a shopkeeper alone at a counter, arguably the most exposed user
    // on the platform, had no panic control at all. sos.tsx states the founder
    // intent: anyone holding the SEIRS app who feels unsafe can press it.
    { icon: 'AlertTriangle', label: t('drawer.sos',            { defaultValue: 'SOS Emergency' }),   onPress: () => navigate('/(business)/sos') },
    { icon: 'MessageCircle', label: t('drawer.contactSupport', { defaultValue: 'Contact Support' }), onPress: () => navigate('/(business)/support/new') },
  ];

  const displayName = isPartner ? (user?.storeName ?? 'Partner Store')
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
      items={isPartner ? partnerItems : senderItems}
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
