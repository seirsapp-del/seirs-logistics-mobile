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

  const items: DrawerItem[] = [
    { icon: 'User',       label: t('drawer.profile',       { defaultValue: 'Profile' }),               onPress: () => navigate('/(driver)/profile') },
    { icon: 'TrendingUp', label: t('drawer.earnings',      { defaultValue: 'Earnings' }),              onPress: () => navigate('/(driver)/earnings') },
    { icon: 'Wallet',     label: t('drawer.payouts',       { defaultValue: 'Live Earnings & Payout' }), onPress: () => navigate('/(driver)/live-earnings') },
    { icon: 'Star',       label: t('drawer.ratings',       { defaultValue: 'Ratings' }),               onPress: () => navigate('/(driver)/ratings') },
    { icon: 'Calendar',   label: t('drawer.schedule',      { defaultValue: 'Schedule' }),              onPress: () => navigate('/(driver)/schedule') },
    { icon: 'Bell',       label: t('drawer.notifications', { defaultValue: 'Notifications' }),         onPress: () => navigate('/(driver)/notification-settings') },
    { icon: 'Globe',      label: t('drawer.language',      { defaultValue: 'Language' }),              onPress: () => navigate('/(driver)/language') },
    { icon: 'BookOpen',   label: t('drawer.codeOfConduct', { defaultValue: 'Driver Code of Conduct' }), onPress: () => navigate('/(driver)/privacy') },
    { icon: 'Shield',     label: t('drawer.insurance',     { defaultValue: 'Insurance Partners' }),    onPress: () => navigate('/(driver)/help') },
    { icon: 'HelpCircle', label: t('drawer.help',          { defaultValue: 'Help & FAQ' }),            onPress: () => navigate('/(driver)/help') },
    { icon: 'Lock',       label: t('drawer.privacy',       { defaultValue: 'Privacy Policy' }),        onPress: () => navigate('/(driver)/privacy') },
    { icon: 'Phone',      label: t('drawer.contact',       { defaultValue: 'Contact Support' }),       onPress: () => navigate('/(driver)/help') },
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
