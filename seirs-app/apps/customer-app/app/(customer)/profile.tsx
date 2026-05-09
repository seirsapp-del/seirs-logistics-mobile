import {
  View, Text, Pressable, StyleSheet, Alert, ScrollView, StatusBar, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { HamburgerButton } from '@/components/HamburgerButton';
import { MOCK_USER, MOCK_TRIPS } from '@/constants/mockData';

type MenuSection = { title: string; items: MenuItem[] };
type MenuItem = { icon: string; label: string; sub?: string; onPress: () => void; danger?: boolean };

export default function ProfileScreen() {
  const router           = useRouter();
  const cs               = useColorScheme();
  const theme            = Colors[cs ?? 'light'];
  const isDark           = cs === 'dark';
  const { user, logout } = useAuth();

  const displayName = user?.name ?? MOCK_USER.name;
  const completedTrips = MOCK_TRIPS.filter(t => t.status === 'completed').length;

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const SECTIONS: MenuSection[] = [
    {
      title: 'Account',
      items: [
        { icon: 'person-outline',    label: 'Edit Profile',      sub: 'Name, phone, photo',      onPress: () => router.push('/(customer)/edit-profile') },
        { icon: 'shield-outline',    label: 'Verify Identity',   sub: 'NIN / BVN verification',  onPress: () => Alert.alert('Coming soon', 'NIN / BVN verification is on our roadmap.') },
        { icon: 'card-outline',      label: 'Payment Methods',   sub: 'Cards & bank accounts',   onPress: () => router.push('/(customer)/payment-methods') },
        { icon: 'location-outline',  label: 'Saved Addresses',   sub: 'Home, office & more',     onPress: () => router.push('/(customer)/addresses') },
      ],
    },
    {
      title: 'Activity',
      items: [
        { icon: 'receipt-outline',   label: 'My Trips',          sub: `${completedTrips} trips completed`, onPress: () => router.push('/(customer)/history') },
        { icon: 'wallet-outline',    label: 'Wallet',            sub: `₦${MOCK_USER.walletBalance.toLocaleString()} balance`, onPress: () => router.push('/(customer)/wallet') },
        { icon: 'star-outline',      label: 'Rewards',           sub: `${MOCK_USER.points.toLocaleString()} points · ${MOCK_USER.tier}`, onPress: () => router.push('/(customer)/rewards') },
        { icon: 'gift-outline',      label: 'Refer & Earn',      sub: 'Invite friends for ₦1,000',  onPress: () => router.push('/(customer)/referral') },
        { icon: 'ticket-outline',    label: 'Promotions',        sub: '3 active promos',           onPress: () => router.push('/(customer)/promotions') },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: 'notifications-outline', label: 'Notifications',    sub: 'Manage alerts',          onPress: () => router.push('/(customer)/notification-settings') },
        { icon: 'language-outline',      label: 'Language',         sub: 'English (Nigeria)',      onPress: () => router.push('/(customer)/language') },
        { icon: 'lock-closed-outline',   label: 'Privacy',          sub: 'Data & permissions',    onPress: () => router.push('/(customer)/privacy') },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-circle-outline',   label: 'Help Center',      sub: 'FAQs & support',        onPress: () => router.push('/(customer)/help') },
        { icon: 'chatbubble-outline',    label: 'Live Chat',        sub: 'Talk to an agent',      onPress: () => Alert.alert('Coming soon', 'Live chat with our support team is launching shortly.') },
        { icon: 'document-text-outline', label: 'Terms of Service', sub: 'Legal & privacy policy', onPress: () => Linking.openURL('https://seirs.co/terms').catch(() => Alert.alert('Coming soon', 'Our Terms page goes live with the public launch.')) },
      ],
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <HamburgerButton />
            <Text style={[styles.title, { color: theme.text }]}>Profile</Text>
          </View>
          <Pressable
            style={[styles.settingsBtn, { backgroundColor: theme.surfaceSecond }]}
            onPress={() => router.push('/(customer)/notification-settings')}
            accessibilityRole="button"
            accessibilityLabel="Notification settings"
          >
            <Ionicons name="settings-outline" size={20} color={theme.text} />
          </Pressable>
        </View>

        {/* User card */}
        <View style={[styles.userCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={styles.userCardTop}>
            <Avatar name={displayName} size={68} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: theme.text }]}>{displayName}</Text>
              <Text style={[styles.userEmail, { color: theme.textSecond }]}>{user?.email ?? MOCK_USER.email}</Text>
              <Text style={[styles.userPhone, { color: theme.textSecond }]}>{user?.phone ?? MOCK_USER.phone}</Text>
            </View>
            <View style={[styles.tierPill, { backgroundColor: '#FFBE0B20', borderColor: '#FFBE0B40' }]}>
              <Ionicons name="medal" size={13} color="#FFBE0B" />
              <Text style={[styles.tierText, { color: '#B45309' }]}>{MOCK_USER.tier}</Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
            {[
              { label: 'Trips',   value: `${completedTrips}` },
              { label: 'Points',  value: MOCK_USER.points.toLocaleString() },
              { label: 'Rating',  value: '4.9 ★' },
            ].map((s, i) => (
              <View key={s.label} style={[styles.statItem, i < 2 && { borderRightWidth: 1, borderRightColor: theme.border }]}>
                <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecond }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Referral code quick access */}
        <Pressable
          style={[styles.refRow, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '40' }]}
          onPress={() => router.push('/(customer)/referral')}
        >
          <Ionicons name="gift-outline" size={18} color={theme.primary} />
          <Text style={[styles.refText, { color: theme.text }]}>
            Your referral code: <Text style={{ color: theme.primary, fontWeight: FontWeight.bold }}>{MOCK_USER.referralCode}</Text>
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
        </Pressable>

        {/* Menu sections */}
        {SECTIONS.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>{section.title}</Text>
            <View style={[styles.menuCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
              {section.items.map((item, i, arr) => (
                <Pressable
                  key={item.label}
                  style={[
                    styles.menuRow,
                    i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                  ]}
                  onPress={item.onPress}
                >
                  <View style={[styles.menuIcon, { backgroundColor: item.danger ? '#FEF2F2' : theme.surfaceSecond }]}>
                    <Ionicons name={item.icon as any} size={19} color={item.danger ? '#EF4444' : theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, { color: item.danger ? '#EF4444' : theme.text }]}>{item.label}</Text>
                    {item.sub && <Text style={[styles.menuSub, { color: theme.textSecond }]}>{item.sub}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Text style={[styles.version, { color: theme.textThird }]}>SEIRS Logistics v2.0.0 · Build 204</Text>

        {/* Sign out */}
        <Pressable
          style={[styles.logoutBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll:  { paddingBottom: Spacing.xl * 2 },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title:       { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  userCard:    { marginHorizontal: Spacing.md, borderRadius: Radius.xxl, borderWidth: 1, marginBottom: Spacing.md, overflow: 'hidden' },
  userCardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  userName:    { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  userEmail:   { fontSize: FontSize.xs, marginTop: 2 },
  userPhone:   { fontSize: FontSize.xs, marginTop: 1 },
  tierPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1, alignSelf: 'flex-start' },
  tierText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  statsRow:  { flexDirection: 'row', borderTopWidth: 1 },
  statItem:  { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  statValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  statLabel: { fontSize: FontSize.xs, marginTop: 2 },

  refRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.md },
  refText: { flex: 1, fontSize: FontSize.sm },

  section:      { marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm, paddingLeft: Spacing.xs },
  menuCard:     { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  menuRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
  menuIcon:     { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuLabel:    { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  menuSub:      { fontSize: FontSize.xs, marginTop: 2 },

  version:    { textAlign: 'center', fontSize: FontSize.xs, marginBottom: Spacing.md, marginTop: Spacing.xs },
  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, height: 52, borderRadius: Radius.xl, borderWidth: 1.5 },
  logoutText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: '#EF4444' },
});
