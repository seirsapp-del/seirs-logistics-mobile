import {
  View, Text, Pressable, StyleSheet, ScrollView, Switch, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

export default function DriverPrivacyScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [locationAlways,    setLocationAlways]    = useState(true);
  const [shareLocation,     setShareLocation]     = useState(true);
  const [analyticsData,     setAnalyticsData]     = useState(true);
  const [personalisedOffers,setPersonalisedOffers]= useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your driver account, vehicle info, earnings history, and all personal data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {} },
      ],
    );
  };

  const handleDownloadData = () => {
    Alert.alert('Data Export', 'Your data export has been requested. You will receive an email at your registered address within 48 hours.');
  };

  const LOCATION_ITEMS = [
    { label: 'Background Location Tracking', sub: 'Required for real-time delivery navigation and job matching', value: locationAlways, setter: setLocationAlways },
    { label: 'Share Location with Customers',sub: 'Customers can see your live location during active trips', value: shareLocation, setter: setShareLocation },
  ];

  const DATA_ITEMS = [
    { label: 'Analytics & Performance',  sub: 'Help improve the platform by sharing anonymised usage data', value: analyticsData,      setter: setAnalyticsData      },
    { label: 'Personalised Offers',       sub: 'Receive bonus offers tailored to your driving patterns',     value: personalisedOffers,  setter: setPersonalisedOffers  },
  ];

  const LEGAL_ITEMS = [
    { label: 'Privacy Policy',     icon: 'document-text-outline' },
    { label: 'Terms of Service',   icon: 'reader-outline'         },
    { label: 'Cookie Policy',      icon: 'information-circle-outline' },
  ];

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
          {LOCATION_ITEMS.map((item, i) =>
            renderToggleRow(item.label, item.sub, item.value, item.setter, item.label, i === LOCATION_ITEMS.length - 1)
          )}
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
