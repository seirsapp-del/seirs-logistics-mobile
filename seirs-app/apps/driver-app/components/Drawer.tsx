import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Drawer as SharedDrawer, type DrawerItem } from '@seirs/shared/components/Drawer';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Colors } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Driver-app drawer adapter — wires the shared headless Drawer to
 * driver-specific menu items per Master Spec V7 §2.2.
 */
export function Drawer({ visible, onClose }: Props) {
  const router  = useRouter();
  const { t }   = useTranslation();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const c = Colors[isDark ? 'dark' : 'light'];

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

  // "Earnings" is deliberately NOT here: it is already a bottom tab, and
  // a second entry point for the same screen reads as a duplicate.
  const items: DrawerItem[] = [
    { icon: 'User',       label: t('drawer.profile',       { defaultValue: 'Profile' }),               onPress: () => navigate('/(driver)/profile') },
    { icon: 'Wallet',     label: t('drawer.payouts',       { defaultValue: 'Withdraw Earnings' }),     onPress: () => navigate('/(driver)/withdrawal') },
    { icon: 'QrCode',     label: t('drawer.seirsId',       { defaultValue: 'My SEIRS ID' }),           onPress: () => navigate('/(driver)/seirs-id') },
    { icon: 'Map',        label: t('drawer.interstate',    { defaultValue: 'Interstate Trip' }),       onPress: () => navigate('/(driver)/interstate') },
    { icon: 'Moon',       label: t('drawer.lastOrder',     { defaultValue: 'Wind Down (Last Order)' }),onPress: () => navigate('/(driver)/last-order') },
    { icon: 'Star',       label: t('drawer.ratings',       { defaultValue: 'Ratings' }),               onPress: () => navigate('/(driver)/ratings') },
    // General documents hub (founder direction 2026-08-09): earnings
    // statements + any official doc admin sends (contracts, letters).
    { icon: 'FileText',   label: t('drawer.documents',     { defaultValue: 'Documents' }),             onPress: () => navigate('/(driver)/tax-docs') },
    { icon: 'Calendar',   label: t('drawer.schedule',      { defaultValue: 'Schedule' }),              onPress: () => navigate('/(driver)/schedule') },
    { icon: 'Bell',       label: t('drawer.notifications', { defaultValue: 'Notifications' }),         onPress: () => navigate('/(driver)/notification-settings') },
    { icon: 'Globe',      label: t('drawer.language',      { defaultValue: 'Language' }),              onPress: () => navigate('/(driver)/language') },
    { icon: 'BookOpen',   label: t('drawer.codeOfConduct', { defaultValue: 'Driver Code of Conduct' }), onPress: () => navigate('/(driver)/code-of-conduct') },
    // The partner-insurer list lives on the KYC screen (collapsible
    // "Need vehicle insurance?" section), not in Help & FAQ.
    { icon: 'Shield',     label: t('drawer.insurance',     { defaultValue: 'Insurance Partners' }),    onPress: () => navigate('/(driver)/kyc') },
    { icon: 'HelpCircle', label: t('drawer.help',          { defaultValue: 'Help & FAQ' }),            onPress: () => navigate('/(driver)/help') },
    { icon: 'Lock',       label: t('drawer.privacy',       { defaultValue: 'Privacy Policy' }),        onPress: () => navigate('/(driver)/privacy') },
    // Chat 5: in-app support inbox. Replaces the old shortcut to /help
    // so drivers can escalate a stuck delivery to a support agent
    // without leaving the app or calling.
    { icon: 'MessageCircle', label: t('drawer.contactSupport', { defaultValue: 'Contact Support' }),   onPress: () => navigate('/(driver)/support') },
    { icon: 'AlertTriangle', label: t('drawer.sos',         { defaultValue: 'SOS Emergency' }),         onPress: () => navigate('/(driver)/sos') },
  ];

  return (
    <SharedDrawer
      visible={visible}
      onClose={onClose}
      user={{
        name:   user?.name ?? 'Driver',
        email:  user?.email ?? '',
        avatar: <Avatar name={user?.name ?? 'Driver'} uri={user?.profilePhoto} size={56} />,
      }}
      items={items}
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
      Icon={Icon as any}
    />
  );
}
