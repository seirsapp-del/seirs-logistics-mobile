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
 * Customer-app drawer adapter: wires the shared headless Drawer to
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

  // Founder decision 2026-08-10 (mirrors the driver app): the drawer is
  // the quick-tools menu; account management lives in the Profile tab.
  // 11 items trimmed to 5, plus SOS added for safety parity with the
  // driver app (never more than one tap away).
  const items: DrawerItem[] = [
    { icon: 'QrCode',     label: t('drawer.seirsId',       { defaultValue: 'My SEIRS ID' }),     onPress: () => navigate('/(customer)/seirs-id') },
    { icon: 'Users',      label: t('drawer.poolPrefs',     { defaultValue: 'Ride Pool Preferences' }), onPress: () => navigate('/(customer)/pool-preferences') },
    { icon: 'Send',       label: t('drawer.sendMultiple',  { defaultValue: 'Send Multiple' }),   onPress: () => navigate('/(customer)/business') },
    // Straight to a NEW ticket (founder 2026-08-10: the old path bounced
    // through the Messages tab first).
    { icon: 'MessageCircle', label: t('drawer.contactSupport', { defaultValue: 'Contact Support' }),
      onPress: () => navigate('/(customer)/support/new') },
    { icon: 'AlertTriangle', label: t('drawer.sos', { defaultValue: 'SOS Emergency' }),
      onPress: () => navigate('/(customer)/sos') },
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
