import { View, Text, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Drawer as SharedDrawer, type DrawerItem } from '@seirs/shared/components/Drawer';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Palette } from '@/constants/theme';

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
    { icon: 'Users',           label: t('drawer.teamMembers',     { defaultValue: 'Team Members' }),     onPress: () => navigate('/(business)/team') },
    { icon: 'Banknote',        label: t('drawer.billing',         { defaultValue: 'Billing & Invoices' }), onPress: () => navigate('/(business)/wallet') },
    // Gap 6 (2026-08-09): bulk drop at a partner counter instead of
    // per-package door pickups. Each package gets its own QR.
    { icon: 'Store',           label: t('drawer.dropAtStore',     { defaultValue: 'Drop at Partner Store' }), onPress: () => navigate('/(business)/drop-at-store') },
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
    { icon: 'HelpCircle',      label: t('drawer.help',            { defaultValue: 'Help & FAQ' }),      onPress: () => { onClose(); Linking.openURL('https://seirs-website.vercel.app/faq'); } },
    { icon: 'Lock',            label: t('drawer.privacy',         { defaultValue: 'Privacy Policy' }),  onPress: () => { onClose(); Linking.openURL('https://seirs-website.vercel.app/privacy-policy'); } },
    // Straight to a NEW ticket (founder 2026-08-10: the old path
    // bounced through the Messages tab first).
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
    { icon: 'HelpCircle', label: t('drawer.help',           { defaultValue: 'Help & FAQ' }),     onPress: () => { onClose(); Linking.openURL('https://seirs-website.vercel.app/faq'); } },
    { icon: 'Lock',       label: t('drawer.privacy',        { defaultValue: 'Privacy Policy' }), onPress: () => { onClose(); Linking.openURL('https://seirs-website.vercel.app/privacy-policy'); } },
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
