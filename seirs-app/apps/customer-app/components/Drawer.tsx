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
    /*
     * "Send Multiple" is GONE (founder 2026-09-05). It pointed at
     * /(customer)/send, which is the same screen the home card already
     * opens, so the drawer's job was to offer a second door to a room you
     * were already standing in. Its history is worth keeping though: it
     * used to point at /(customer)/business, a route that never existed,
     * so one of six drawer rows was a 404 until 2026-08-23.
     *
     * Ride Pool Preferences went in that same sweep: the screen wrote to
     * AsyncStorage nothing reads and promised a pool discount no pricing
     * path can produce. The file stays for when pooling ships.
     */
    // Straight to a NEW ticket (founder 2026-08-10: the old path bounced
    // through the Messages tab first).
    /*
     * WIDENED AGAIN 2026-09-05, and this reverses the trim above rather
     * than ignoring it. The founder, comparing the three drawers: the
     * customer's had 5 rows against the driver's 9 and the business's 20,
     * so a customer had to hunt through the app for things the other two
     * reach in one tap.
     *
     * The 10 August principle is kept, because it was the right one:
     * account management (addresses, cards, password, delete account)
     * stays in Profile. Everything added below is a TOOL, something you
     * go to the drawer to DO.
     *
     * Get a quote is the most important of them. The special-request lane
     * exists now, and until this row it was reachable only from a failed
     * price inside Send: a feature you could only find if you already knew
     * it was there.
     */
    { icon: 'Gift',       label: t('drawer.rewards', { defaultValue: 'Rewards' }),
      onPress: () => navigate('/(customer)/rewards'),
      section: t('drawer.sectionYou', { defaultValue: 'You' }) },
    { icon: 'Share2',     label: t('drawer.referral', { defaultValue: 'Invite a friend' }),
      onPress: () => navigate('/(customer)/referral'),
      section: t('drawer.sectionYou', { defaultValue: 'You' }) },

    /*
     * Rows sharing a section must sit together: the shared drawer prints a
     * header every time the section changes, and on 6 September the screen
     * read YOU, SEND & TRAVEL, YOU, SEND & TRAVEL because Travel Buddy was
     * parked between two You rows.
     */
    { icon: 'Map',        label: t('drawer.travelBuddy',   { defaultValue: 'Travel Buddy (intercity)' }), onPress: () => navigate('/(customer)/travel-buddy'),
      section: t('drawer.sectionSend', { defaultValue: 'Send & travel' }) },
    { icon: 'Truck',      label: t('drawer.specialRequest', { defaultValue: 'Special delivery' }),
      onPress: () => navigate('/(customer)/special-request'),
      section: t('drawer.sectionSend', { defaultValue: 'Send & travel' }) },
    /*
     * NOT "Track by code". The Bookings tab already tracks bookings, and
     * puts them at the top (founder 2026-09-05). A drawer row for the
     * same thing is a second door to a room the tab bar already opens,
     * which is exactly what "Send Multiple" was.
     */
    { icon: 'Package',    label: t('drawer.parcelRequests', { defaultValue: 'Trip requests' }),
      onPress: () => navigate('/(customer)/parcel-requests'),
      section: t('drawer.sectionSend', { defaultValue: 'Send & travel' }) },
    /*
     * NOT drop-at-store. It looks like a destination and is actually a
     * STEP of the send flow (founder 2026-09-05, immediately). Opening it
     * from the drawer drops somebody into the middle of a booking that
     * does not exist, with no package to drop and no pickup filled in.
     * A row that leads somewhere unusable is worse than no row.
     */

    { icon: 'FileText',   label: t('drawer.documents', { defaultValue: 'Documents' }),
      onPress: () => navigate('/(customer)/documents'),
      section: t('drawer.sectionHelp', { defaultValue: 'Help' }) },
    { icon: 'Globe',      label: t('drawer.language', { defaultValue: 'Language' }),
      onPress: () => navigate('/(customer)/language'),
      section: t('drawer.sectionHelp', { defaultValue: 'Help' }) },
    { icon: 'HelpCircle', label: t('drawer.help', { defaultValue: 'Help & FAQ' }),
      onPress: () => navigate('/(customer)/help'),
      section: t('drawer.sectionHelp', { defaultValue: 'Help' }) },
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
