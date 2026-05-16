import {
  View, Text, Pressable, StyleSheet, Alert, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { HamburgerButton } from '@/components/HamburgerButton';
import { MOCK_DRIVER } from '@/constants/driverMockData';

const TIER_COLORS: Record<string, string> = {
  Bronze:   '#CD7F32',
  Silver:   '#9CA3AF',
  Gold:     '#FFBE0B',
  Platinum: '#7C3AED',
};

interface MenuSection {
  title: string;
  items: { icon: string; label: string; sub?: string; route?: string; danger?: boolean; badge?: string }[];
}

const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Account',
    items: [
      { icon: 'shield-checkmark-outline', label: 'KYC Verification',    sub: 'Documents verified',         route: '/(driver)/kyc' },
      { icon: 'car-outline',              label: 'My Vehicle',           sub: 'Toyota Corolla · LND 423 GH', route: '/(driver)/vehicle' },
      { icon: 'star-outline',             label: 'My Ratings',           sub: '4.9 · 1,247 reviews',         route: '/(driver)/ratings' },
    ],
  },
  {
    title: 'Earnings',
    items: [
      { icon: 'cash-outline',              label: 'Earnings & Wallet',  sub: `₦${MOCK_DRIVER.balance.toLocaleString()} available`, route: '/(driver)/earnings' },
      { icon: 'arrow-up-circle-outline',   label: 'Withdraw Earnings',  sub: 'Transfer to bank account',   route: '/(driver)/withdrawal' },
      { icon: 'business-outline',          label: 'Bank Accounts',      sub: '2 accounts saved',            route: '/(driver)/add-bank' },
    ],
  },
  {
    title: 'Work',
    items: [
      { icon: 'calendar-outline',         label: 'My Schedule',         sub: 'Set working hours',           route: '/(driver)/schedule' },
      { icon: 'receipt-outline',          label: 'Trip History',        sub: 'View past deliveries',        route: '/(driver)/history' },
      { icon: 'notifications-outline',    label: 'Notifications',       sub: '',                            route: '/(driver)/notifications', badge: '2' },
      { icon: 'rocket-outline',            label: 'SEIRS Premium',       sub: 'Priority matching + badge',   route: '/(driver)/subscription' },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { icon: 'notifications-outline',    label: 'Notification Settings', route: '/(driver)/notification-settings' },
      { icon: 'lock-closed-outline',      label: 'Privacy & Data',        route: '/(driver)/privacy' },
    ],
  },
  {
    title: 'Support',
    items: [
      { icon: 'help-circle-outline',      label: 'Help Center',          route: '/(driver)/help' },
      { icon: 'chatbubble-ellipses-outline', label: 'Contact Support',   sub: 'Live chat · 0700-SEIRS-01' },
    ],
  },
];

