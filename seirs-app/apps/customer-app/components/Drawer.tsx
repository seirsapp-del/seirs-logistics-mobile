import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions,
  ScrollView, Switch, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Avatar } from '@/components/ui/Avatar';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.82);

interface DrawerProps {
  visible: boolean;
  onClose: () => void;
}

export function Drawer({ visible, onClose }: DrawerProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(opacity,    { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const navigate = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as any), 220);
  };

  const handleLogout = async () => {
    onClose();
    setTimeout(async () => {
      await logout();
      router.replace('/(auth)/onboarding');
    }, 220);
  };

  // Items per Master Spec V7 §1.5
  const items: { icon: string; label: string; path?: string }[] = [
    { icon: 'User',         label: t('drawer.profile',       { defaultValue: 'Profile' }),         path: '/(customer)/profile' },
    { icon: 'Settings',     label: t('drawer.settings',      { defaultValue: 'Settings' }),        path: '/(customer)/profile' },
    { icon: 'Bell',         label: t('drawer.notifications', { defaultValue: 'Notifications' }),   path: '/notifications' },
    { icon: 'Globe',        label: t('drawer.language',      { defaultValue: 'Language' }),        path: '/(customer)/language' },
    { icon: 'HelpCircle',   label: t('drawer.help',          { defaultValue: 'Help & FAQ' }),      path: '/(customer)/help' },
    { icon: 'Lock',         label: t('drawer.privacy',       { defaultValue: 'Privacy Policy' }),  path: '/(customer)/privacy' },
    { icon: 'Briefcase',    label: t('drawer.business',      { defaultValue: 'Business Account' }), path: '/(customer)/business' },
    { icon: 'Phone',        label: t('drawer.contact',       { defaultValue: 'Contact Support' }), path: '/(customer)/help' },
  ];

  const bg     = isDark ? '#161B22' : '#fff';
  const border = isDark ? '#30363D' : '#F3F4F6';
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity, backgroundColor: overlayBg }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX }],
            backgroundColor: bg,
            paddingTop: insets.top,
            width: DRAWER_WIDTH,
          },
        ]}
      >
        {/* Profile header */}
        <View style={[styles.header, { borderBottomColor: border }]}>
          <Avatar name={user?.name ?? 'User'} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
              {user?.name ?? 'Guest'}
            </Text>
            <Text style={[styles.userEmail, { color: theme.textSecond }]} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
          </View>
        </View>

        {/* Menu items */}
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {items.map((item) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [
                styles.item,
                { borderBottomColor: border, backgroundColor: pressed ? (isDark ? '#1C2128' : '#F8FAFC') : 'transparent' },
              ]}
              onPress={() => item.path && navigate(item.path)}
            >
              <Icon name={item.icon as any} size={20} color={theme.textSecond} strokeWidth={1.8} />
              <Text style={[styles.itemLabel, { color: theme.text }]}>{item.label}</Text>
              <Icon name="ChevronRight" size={16} color={theme.textThird} strokeWidth={2} />
            </Pressable>
          ))}

          {/* Theme toggle */}
          <View style={[styles.item, { borderBottomColor: border }]}>
            <Icon name={isDark ? 'Moon' : 'Sun'} size={20} color={theme.textSecond} strokeWidth={1.8} />
            <Text style={[styles.itemLabel, { color: theme.text }]}>
              {isDark
                ? t('drawer.lightMode', { defaultValue: 'Light Mode' })
                : t('drawer.darkMode',  { defaultValue: 'Dark Mode' })}
            </Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#E5E7EB', true: '#3A7BD5' }}
              thumbColor="#fff"
            />
          </View>
        </ScrollView>

        {/* Sign out */}
        <Pressable
          style={[styles.signOut, { borderTopColor: border }]}
          onPress={handleLogout}
        >
          <Icon name="LogOut" size={20} color="#EF4444" strokeWidth={1.8} />
          <Text style={styles.signOutText}>
            {t('drawer.signOut', { defaultValue: 'Sign Out' })}
          </Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 4, height: 0 },
    shadowRadius: 12,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userName:  { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  userEmail: { fontSize: FontSize.xs, marginTop: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical:   Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemLabel: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  signOutText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: '#EF4444' },
});
