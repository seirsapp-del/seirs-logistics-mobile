/**
 * Business · Profile tab (founder 2026-08-15): every SEIRS app ends its
 * tab bar with Profile, and business was the odd one out with identity
 * buried in the drawer. Same destinations as the drawer (which stays,
 * for reach-anywhere), presented as a screen in the app's restrained
 * business style: account card, SEIRS ID, grouped menu, sign out.
 */
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, Image, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useSeirsDialog } from '@/components/SeirsDialog';
import { Drawer } from '@/components/Drawer';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/context/AuthContext';
import { uploadApi, usersApi } from '@/services/api';
import { useColors, useTheme } from '@/context/ThemeContext';

const SITE = 'https://seirs-website.vercel.app';

export default function BusinessProfileTab() {
  // Themed dialogs, not the Android system AlertDialog (work order
  // item 4, 2026-08-24).
  const dialog = useSeirsDialog();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isDark, setTheme, useSystemTheme } = useTheme();
  const { t } = useTranslation();
  const { user, logout, refresh } = useAuth();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /**
   * Storefront photo (founder 2026-08-16): businesses put a face on the
   * account with a picture of their store front. Uploads to avatars/,
   * saves via the profile endpoint, then refresh() pulls the new URL
   * into the stored session.
   */
  const changePhoto = async () => {
    if (photoBusy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setPhotoBusy(true);
    try {
      const up = await uploadApi.file(result.assets[0].uri, 'image/jpeg', 'avatars');
      await usersApi.updateProfile({ profilePhoto: up.url });
      await refresh();
    } catch (e: any) {
      dialog.alert('Could not update photo', e?.message ?? 'Try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  // The login-time snapshot goes stale (partner approval, photo, company
  // edits). Refresh whenever the tab mounts so what you see is current.
  useEffect(() => { refresh(); }, []);

  const firstName = user?.name?.split(' ')[0] ?? '';
  const initial = (firstName || user?.companyName || '?').charAt(0).toUpperCase();
  const canPartner = !!(user as any)?.capabilities?.canPartner;

  const handleSignOut = async () => {
    await logout();
    router.replace('/(auth)/onboarding');
  };

  /* The business app had NO data export at all, while customer and driver
     both had one that fetched the bundle and threw it away. A business owner
     could not exercise their NDPR Article 24 right even in theory. Same
     endpoint as the other two: the export is filed into Documents. */
  const handleExportData = async () => {
    try {
      const r: any = await usersApi.requestExportToDocuments();
      dialog.alert(r?.ok ? 'Your data is ready' : 'Already prepared',
        r?.message ?? 'Open Documents to read or share it.');
    } catch {
      dialog.alert('Could not prepare it', 'Please try again later, or contact support.');
    }
  };

  const sections: Array<{ title: string; items: Array<{ icon: string; label: string; onPress: () => void; danger?: boolean }> }> = [
    {
      title: t('profile.account', { defaultValue: 'Account' }),
      items: [
        { icon: 'Pencil',   label: t('drawer.editProfile', { defaultValue: 'Edit Business Details' }), onPress: () => router.push('/(business)/edit-profile' as any) },
        { icon: 'Banknote', label: t('drawer.billing',     { defaultValue: 'Billing & Invoices' }),    onPress: () => router.push('/(business)/billing' as any) },
        { icon: 'FileText', label: t('drawer.documents',   { defaultValue: 'Documents' }),             onPress: () => router.push('/(business)/documents' as any) },
      ],
    },
    {
      title: t('profile.partner', { defaultValue: 'Partner network' }),
      items: [
        // Dropping at a counter is a booking decision, not an account
        // setting (founder 2026-08-16). It lives in Send a Package, where
        // the sender picks it per run and sees the counters near them.
        canPartner
          ? { icon: 'Store', label: t('drawer.partnerProfile', { defaultValue: 'Partner Profile' }), onPress: () => router.push('/(partner)' as any) }
          : { icon: 'Store', label: t('drawer.applyPartner', { defaultValue: 'Apply to be a Partner Store' }), onPress: () => router.push('/(business)/apply-partner' as any) },
      ],
    },
    {
      title: t('profile.preferences', { defaultValue: 'Preferences' }),
      items: [
        // No Notifications row here (founder 2026-08-16). The header bell
        // already opens the inbox, so this was a second door to the same
        // screen, and there is nothing to configure: everything about a
        // delivery, a payment or the account always sends.
        { icon: 'Globe', label: t('drawer.language',      { defaultValue: 'Language' }),      onPress: () => router.push('/(business)/language' as any) },
        /**
         * There was no way to change the theme at all. An older build had
         * a toggle, so an account could be pinned to light permanently
         * while the phone sat in dark mode, with nothing in the UI to
         * undo it (found 2026-08-17). This cycles Light, Dark and Follow
         * phone, and says which is active.
         */
        { icon: isDark ? 'Moon' : 'Sun',
          label: `Appearance: ${isDark ? 'Dark' : 'Light'}`,
          onPress: () => {
            /**
             * Four buttons again, and this time all four render.
             *
             * The history: this shipped with four, Android's AlertDialog
             * draws only the first THREE and silently discards the rest,
             * so Cancel was never drawn and the dialog could not be
             * dismissed from the screen at all (found 2026-08-24). The
             * stopgap that morning was to delete Cancel and live with
             * three. SeirsDialog is a real component rather than a call
             * into the OS, so it renders every button it is handed and
             * stacks them, and the constraint that forced the deletion is
             * gone. Cancel is back.
             */
            dialog.alert(
              'Appearance',
              `How should the app look? Currently ${isDark ? 'Dark' : 'Light'}.`,
              [
                { text: 'Follow my phone', onPress: () => { void useSystemTheme(); } },
                { text: 'Light',           onPress: () => setTheme('light') },
                { text: 'Dark',            onPress: () => setTheme('dark') },
                { text: 'Cancel',          style: 'cancel' },
              ],
              { cancelable: true },
            );
          } },
      ],
    },
    {
      /*
       * Support, reworked 2026-09-01 to one shape the three apps share.
       *
       * The three used to name the same thing three ways: "Help Center",
       * "Help & Support", "Help & FAQ", and driver folded the ticket row
       * into help while the other two kept it separate. One name now, in
       * the same order, everywhere.
       *
       * Help points at the website rather than an in-app screen. Founder's
       * call: the site is edited without shipping a release, and it teaches
       * people SEIRS has a site they can navigate on their own.
       */
      title: t('profile.support', { defaultValue: 'Support' }),
      items: [
        { icon: 'HelpCircle',    label: t('drawer.help',           { defaultValue: 'Help & FAQ' }),      onPress: () => Linking.openURL(`${SITE}/faq`) },
        { icon: 'MessageCircle', label: t('drawer.contactSupport', { defaultValue: 'Contact Support' }), onPress: () => router.push('/(business)/support/new' as any) },
        // Was reachable only from the drawer, so the account type most
        // likely to be moving valuable cargo had emergency help one layer
        // deeper than a customer sending a parcel (founder 2026-09-01).
        { icon: 'AlertTriangle', label: t('drawer.sos',            { defaultValue: 'SOS Emergency' }),   onPress: () => router.push('/(business)/sos' as any), danger: true },
      ],
    },
    {
      /*
       * Legal was scattered: customer linked Terms and not Privacy,
       * business linked Privacy and not Terms, driver linked neither.
       * Nobody offered both. Both, in every app, from now on.
       */
      title: t('profile.legal', { defaultValue: 'Legal' }),
      items: [
        { icon: 'FileText', label: t('drawer.terms',   { defaultValue: 'Terms of Service' }), onPress: () => Linking.openURL(`${SITE}/terms-of-service`) },
        { icon: 'Lock',     label: t('drawer.privacy', { defaultValue: 'Privacy Policy' }),   onPress: () => Linking.openURL(`${SITE}/privacy-policy`) },
      ],
    },
    {
      /*
       * Its own group, at the end, in red.
       *
       * Google Play requires in-app account deletion wherever an app
       * creates accounts, and the requirement is not merely that it exists
       * but that a person can find it. It was sitting in the middle of
       * Support between a privacy link and a help link, which is where you
       * put something you would rather nobody found.
       */
      title: t('profile.dangerZone', { defaultValue: 'Account actions' }),
      items: [
        { icon: 'Download', label: t('profile.exportData', { defaultValue: 'Download my data' }), onPress: () => handleExportData() },
        { icon: 'Trash2', label: t('drawer.deleteAccount', { defaultValue: 'Delete Account' }), onPress: () => router.push('/(business)/delete-account' as any), danger: true },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Drawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
      {/* Profile was the only one of the five business tabs with no way into
          the drawer, and the only Profile across the three apps without one:
          driver and customer both have it (founder 2026-09-01). The screen
          repeats the drawer's destinations, which is presumably why someone
          thought it redundant, but that is just as true in the other two
          apps, and it left the drawer unreachable from this tab. */}
      <View style={styles.titleRow}>
        <Pressable onPress={() => setDrawerOpen(true)} hitSlop={10}>
          <Icon name="AlignLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.screenTitle, { color: colors.text }]}>
          {t('profile.title', { defaultValue: 'Profile' })}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable onPress={changePhoto} disabled={photoBusy}>
          {user?.profilePhoto ? (
            <Image source={{ uri: user.profilePhoto }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <View style={[styles.cameraBadge, { backgroundColor: colors.accent }]}>
            <Icon name="Camera" size={11} color="#fff" />
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {user?.companyName ?? user?.name}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecond }]} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </View>

      {!!user?.accountId && (
        <Pressable
          style={[styles.idRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.push('/(business)/seirs-id' as any)}
        >
          {/* Stacked label over a monospaced ID with a QR glyph on the
              right, matching the driver app. It used to sit on one line with
              no icon, which read as plain text rather than something you can
              tap (founder 2026-09-01). The label also called seirsIdTap2,
              a key that does not exist, so it fell through to a dev
              placeholder while the real string, translated into all four
              languages, sat unused as seirsIdTap. */}
          <View style={{ flex: 1 }}>
            <Text style={[styles.idLabel, { color: colors.textSecond }]}>
              {t('profile.seirsIdTap', { defaultValue: 'SEIRS ID · TAP FOR QR' })}
            </Text>
            <Text style={[
              styles.idValue,
              { color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
            ]}>
              {user.accountId}
            </Text>
          </View>
          <Icon name="QrCode" size={18} color={colors.textThird} />
        </Pressable>
      )}

      {/* The SEIRS ID QR modal that used to sit here is gone (B-1.5):
          qrVisible was only ever set false, so nothing could open it. The
          ID row above pushes to /(business)/seirs-id, which is the live
          QR screen. */}

      {sections.map((section) => (
        <View key={section.title}>
          <Text style={[styles.sectionTitle, { color: colors.textSecond }]}>{section.title}</Text>
          <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {section.items.map((item, i) => (
              <Pressable
                key={item.label}
                style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                onPress={item.onPress}
              >
                <Icon name={item.icon as any} size={20} color={item.danger ? colors.error : colors.textSecond} />
                <Text style={[styles.rowLabel, { color: item.danger ? colors.error : colors.text }]}>{item.label}</Text>
                <Icon name="ChevronRight" size={18} color={colors.textThird ?? colors.textSecond} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Pressable style={[styles.signOut, { borderColor: colors.border }]} onPress={handleSignOut}>
        <Icon name="LogOut" size={18} color="#DC2626" />
        <Text style={styles.signOutText}>{t('drawer.signOut', { defaultValue: 'Sign Out' })}</Text>
      </Pressable>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, marginBottom: 16 },
  screenTitle:  { fontSize: 24, fontWeight: '700' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 20, padding: 16, borderRadius: 16, borderWidth: 1,
  },
  avatar:     { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  cameraBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 20, height: 20,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  name:       { fontSize: 17, fontWeight: '700' },
  sub:        { fontSize: 14, marginTop: 2 },
  idRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 10, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
  },
  idLabel:      { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  idValue:      { fontSize: 13, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 24, marginTop: 22, marginBottom: 8 },
  group:        { marginHorizontal: 20, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel:     { flex: 1, fontSize: 15, fontWeight: '500' },
  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 28, paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  signOutText: { color: '#DC2626', fontSize: 15, fontWeight: '600' },
});
