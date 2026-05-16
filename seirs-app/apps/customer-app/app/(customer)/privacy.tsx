import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Switch, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { usersApi } from '@/services/api';

// Subset of notification-prefs keys we treat as "data & analytics consent"
// so privacy + notifications stay in sync (a user who flips marketing off
// in either screen sees it off in both).
const PRIVACY_PREF_KEYS = ['analytics_share', 'personalised_ads', 'data_sharing'] as const;

export default function PrivacyScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [locationAlways,  setLocationAlways]  = useState(false);
  const [locationInUse,   setLocationInUse]   = useState(true);
  const [analyticsShare,  setAnalyticsShare]  = useState(true);
  const [personalisedAds, setPersonalisedAds] = useState(false);
  const [dataSharing,     setDataSharing]     = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load remote prefs on mount so privacy + notif screens stay in sync.
  useEffect(() => {
    (async () => {
      try {
        const { prefs } = await usersApi.getNotificationPrefs();
        if (prefs?.analytics_share !== undefined)  setAnalyticsShare(prefs.analytics_share);
        if (prefs?.personalised_ads !== undefined) setPersonalisedAds(prefs.personalised_ads);
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

  const onToggleAnalytics = (v: boolean) => { setAnalyticsShare(v);  queueSave({ analytics_share:  v }); };
  const onTogglePersonalised = (v: boolean) => { setPersonalisedAds(v); queueSave({ personalised_ads: v }); };
  const onToggleDataSharing = (v: boolean) => { setDataSharing(v);   queueSave({ data_sharing:     v }); };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, trip history, and wallet balance. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue', style: 'destructive',
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
      Alert.alert('Export failed', 'Please try again later or contact support@seirs.co');
    }
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
        <Text style={[styles.title, { color: theme.text }]}>Privacy & Data</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Location */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>Location Access</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          <ToggleRow
            icon="location"
            label="Always Allow"
            sub="Location tracked even when app is closed"
            value={locationAlways}
            onChange={setLocationAlways}
          />
          <ToggleRow
            icon="locate-outline"
            label="While Using App"
            sub="Location used only when app is open"
            value={locationInUse}
            onChange={setLocationInUse}
          />
        </View>

        {/* Data sharing */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>Data & Analytics</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          <ToggleRow
            icon="analytics-outline"
            label="Usage Analytics"
            sub="Help improve the app by sharing usage data"
            value={analyticsShare}
            onChange={onToggleAnalytics}
          />
          <ToggleRow
            icon="megaphone-outline"
            label="Personalised Ads"
            sub="Ads tailored to your interests"
            value={personalisedAds}
            onChange={onTogglePersonalised}
          />
          <ToggleRow
            icon="share-outline"
            label="Data Sharing with Partners"
            sub="Share anonymised trip data for traffic insights"
            value={dataSharing}
            onChange={onToggleDataSharing}
          />
        </View>

        {/* Data actions */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>Your Data</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          {[
            { icon: 'download-outline',   label: 'Download My Data',      sub: 'NDPR Article 24 — export profile, trips, payments', color: theme.primary, onPress: handleDataDownload },
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
            { label: 'Dispute Resolution', url: 'https://seirs.app/dispute-resolution' },
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
  rowSub:  { fontSize: FontSize.xs, marginTop: 2 },
  linkLabel:{ flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.medium },

  deleteBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, height: 52, borderRadius: Radius.xl, borderWidth: 1.5 },
  deleteBtnText: { color: '#EF4444', fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