export default function DriverProfileScreen() {
  const router           = useRouter();
  const cs               = useColorScheme();
  const theme            = Colors[cs ?? 'light'];
  const isDark           = cs === 'dark';
  const { user, logout } = useAuth();

  const driver     = MOCK_DRIVER;
  const tierColor  = TIER_COLORS[driver.tier] ?? theme.primary;

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleItemPress = (item: MenuSection['items'][0]) => {
    if (item.route) {
      router.push(item.route as any);
    } else if (item.label === 'Contact Support') {
      Alert.alert('Support', 'Call us at 0700-SEIRS-01 or email drivers@seirs.app');
    }
  };

  const displayName = user?.name ?? driver.name;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.pageHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <HamburgerButton />
            <Text style={[styles.pageTitle, { color: theme.text }]}>Profile</Text>
          </View>
          <Pressable
            style={[styles.notifBtn, { backgroundColor: theme.surfaceSecond }]}
            onPress={() => router.push('/(driver)/notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={theme.text} />
            <View style={[styles.notifDot, { backgroundColor: theme.primary }]} />
          </Pressable>
        </View>

        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
          <View style={styles.profileTop}>
            <View style={[styles.avatarWrap, { borderColor: tierColor + '50' }]}>
              <Avatar name={displayName} uri={user?.profilePhoto} size={72} />
              <View style={[styles.onlineDot, { backgroundColor: driver.isOnline ? '#22C55E' : '#9CA3AF', borderColor: theme.surface }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.driverName, { color: theme.text }]}>{displayName}</Text>
              <Text style={[styles.driverPhone, { color: theme.textSecond }]}>{driver.phone}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.tierBadge, { backgroundColor: tierColor + '18', borderColor: tierColor + '40' }]}>
                  <Ionicons name="ribbon-outline" size={11} color={tierColor} />
                  <Text style={[styles.tierText, { color: tierColor }]}>{driver.tier}</Text>
                </View>
                <View style={[styles.approvedBadge, { backgroundColor: '#22C55E18' }]}>
                  <Ionicons name="checkmark-circle" size={11} color="#22C55E" />
                  <Text style={[styles.approvedText, { color: '#22C55E' }]}>Verified</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Stats */}
          <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
            {[
              { label: 'Total Trips',    value: driver.totalTrips.toLocaleString(), icon: 'navigate-outline' },
              { label: 'Rating',         value: `${driver.rating}★`,                icon: 'star-outline' },
              { label: 'Total Earned',   value: `₦${(driver.totalEarned / 1000000).toFixed(1)}M`, icon: 'trending-up-outline' },
            ].map(s => (
              <View key={s.label} style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: theme.textThird }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Balance quick-access */}
        <Pressable
          style={[styles.balanceCard, { backgroundColor: isDark ? '#001A00' : '#F0FDF4', borderColor: '#22C55E30' }]}
          onPress={() => router.push('/(driver)/withdrawal')}
        >
          <View>
            <Text style={[styles.balLabel, { color: theme.textSecond }]}>Available Balance</Text>
            <Text style={[styles.balAmount, { color: '#22C55E' }]}>₦{driver.balance.toLocaleString()}</Text>
          </View>
          <View style={[styles.withdrawQuick, { backgroundColor: '#22C55E' }]}>
            <Ionicons name="arrow-up-circle-outline" size={16} color="#fff" />
            <Text style={styles.withdrawQuickText}>Withdraw</Text>
          </View>
        </Pressable>

        {/* Menu sections */}
        {MENU_SECTIONS.map(section => (
          <View key={section.title}>
            <Text style={[styles.sectionHeader, { color: theme.textThird }]}>{section.title.toUpperCase()}</Text>
            <View style={[styles.menuCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.sm]}>
              {section.items.map((item, i) => (
                <Pressable
                  key={item.label}
                  style={({ pressed }) => [
                    styles.menuRow,
                    i < section.items.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 0.5 },
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => handleItemPress(item)}
                >
                  <View style={[styles.menuIcon, { backgroundColor: theme.surfaceSecond }]}>
                    <Ionicons name={item.icon as any} size={18} color={item.danger ? '#EF4444' : theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, { color: item.danger ? '#EF4444' : theme.text }]}>{item.label}</Text>
                    {item.sub ? <Text style={[styles.menuSub, { color: theme.textSecond }]}>{item.sub}</Text> : null}
                  </View>
                  {item.badge && (
                    <View style={[styles.menuBadge, { backgroundColor: theme.primary }]}>
                      <Text style={styles.menuBadgeText}>{item.badge}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Text style={[styles.version, { color: theme.textThird }]}>Seirs Driver v1.0.0</Text>

        <Pressable
          style={[styles.logoutBtn, { backgroundColor: theme.error + '12', borderColor: theme.error + '30' }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.error} />
          <Text style={[styles.logoutText, { color: theme.error }]}>Sign Out</Text>
        </Pressable>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: Spacing.xl },

  pageHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  pageTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  notifBtn:    { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  notifDot:    { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },

  profileCard: { marginHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.md, overflow: 'hidden' },
  profileTop:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  avatarWrap:  { position: 'relative', width: 78, height: 78, borderRadius: 39, borderWidth: 2.5, justifyContent: 'center', alignItems: 'center' },
  onlineDot:   { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  driverName:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  driverPhone: { fontSize: FontSize.sm, marginTop: 2, marginBottom: 6 },
  badgeRow:    { flexDirection: 'row', gap: Spacing.sm },
  tierBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  tierText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  approvedBadge:{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
  approvedText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#22C55E' },

  statsRow:  { flexDirection: 'row', borderTopWidth: 1, paddingVertical: Spacing.md },
  statItem:  { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  statLabel: { fontSize: FontSize.xs },

  balanceCard:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, marginBottom: Spacing.md },
  balLabel:       { fontSize: FontSize.sm, marginBottom: 2 },
  balAmount:      { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  withdrawQuick:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.full },
  withdrawQuickText:{ color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  sectionHeader: { paddingHorizontal: Spacing.md + 4, paddingTop: Spacing.sm, paddingBottom: Spacing.xs, fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1 },
  menuCard:      { marginHorizontal: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.sm },
  menuRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 14, gap: Spacing.md },
  menuIcon:      { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  menuLabel:     { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  menuSub:       { fontSize: FontSize.xs, marginTop: 1 },
  menuBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  menuBadgeText: { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },

  version:    { textAlign: 'center', fontSize: FontSize.xs, marginTop: Spacing.md, marginBottom: Spacing.sm },
  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, height: 52, borderRadius: Radius.xl, borderWidth: 1 },
  logoutText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
