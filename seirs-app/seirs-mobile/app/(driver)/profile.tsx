import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { driversApi } from '@/services/api';

export default function DriverProfileScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const { user, logout } = useAuth();

  const [driverData, setDriverData] = useState<any>(null);

  useEffect(() => {
    driversApi.me().then(setDriverData).catch(() => {});
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? 'Driver';

  const menu = [
    { icon: '📄', label: 'My Documents (KYC)', onPress: () => router.push('/(driver)/kyc') },
    { icon: '💰', label: 'Earnings & Payouts',  onPress: () => router.push('/(driver)/earnings') },
    { icon: '🔔', label: 'Notifications',        onPress: () => router.push('/notifications' as any) },
    { icon: '❓', label: 'Help & Support',       onPress: () => Alert.alert('Help', 'Email us at support@seirs.co') },
  ];

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const kycColor = driverData?.status === 'approved'
    ? '#22C55E'
    : driverData?.status === 'rejected'
    ? '#EF4444'
    : '#F59E0B';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Profile</Text>
      </View>

      {/* Avatar + info */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Text style={styles.avatarText}>{firstName[0].toUpperCase()}</Text>
        </View>
        <Text style={[styles.name, { color: theme.text }]}>{user?.name}</Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: theme.primary + '18' }]}>
            <Text style={[styles.badgeText, { color: theme.primary }]}>DRIVER</Text>
          </View>
          {driverData?.status && (
            <View style={[styles.badge, { backgroundColor: kycColor + '18' }]}>
              <Text style={[styles.badgeText, { color: kycColor }]}>
                KYC {driverData.status.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        {driverData?.rating != null && (
          <Text style={[styles.rating, { color: theme.textSecond }]}>
            ⭐ {Number(driverData.rating).toFixed(1)} rating
          </Text>
        )}
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
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={[styles.menuLabel, { color: theme.text }]}>{item.label}</Text>
            <Text style={[styles.menuArrow, { color: theme.textSecond }]}>›</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.version, { color: theme.textSecond }]}>Seirs v1.0.0</Text>

      <Pressable style={[styles.logoutBtn, { borderColor: theme.error }]} onPress={handleLogout}>
        <Text style={[styles.logoutText, { color: theme.error }]}>Sign Out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:        { padding: Spacing.xl, paddingBottom: 0 },
  title:         { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  avatarSection: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  avatar:        { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  avatarText:    { color: '#fff', fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  name:          { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  badgeRow:      { flexDirection: 'row', gap: Spacing.sm },
  badge:         { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.full },
  badgeText:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, letterSpacing: 1 },
  rating:        { fontSize: FontSize.sm },
  menuCard:      { marginHorizontal: Spacing.xl, borderRadius: Radius.lg, overflow: 'hidden' },
  menuRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md + 2, gap: Spacing.md },
  menuIcon:      { fontSize: 20 },
  menuLabel:     { flex: 1, fontSize: FontSize.base },
  menuArrow:     { fontSize: FontSize.lg },
  version:       { textAlign: 'center', fontSize: FontSize.xs, marginTop: Spacing.xl },
  logoutBtn:     { marginHorizontal: Spacing.xl, marginTop: Spacing.md, height: 52, borderRadius: Radius.md, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  logoutText:    { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
