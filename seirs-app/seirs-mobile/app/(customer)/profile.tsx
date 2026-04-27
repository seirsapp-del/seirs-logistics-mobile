import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

type MenuItem = {
  icon: string;
  label: string;
  onPress: () => void;
};

export default function ProfileScreen() {
  const router           = useRouter();
  const colorScheme      = useColorScheme();
  const theme            = Colors[colorScheme ?? 'light'];
  const { user, logout } = useAuth();

  const firstName = user?.name?.split(' ')[0] ?? 'User';

  const menu: MenuItem[] = [
    { icon: 'cube-outline',          label: 'My Deliveries',     onPress: () => router.push('/(customer)/history') },
    { icon: 'wallet-outline',        label: 'Wallet & Payments', onPress: () => router.push('/(customer)/wallet' as any) },
    { icon: 'notifications-outline', label: 'Notifications',     onPress: () => router.push('/notifications' as any) },
    { icon: 'help-circle-outline',   label: 'Help & Support',    onPress: () => Alert.alert('Help', 'Email us at support@seirs.co') },
  ];

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xl }}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Profile</Text>
        </View>

        {/* Avatar card */}
        <View style={[styles.avatarCard, { backgroundColor: theme.surface }, Shadows.sm]}>
          <View style={[styles.avatarRing, { borderColor: theme.primary + '30' }]}>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>{firstName[0].toUpperCase()}</Text>
            </View>
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{user?.name}</Text>
          <Text style={[styles.email, { color: theme.textSecond }]}>{user?.email}</Text>
          {user?.phone ? (
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={13} color={theme.textThird} />
              <Text style={[styles.phone, { color: theme.textSecond }]}>{user.phone}</Text>
            </View>
          ) : null}
          <View style={[styles.roleBadge, { backgroundColor: theme.primary + '15' }]}>
            <Text style={[styles.roleText, { color: theme.primary }]}>CUSTOMER</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={[styles.menuCard, { backgroundColor: theme.surface }, Shadows.sm]}>
          {menu.map((item, i, arr) => (
            <Pressable
              key={item.label}
              style={[
                styles.menuRow,
                i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.divider },
              ]}
              onPress={item.onPress}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: theme.surfaceSecond }]}>
                <Ionicons name={item.icon as any} size={20} color={theme.primary} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.text }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.textThird} />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.version, { color: theme.textThird }]}>Seirs v1.0.0</Text>

        {/* Sign out */}
        <Pressable
          style={[styles.logoutBtn, { backgroundColor: theme.error + '12', borderColor: theme.error + '30' }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={theme.error} />
          <Text style={[styles.logoutText, { color: theme.error }]}>Sign Out</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold },

  avatarCard:  { marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, padding: Spacing.lg, alignItems: 'center', gap: 6 },
  avatarRing:  { width: 92, height: 92, borderRadius: 46, borderWidth: 3, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs },
  avatar:      { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { color: '#fff', fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  name:        { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  email:       { fontSize: FontSize.sm },
  phoneRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  phone:       { fontSize: FontSize.sm },
  roleBadge:   { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.full, marginTop: Spacing.xs },
  roleText:    { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 1.5 },

  menuCard:    { marginHorizontal: Spacing.md, borderRadius: Radius.xl, overflow: 'hidden', marginBottom: Spacing.md },
  menuRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.md },
  menuIconWrap:{ width: 40, height: 40, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  menuLabel:   { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.medium },

  version:    { textAlign: 'center', fontSize: FontSize.xs, marginBottom: Spacing.md },
  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, height: 52, borderRadius: Radius.xl, borderWidth: 1 },
  logoutText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
