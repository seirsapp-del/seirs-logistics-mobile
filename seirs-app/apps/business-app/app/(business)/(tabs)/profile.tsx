/**
 * Business · Profile tab (founder 2026-08-15): every SEIRS app ends its
 * tab bar with Profile, and business was the odd one out with identity
 * buried in the drawer. Same destinations as the drawer (which stays,
 * for reach-anywhere), presented as a screen in the app's restrained
 * business style: account card, SEIRS ID, grouped menu, sign out.
 */
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, Image } from 'react-native';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useSeirsDialog } from '@/components/SeirsDialog';
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

  const sections: Array<{ title: string; items: Array<{ icon: string; label: string; onPress: () => void }> }> = [
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
      title: t('profile.support', { defaultValue: 'Support' }),
      items: [
        { icon: 'MessageCircle', label: t('drawer.contactSupport', { defaultValue: 'Contact Support' }), onPress: () => router.push('/(business)/support/new' as any) },
        { icon: 'HelpCircle',    label: t('drawer.help',           { defaultValue: 'Help & FAQ' }),      onPress: () => Linking.openURL(`${SITE}/faq`) },
        { icon: 'Lock',          label: t('drawer.privacy',        { defaultValue: 'Privacy Policy' }),  onPress: () => Linking.openURL(`${SITE}/privacy-policy`) },
        // Google Play requires in-app account deletion wherever an app
        // creates accounts. Customer and driver have had it; business had
        // a register screen and no way out (store audit 2026-08-30).
        { icon: 'Trash2',        label: t('drawer.deleteAccount',  { defaultValue: 'Delete Account' }),  onPress: () => router.push('/(business)/delete-account' as any) },
      ],
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.screenTitle, { color: colors.text }]}>
        {t('profile.title', { defaultValue: 'Profile' })}
      </Text>

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
          <Text style={[styles.idLabel, { color: colors.textSecond }]}>
            {t('profile.seirsIdTap2', { defaultValue: 'SEIRS ID · WHAT IT DOES + QR' })}
          </Text>
          <Text style={[styles.idValue, { color: colors.text }]}>{user.accountId}</Text>
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
                <Icon name={item.icon as any} size={20} color={colors.textSecond} />
                <Text style={[styles.rowLabel, { color: colors.text }]}>{item.label}</Text>
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
  );
}

const styles = StyleSheet.create({
  screenTitle:  { fontSize: 24, fontWeight: '700', paddingHorizontal: 20, marginBottom: 16 },
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 20, marginTop: 10, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1,
  },
  idLabel:      { fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  idValue:      { fontSize: 15, fontWeight: '700', letterSpacing: 0.6 },
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
