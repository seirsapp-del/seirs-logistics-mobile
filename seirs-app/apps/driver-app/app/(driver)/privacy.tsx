import {
  View, Text, Pressable, StyleSheet, ScrollView, Switch, StatusBar, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { usersApi } from '@/services/api';

export default function DriverPrivacyScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  // These two switches used to write location_always / share_location to
  // the backend and nothing anywhere read them back, so a driver turning
  // background tracking off changed precisely nothing while the screen
  // implied it had. Android owns this decision, so show the real grant
  // state and send the driver to system settings to change it.
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
  // Re-read on focus: the driver may have just changed it in Settings.
  useFocusEffect(useCallback(() => { readLocationPerms(); }, [readLocationPerms]));

  const [analyticsData,     setAnalyticsData]     = useState(true);
  const [personalisedOffers,setPersonalisedOffers]= useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { prefs } = await usersApi.getNotificationPrefs();
        if (prefs?.analytics_share   !== undefined) setAnalyticsData(prefs.analytics_share);
        if (prefs?.personalised_ads  !== undefined) setPersonalisedOffers(prefs.personalised_ads);
      } catch {}
    })();
  }, []);

  const queueSave = (patch: Record<string, boolean>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      usersApi.updateNotificationPrefs(patch).catch(() => {});
    }, 400);
  };

  const onAnalyticsData     = (v: boolean) => { setAnalyticsData(v);     queueSave({ analytics_share:   v }); };
  const onPersonalisedOffers= (v: boolean) => { setPersonalisedOffers(v); queueSave({ personalised_ads: v }); };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your driver account, vehicle info, earnings history, and all personal data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue', style: 'destructive',
          onPress: () => router.push('/(driver)/delete-account' as any),
        },
      ],
    );
  };

  const handleDownloadData = async () => {
    try {
      await usersApi.exportData();
      Alert.alert('Export queued', 'Your data export has been requested. You will receive an email with the download link within 24 hours.');
    } catch {
      Alert.alert('Export failed', 'Please try again later or contact support@seirs.co');
    }
  };


  const DATA_ITEMS = [
    { label: 'Analytics & Performance',  sub: 'Help improve the platform by sharing anonymised usage data', value: analyticsData,      setter: onAnalyticsData      },
    { label: 'Personalised Offers',       sub: 'Receive bonus offers tailored to your driving patterns',     value: personalisedOffers,  setter: onPersonalisedOffers  },
  ];

  const LEGAL_ITEMS = [
    { label: 'Privacy Policy',     icon: 'document-text-outline',          url: 'https://seirs.app/privacy-policy'    },
    { label: 'Terms of Service',   icon: 'reader-outline',                  url: 'https://seirs.app/terms-of-service'  },
    { label: 'Dispute Resolution', icon: 'information-circle-outline',      url: 'https://seirs.app/dispute-resolution' },
  ];

  const renderPermRow = (label: string, sub: string, granted: boolean | null, isLast: boolean) => (
    <View
      key={label}
      style={[styles.row, !isLast && { borderBottomColor: theme.border, borderBottomWidth: 0.5 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: theme.textSecond }]}>{sub}</Text>
      </View>
      <Text style={{
        fontSize: FontSize.sm,
        fontWeight: FontWeight.semibold,
        color: granted === null ? theme.textThird : granted ? '#16A34A' : '#DC2626',
      }}>
        {granted === null ? 'Unknown' : granted ? 'Allowed' : 'Blocked'}
      </Text>
    </View>
  );

  const renderToggleRow = (
    label: string, sub: string, value: boolean, setter: (v: boolean) => void, key: string, isLast: boolean,
  ) => (
    <View
      key={key}
      style={[styles.row, !isLast && { borderBottomColor: theme.border, borderBottomWidth: 0.5 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: theme.textSecond }]}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={setter}
        trackColor={{ false: theme.border, true: theme.primary + '80' }}
        thumbColor={value ? theme.primary : theme.textThird}
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
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Location</Text>
          {renderPermRow('While using the app', 'Needed to show you nearby jobs and navigate.', fgGranted, false)}
          {renderPermRow('Always (background)', 'Needed to keep tracking a delivery when the app is not open.', bgGranted, false)}
          <Text style={[styles.rowSub, { color: theme.textThird, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }]}>
            While a delivery is active your live location is shared with that customer. That is how tracking works, so it is not a setting.
          </Text>
          <Pressable
            onPress={() => Linking.openSettings()}
            style={({ pressed }) => [styles.actionRow, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="options-outline" size={18} color={theme.primary} />
            <Text style={[styles.rowLabel, { color: theme.primary }]}>Change in system settings</Text>
          </Pressable>
        </View>

        {/* Data & Analytics */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Data & Analytics</Text>
          {DATA_ITEMS.map((item, i) =>
            renderToggleRow(item.label, item.sub, item.value, item.setter, item.label, i === DATA_ITEMS.length - 1)
          )}
        </View>

        {/* Your data */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Your Data</Text>
          <Pressable
            style={[styles.actionRow, { borderBottomColor: theme.border, borderBottomWidth: 0.5 }]}
            onPress={handleDownloadData}
          >
            <Ionicons name="download-outline" size={20} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>Download My Data</Text>
              <Text style={[styles.rowSub, { color: theme.textSecond }]}>Request a copy of all your account data</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
          </Pressable>
          <Pressable style={styles.actionRow}>
            <Ionicons name="trash-outline" size={20} color={theme.textSecond} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>Clear Trip History Cache</Text>
              <Text style={[styles.rowSub, { color: theme.textSecond }]}>Remove locally cached trip data from this device</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
          </Pressable>
        </View>

        {/* Legal */}
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Legal</Text>
          {LEGAL_ITEMS.map((item, i) => (
            <Pressable
              key={item.label}
              style={[
                styles.actionRow,
                i < LEGAL_ITEMS.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 0.5 },
              ]}
              onPress={() => Linking.openURL(item.url)}
            >
              <Ionicons name={item.icon as any} size={20} color={theme.textSecond} />
              <Text style={[styles.rowLabel, { color: theme.text, flex: 1 }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
            </Pressable>
          ))}
        </View>

        {/* Delete account */}
        <Pressable
          style={[styles.deleteBtn, { backgroundColor: isDark ? '#1A0000' : '#FEF2F2', borderColor: '#FECACA' }]}
          onPress={handleDeleteAccount}
        >
          <Ionicons name="person-remove-outline" size={18} color="#EF4444" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.deleteTitle, { color: '#EF4444' }]}>Delete Driver Account</Text>
            <Text style={[styles.deleteSub, { color: theme.textSecond }]}>Permanently remove your account and all data</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#EF4444" />
        </Pressable>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  section:      { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, padding: Spacing.md, paddingBottom: Spacing.sm },

  row:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  rowLabel:  { fontSize: FontSize.base, fontWeight: FontWeight.medium, marginBottom: 2 },
  rowSub:    { fontSize: FontSize.xs, lineHeight: 18 },

  deleteBtn:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  deleteTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  deleteSub:   { fontSize: FontSize.xs, marginTop: 2 },
});
