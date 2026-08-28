import { Linking } from 'react-native';
import Constants from 'expo-constants';
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
  // Identical derivation to the Profile tab, deliberately.
  const displayName = (user as any)?.firstName
    ?? (user?.name ? String(user.name).trim().split(/\s+/)[0] : '');

  const items: DrawerItem[] = [
    { icon: 'QrCode',     label: t('drawer.seirsId',       { defaultValue: 'My SEIRS ID' }),     onPress: () => navigate('/(customer)/seirs-id'),
      section: t('drawer.sectionYou', { defaultValue: 'You' }) },
    { icon: 'Map',        label: t('drawer.travelBuddy',   { defaultValue: 'Travel Buddy (intercity)' }), onPress: () => navigate('/(customer)/travel-buddy'),
      section: t('drawer.sectionSend', { defaultValue: 'Send & travel' }) },
    // Ride Pool Preferences pulled from the drawer on the 2026-08-23
    // sweep: the screen saved to AsyncStorage that no backend reads, and
    // promised "a pool discount applied automatically" that no pricing
    // path can produce. The screen file stays for when pooling ships.
    // Send Multiple pointed at /(customer)/business, which has never
    // existed: one of six drawer items was a 404. send.tsx IS the
    // multi-package flow (add-another-package), so it goes there.
    { icon: 'Send',       label: t('drawer.sendMultiple',  { defaultValue: 'Send Multiple' }),   onPress: () => navigate('/(customer)/send'),
      section: t('drawer.sectionSend', { defaultValue: 'Send & travel' }) },
    // Straight to a NEW ticket (founder 2026-08-10: the old path bounced
    // through the Messages tab first).
    { icon: 'MessageCircle', label: t('drawer.contactSupport', { defaultValue: 'Contact Support' }),
      onPress: () => navigate('/(customer)/support/new'),
      section: t('drawer.sectionHelp', { defaultValue: 'Help' }) },
    /*
     * danger: true was never set here, so SOS rendered as a plain grey
     * row with a thin outline icon, weighted exactly like "Send
     * Multiple". The Profile tab already draws it correctly, in red on a
     * light plate. The flag existed the whole time and simply was not
     * passed (2026-08-29).
     */
    { icon: 'AlertTriangle', label: t('drawer.sos', { defaultValue: 'SOS Emergency' }),
      onPress: () => navigate('/(customer)/sos'),
      danger: true,
      section: t('drawer.sectionHelp', { defaultValue: 'Help' }) },
  ];

  return (
    <SharedDrawer
      visible={visible}
      onClose={onClose}
      /*
       * The same name the Profile tab shows (2026-08-29).
       *
       * Avatar derives BOTH the initials and the background colour from
       * the name it is given. The drawer passed the full name and
       * Profile passes the first name, so the identical component drew
       * the identical user as an orange "FA" here and a blue "F" there.
       * One person, two faces, on two screens a tap apart.
       *
       * Deriving it the same way makes them agree, and keeps agreeing if
       * the rule ever changes.
       */
      user={{
        name:   displayName || 'Guest',
        email:  user?.email ?? '',
        avatar: <Avatar name={displayName || 'User'} uri={user?.profilePhoto} size={56} />,
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
      /* Matches the Profile tab's footer, and gives the empty lower half
         of the drawer something true to say. */
      footerNote={`SEIRS Logistics v${Constants.expoConfig?.version ?? '?'}`}
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
