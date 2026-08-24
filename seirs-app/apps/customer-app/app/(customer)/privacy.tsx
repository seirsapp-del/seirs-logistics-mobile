import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Switch, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { usersApi } from '@/services/api';

export default function PrivacyScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

  /**
   * The REAL OS permission, not a guess.
   *
   * These were two switches wired to nothing: no permission call, no
   * persistence, defaults hardcoded to false/true regardless of what the
   * device actually allowed. Turning off "location tracked even when the
   * app is closed" changed nothing at all, which is a privacy claim we
   * could not honour (device sweep 2026-08-19).
   *
   * Android does not let an app grant or revoke its own permissions, so
   * a switch was always the wrong control. We report what is actually
   * granted and hand the user to system settings to change it.
   */
  const [fgGranted, setFgGranted] = useState<boolean | null>(null);
  const [bgGranted, setBgGranted] = useState<boolean | null>(null);

  const readLocationPerms = useCallback(async () => {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      setFgGranted(fg.status === 'granted');
    } catch { setFgGranted(null); }
    try {
      const bg = await Location.getBackgroundPermissionsAsync();
      setBgGranted(bg.status === 'granted');
    } catch { setBgGranted(null); }
  }, []);

  useEffect(() => { readLocationPerms(); }, [readLocationPerms]);
  // Re-read on focus: the user may have just changed it in Settings.
  useFocusEffect(useCallback(() => { readLocationPerms(); }, [readLocationPerms]));
  const [analyticsShare,  setAnalyticsShare]  = useState(true);
  const [dataSharing,     setDataSharing]     = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load remote prefs on mount so privacy + notif screens stay in sync.
  useEffect(() => {
    (async () => {
      try {
        const { prefs } = await usersApi.getNotificationPrefs();
        if (prefs?.analytics_share !== undefined)  setAnalyticsShare(prefs.analytics_share);
        if (prefs?.data_sharing !== undefined)     setDataSharing(prefs.data_sharing);
      } catch {}
    })();
  }, []);

  const queueSave = (patch: Record<string, boolean>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      usersApi.updateNotificationPrefs(patch).catch(() => {});
    }, 400);
  };

  // personalisedAds was read from the server and had a handler, but no
  // ToggleRow ever rendered it, and SEIRS runs no ad product for it to
  // consent to. State, handler and the unused PRIVACY_PREF_KEYS list
  // removed rather than shipping a switch for a feature that does not
  // exist (sweep C-1.10).
  const onToggleAnalytics = (v: boolean) => { setAnalyticsShare(v);  queueSave({ analytics_share:  v }); };
  const onToggleDataSharing = (v: boolean) => { setDataSharing(v);   queueSave({ data_sharing:     v }); };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('deleteAccount.title'),
      t('deleteAccount.warning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.continue'), style: 'destructive',
          onPress: () => router.push('/(customer)/delete-account' as any),
        },
      ]
    );
  };

  const handleDataDownload = async () => {
    try {
      await usersApi.exportData();
      Alert.alert(
        'Export queued',
        'Your data is being prepared. You will receive an email with the download link within 24 hours.',
      );
    } catch {
      Alert.alert(t('deleteAccount.exportFailed'), 'support@seirs.co');
    }
  };

  /**
   * A permission we can only REPORT. Android will not let an app grant
   * its own permission, so this shows what the OS actually says and
   * sends the user to settings to change it, rather than a switch that
   * pretends to be in control.
   */
  const PermRow = ({ icon, label, sub, granted }: {
    icon: string; label: string; sub: string; granted: boolean | null;
  }) => {
    const on   = granted === true;
    const tint = granted === null ? theme.textThird : on ? theme.success : theme.textSecond;
    return (
      <View style={[styles.row, { borderBottomColor: theme.border }]}>
        <View style={[styles.rowIcon, { backgroundColor: on ? theme.primary + '15' : theme.surfaceSecond }]}>
          <Ionicons name={icon as any} size={18} color={on ? theme.primary : theme.textThird} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
          <Text style={[styles.rowSub, { color: theme.textSecond }]}>{sub}</Text>
        </View>
        <Text style={[styles.permState, { color: tint }]}>
          {granted === null ? 'Unknown' : on ? 'Allowed' : 'Not allowed'}
        </Text>
      </View>
    );
  };

  type RowProps = { icon: string; label: string; sub: string; value: boolean; onChange: (v: boolean) => void };
  const ToggleRow = ({ icon, label, sub, value, onChange }: RowProps) => (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: value ? theme.primary + '15' : theme.surfaceSecond }]}>
        <Ionicons name={icon as any} size={18} color={value ? theme.primary : theme.textThird} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: theme.textSecond }]}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.border, true: theme.primary + '80' }}
        thumbColor={value ? theme.primary : (isDark ? '#555' : '#ddd')}
      />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('settings.privacyTitle')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Location */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>{t('settings.locationAccess')}</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          <PermRow
            icon="locate-outline"
            label={t('settings.whileUsingApp')}
            sub={t('settings.whileUsingAppDesc')}
            granted={fgGranted}
          />
          <PermRow
            icon="location"
            label={t('settings.alwaysAllow')}
            sub={t('settings.alwaysAllowDesc')}
            granted={bgGranted}
          />
          <Pressable
            onPress={() => Linking.openSettings()}
            style={({ pressed }) => [styles.settingsBtn, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="options-outline" size={16} color={theme.primary} />
            <Text style={[styles.settingsBtnText, { color: theme.primary }]}>
              Change in system settings
            </Text>
          </Pressable>
        </View>

        {/* Data sharing */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>{t('settings.dataAnalytics')}</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          <ToggleRow
            icon="analytics-outline"
            label={t('settings.usageAnalytics')}
            sub={t('settings.usageAnalyticsDesc')}
            value={analyticsShare}
            onChange={onToggleAnalytics}
          />

          <ToggleRow
            icon="share-outline"
            label={t('settings.dataSharing')}
            sub={t('settings.dataSharingDesc')}
            value={dataSharing}
            onChange={onToggleDataSharing}
          />
        </View>

        {/* Data actions */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>Your Data</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          {[
            { icon: 'download-outline',   label: 'Download My Data',      sub: 'NDPR Article 24: export profile, trips, payments', color: theme.primary, onPress: handleDataDownload },
            { icon: 'document-text-outline', label: 'View Privacy Policy', sub: 'Read how we handle your data',                       color: theme.textSecond, onPress: () => Linking.openURL('https://seirs.app/privacy-policy') },
          ].map((item, i, arr) => (
            <Pressable
              key={item.label}
              style={[styles.row, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
              onPress={item.onPress}
            >
              <View style={[styles.rowIcon, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>{item.label}</Text>
                <Text style={[styles.rowSub, { color: theme.textSecond }]}>{item.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
            </Pressable>
          ))}
        </View>

        {/* Legal links */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>Legal</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          {[
            { label: 'Privacy Policy',    url: 'https://seirs.app/privacy-policy'    },
            { label: 'Terms of Service',  url: 'https://seirs.app/terms-of-service'  },
            // /dispute-resolution has never existed on the site: this row
            // 404'd. Disputes are covered in the Terms (2026-08-23).
            { label: 'Dispute Resolution', url: 'https://seirs.app/terms-of-service' },
          ].map((item, i, arr) => (
            <Pressable
              key={item.label}
              style={[styles.row, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
              onPress={() => Linking.openURL(item.url)}
            >
              <Ionicons name="document-text-outline" size={18} color={theme.textSecond} />
              <Text style={[styles.linkLabel, { color: theme.text }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
            </Pressable>
          ))}
        </View>

        {/* Danger zone */}
        <Pressable
          style={[styles.deleteBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
          onPress={handleDeleteAccount}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
          <Text style={styles.deleteBtnText}>Delete My Account</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: Spacing.xs },
  card:    { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  row:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  rowLabel:{ fontSize: FontSize.base, fontWeight: FontWeight.medium },
  permState:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any },
  settingsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderRadius: Radius.md,
    paddingVertical: Spacing.sm, marginTop: Spacing.sm, marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  settingsBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  rowSub:  { fontSize: FontSize.xs, marginTop: 2 },
  linkLabel:{ flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.medium },

  deleteBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 52, borderRadius: Radius.xl, borderWidth: 1.5 },
  deleteBtnText: { color: '#EF4444', fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
