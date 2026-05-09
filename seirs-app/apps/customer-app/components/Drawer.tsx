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
    { icon: 'Settings',   label: t('drawer.settings',      { defaultValue: 'Settings' }),        onPress: () => navigate('/(customer)/notification-settings') },
    { icon: 'Bell',       label: t('drawer.notifications', { defaultValue: 'Notifications' }),   onPress: () => navigate('/notifications') },
    { icon: 'Globe',      label: t('drawer.language',      { defaultValue: 'Language' }),        onPress: () => navigate('/(customer)/language') },
    { icon: 'HelpCircle', label: t('drawer.help',          { defaultValue: 'Help & FAQ' }),      onPress: () => navigate('/(customer)/help') },
    { icon: 'Lock',       label: t('drawer.privacy',       { defaultValue: 'Privacy Policy' }),  onPress: () => navigate('/(customer)/privacy') },
    { icon: 'Briefcase',  label: t('drawer.business',      { defaultValue: 'Business Account' }), onPress: () => navigate('/(customer)/business') },
    { icon: 'Phone',      label: t('drawer.contact',       { defaultValue: 'Contact Support' }),
      onPress: () => {
        onClose();
        setTimeout(() => Linking.openURL('tel:07007347701').catch(() => router.push('/(customer)/help' as any)), 220);
      } },
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
      Icon={Icon}
    />
  );
}
