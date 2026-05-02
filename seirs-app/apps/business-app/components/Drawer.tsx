import { View, Text, StyleSheet } from 'react-native';
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
 * Business-app drawer adapter — wires the shared headless Drawer to
 * Business Sender / Partner Store-specific menu items per Master Spec V7
 * §4.2 (sender) and §4.3 (partner). Items differ by `businessRole`.
 */
export function Drawer({ visible, onClose }: Props) {
  const router  = useRouter();
  const { t }   = useTranslation();
  const { user, logout, businessRole } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const c = Colors[isDark ? 'dark' : 'light'];

  const isPartner = businessRole === 'partner';

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
    { icon: 'Users',           label: t('drawer.teamMembers',     { defaultValue: 'Team Members' }),     onPress: () => navigate('/(business)/team') },
    { icon: 'Banknote',        label: t('drawer.billing',         { defaultValue: 'Billing & Invoices' }), onPress: () => navigate('/(business)/wallet') },
    { icon: 'Globe',           label: t('drawer.language',        { defaultValue: 'Language' }),         onPress: () => navigate('/(business)/language') },
    { icon: 'HelpCircle',      label: t('drawer.help',            { defaultValue: 'Help & FAQ' }) },
    { icon: 'Lock',            label: t('drawer.privacy',         { defaultValue: 'Privacy Policy' }) },
    { icon: 'Phone',           label: t('drawer.contact',         { defaultValue: 'Contact Support' }) },
  ];

  const partnerItems: DrawerItem[] = [
    { icon: 'Store',      label: t('drawer.partnerProfile', { defaultValue: 'Partner Profile' }), onPress: () => navigate('/(partner)') },
    { icon: 'Settings',   label: t('drawer.settings',       { defaultValue: 'Settings' }),        onPress: () => navigate('/(partner)/settings') },
    { icon: 'Globe',      label: t('drawer.language',       { defaultValue: 'Language' }),        onPress: () => navigate('/(partner)/language') },
    { icon: 'HelpCircle', label: t('drawer.help',           { defaultValue: 'Help & FAQ' }) },
    { icon: 'Lock',       label: t('drawer.privacy',        { defaultValue: 'Privacy Policy' }) },
    { icon: 'Phone',      label: t('drawer.contact',        { defaultValue: 'Contact Support' }) },
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
