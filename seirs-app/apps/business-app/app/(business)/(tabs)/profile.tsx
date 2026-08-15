/**
 * Business · Profile tab (founder 2026-08-15): every SEIRS app ends its
 * tab bar with Profile, and business was the odd one out with identity
 * buried in the drawer. Same destinations as the drawer (which stays,
 * for reach-anywhere), presented as a screen in the app's restrained
 * business style: account card, SEIRS ID, grouped menu, sign out.
 */
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/context/ThemeContext';

const SITE = 'https://seirs-website.vercel.app';

export default function BusinessProfileTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { t } = useTranslation();
  const { user, logout } = useAuth();

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
        { icon: 'Users',    label: t('drawer.teamMembers', { defaultValue: 'Team Members' }),          onPress: () => router.push('/(business)/team' as any) },
        { icon: 'Banknote', label: t('drawer.billing',     { defaultValue: 'Billing & Invoices' }),    onPress: () => router.push('/(business)/wallet' as any) },
        { icon: 'FileText', label: t('drawer.documents',   { defaultValue: 'Documents' }),             onPress: () => router.push('/(business)/documents' as any) },
      ],
    },
    {
      title: t('profile.partner', { defaultValue: 'Partner network' }),
      items: [
        { icon: 'Store', label: t('drawer.dropAtStore', { defaultValue: 'Drop at Partner Store' }), onPress: () => router.push('/(business)/drop-at-store' as any) },
        canPartner
          ? { icon: 'Store', label: t('drawer.partnerProfile', { defaultValue: 'Partner Profile' }), onPress: () => router.push('/(partner)' as any) }
          : { icon: 'Store', label: t('drawer.applyPartner', { defaultValue: 'Apply to be a Partner Store' }), onPress: () => router.push('/(business)/apply-partner' as any) },
      ],
    },
    {
      title: t('profile.preferences', { defaultValue: 'Preferences' }),
      items: [
        { icon: 'Bell',  label: t('drawer.notifications', { defaultValue: 'Notifications' }), onPress: () => router.push('/(business)/notifications' as any) },
        { icon: 'Globe', label: t('drawer.language',      { defaultValue: 'Language' }),      onPress: () => router.push('/(business)/language' as any) },
      ],
    },
    {
      title: t('profile.support', { defaultValue: 'Support' }),
      items: [
        { icon: 'MessageCircle', label: t('drawer.contactSupport', { defaultValue: 'Contact Support' }), onPress: () => router.push('/(business)/support/new' as any) },
        { icon: 'HelpCircle',    label: t('drawer.help',           { defaultValue: 'Help & FAQ' }),      onPress: () => Linking.openURL(`${SITE}/faq`) },
        { icon: 'Lock',          label: t('drawer.privacy',        { defaultValue: 'Privacy Policy' }),  onPress: () => Linking.openURL(`${SITE}/privacy-policy`) },
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
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
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
        <View style={[styles.idRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.idLabel, { color: colors.textSecond }]}>
            {t('profile.seirsId', { defaultValue: 'SEIRS ID' })}
          </Text>
          <Text style={[styles.idValue, { color: colors.text }]}>{user.accountId}</Text>
        </View>
      )}

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
  name:       { fontSize: 17, fontWeight: '700' },
  sub:        { fontSize: 13, marginTop: 2 },
  idRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 20, marginTop: 10, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1,
  },
  idLabel:      { fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  idValue:      { fontSize: 14, fontWeight: '700', letterSpacing: 0.6 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 24, marginTop: 22, marginBottom: 8 },
  group:        { marginHorizontal: 20, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel:     { flex: 1, fontSize: 15, fontWeight: '500' },
  signOut: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 28, paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  signOutText: { color: '#DC2626', fontSize: 15, fontWeight: '600' },
});
