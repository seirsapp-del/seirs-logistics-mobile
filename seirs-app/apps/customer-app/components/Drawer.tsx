import { Linking } from 'react-native';
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
 * Customer-app drawer adapter — wires the shared headless Drawer to
 * customer-specific menu items per Master Spec V7 §1.5.
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

  const items: DrawerItem[] = [
    { icon: 'User',       label: t('drawer.profile',       { defaultValue: 'Profile' }),         onPress: () => navigate('/(customer)/profile') },
    { icon: 'CreditCard', label: t('drawer.paymentMethods',{ defaultValue: 'Payment Methods' }), onPress: () => navigate('/(customer)/payment-methods') },
    // Point at the rewritten /rewards catalogue with real API + correct
    // thresholds. The old /loyalty screen had hardcoded values and misleading
    // numbers; keeping the drawer aimed there was the biggest UX bug on the
    // menu. loyalty.tsx now redirects to /rewards so any stale link resolves.
    { icon: 'Gift',       label: t('drawer.rewards',       { defaultValue: 'Rewards & Points' }),onPress: () => navigate('/(customer)/rewards') },
    { icon: 'QrCode',     label: t('drawer.seirsId',       { defaultValue: 'My SEIRS ID' }),     onPress: () => navigate('/(customer)/seirs-id') },
    { icon: 'Users',      label: t('drawer.poolPrefs',     { defaultValue: 'Ride Pool Preferences' }), onPress: () => navigate('/(customer)/pool-preferences') },
    // Label honesty: this only opens the notification settings screen, not
    // a full settings hub. Renamed so users don't tap expecting language +
    // privacy + theme in one place.
    { icon: 'Bell',       label: t('drawer.notificationSettings', { defaultValue: 'Notification Settings' }), onPress: () => navigate('/(customer)/notification-settings') },
    { icon: 'Globe',      label: t('drawer.language',      { defaultValue: 'Language' }),        onPress: () => navigate('/(customer)/language') },
    { icon: 'HelpCircle', label: t('drawer.help',          { defaultValue: 'Help & FAQ' }),      onPress: () => navigate('/(customer)/help') },
    { icon: 'Lock',       label: t('drawer.privacy',       { defaultValue: 'Privacy Policy' }),  onPress: () => navigate('/(customer)/privacy') },
    { icon: 'Send',       label: t('drawer.sendMultiple',  { defaultValue: 'Send Multiple' }),   onPress: () => navigate('/(customer)/business') },
    // Chat 5: in-app support chat replaces the old tel: link. Users can
    // still see the support hotline inside the ticket flow if they prefer
    // to call.
    { icon: 'MessageCircle', label: t('drawer.contactSupport', { defaultValue: 'Contact Support' }),
      onPress: () => navigate('/(customer)/support') },
  ];

  return (
    <SharedDrawer
      visible={visible}
      onClose={onClose}
      user={{
        name:   user?.name ?? 'Guest',
        email:  user?.email ?? '',
        avatar: <Avatar name={user?.name ?? 'User'} uri={user?.profilePhoto} size={56} />,
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
