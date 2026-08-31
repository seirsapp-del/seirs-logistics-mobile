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
 * Driver-app drawer adapter: wires the shared headless Drawer to
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

  // Founder decision 2026-08-10: the drawer is the WORK TOOLS menu.
  // Account management (money, ratings, schedule, KYC, settings, help)
  // lives in exactly one place: the Profile tab. 16 items trimmed to 8;
  // each function has one clear home, except safety/handoff items that
  // are deliberately duplicated (SEIRS ID, SOS, Documents in Profile).
  const items: DrawerItem[] = [
    { icon: 'QrCode',     label: t('drawer.seirsId',       { defaultValue: 'My SEIRS ID' }),           onPress: () => navigate('/(driver)/seirs-id') },
    { icon: 'Map',        label: t('drawer.interstate',    { defaultValue: 'Interstate Trip' }),       onPress: () => navigate('/(driver)/interstate') },
    /* Parcel requests on your declared trips. A request charges the
       sender nothing until you accept, so a decline here costs them
       nothing and leaves no refund to chase. */
    { icon: 'Package',    label: t('drawer.parcelRequests',{ defaultValue: 'Parcel Requests' }),      onPress: () => navigate('/(driver)/parcel-requests') },
    { icon: 'Moon',       label: t('drawer.lastOrder',     { defaultValue: 'Wind Down (Last Order)' }),onPress: () => navigate('/(driver)/last-order') },
    { icon: 'FileText',   label: t('drawer.documents',     { defaultValue: 'Documents' }),             onPress: () => navigate('/(driver)/tax-docs') },
    { icon: 'Globe',      label: t('drawer.language',      { defaultValue: 'Language' }),              onPress: () => navigate('/(driver)/language') },
    { icon: 'BookOpen',   label: t('drawer.codeOfConduct', { defaultValue: 'Driver Code of Conduct' }), onPress: () => navigate('/(driver)/code-of-conduct') },
    // Straight to a NEW ticket: the founder found the old path (drawer
    // -> Messages tab -> tap Support -> new ticket) two hops too many.
    { icon: 'MessageCircle', label: t('drawer.contactSupport', { defaultValue: 'Contact Support' }),   onPress: () => navigate('/(driver)/support/new') },
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
