import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, trip history, and wallet balance. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Permanently', style: 'destructive', onPress: () => {} },
      ]
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
            onChange={setAnalyticsShare}
          />
          <ToggleRow
            icon="megaphone-outline"
            label="Personalised Ads"
            sub="Ads tailored to your interests"
            value={personalisedAds}
            onChange={setPersonalisedAds}
          />
          <ToggleRow
            icon="share-outline"
            label="Data Sharing with Partners"
            sub="Share anonymised trip data for traffic insights"
            value={dataSharing}
            onChange={setDataSharing}
          />
        </View>

        {/* Data actions */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>Your Data</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          {[
            { icon: 'download-outline',   label: 'Download My Data',      sub: 'Get a copy of all your SEIRS data',      color: theme.primary, onPress: () => Alert.alert('Download', 'Your data will be prepared and emailed to you within 24 hours.') },
            { icon: 'trash-outline',      label: 'Clear Trip History',    sub: 'Remove completed trips from your history', color: '#EF4444',    onPress: () => Alert.alert('Clear History', 'This will remove all completed trips.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => {} }]) },
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
          {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((label, i, arr) => (
            <Pressable
              key={label}
              style={[styles.row, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
            >
              <Ionicons name="document-text-outline" size={18} color={theme.textSecond} />
              <Text style={[styles.linkLabel, { color: theme.text }]}>{label}</Text>
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
