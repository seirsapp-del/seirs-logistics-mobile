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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.82);

interface DrawerProps {
  visible:  boolean;
  onClose:  () => void;
}

export function Drawer({ visible, onClose }: DrawerProps) {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { t }   = useTranslation();
  const { user, logout, businessRole } = useAuth();
  const { isDark, toggleTheme } = useTheme();

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

  const bg   = isDark ? '#161B22' : '#fff';
  const text = isDark ? '#E6EDF3' : '#111827';
  const sub  = isDark ? '#8B949E' : '#6B7280';
  const border = isDark ? '#30363D' : '#F3F4F6';
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)';

  const navigate = (path: string) => { onClose(); router.push(path as any); };

  const isPartner = businessRole === 'partner';

  const senderItems = [
    { icon: 'LayoutDashboard', label: t('drawer.businessProfile'), path: '/(business)' },
    { icon: 'Settings',        label: t('drawer.settings'),        path: null },
    { icon: 'Users',           label: t('drawer.teamMembers'),     path: '/(business)/team' },
    { icon: 'Banknote',        label: t('drawer.billing'),         path: '/(business)/wallet' },
    { icon: 'Mail',            label: t('drawer.notifications'),   path: null },
    { icon: 'Globe',           label: t('drawer.language'),        path: '/(business)/language' },
    { icon: 'HelpCircle',      label: t('drawer.help'),            path: null },
    { icon: 'Lock',            label: t('drawer.privacy'),         path: null },
    { icon: 'Phone',           label: t('drawer.contact'),         path: null },
  ];

  const partnerItems = [
    { icon: 'Store',           label: t('drawer.partnerProfile'),  path: '/(partner)' },
    { icon: 'Settings',        label: t('drawer.settings'),        path: '/(partner)/settings' },
    { icon: 'Mail',            label: t('drawer.notifications'),   path: null },
    { icon: 'Globe',           label: t('drawer.language'),        path: '/(partner)/language' },
    { icon: 'HelpCircle',      label: t('drawer.help'),            path: null },
    { icon: 'Lock',            label: t('drawer.privacy'),         path: null },
    { icon: 'Phone',           label: t('drawer.contact'),         path: null },
  ];

  const items = isPartner ? partnerItems : senderItems;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: overlayBg, opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer panel */}
      <Animated.View
        style={[
          styles.drawer,
          { width: DRAWER_WIDTH, backgroundColor: bg, transform: [{ translateX }], paddingTop: insets.top },
        ]}
      >
        {/* Profile header */}
        <View style={[styles.profileSection, { borderBottomColor: border }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: text }]} numberOfLines={1}>
              {isPartner ? user?.storeName : user?.companyName || user?.name}
            </Text>
            <Text style={[styles.accountId, { color: sub }]} numberOfLines={1}>
              {user?.accountId}
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Icon name="X" size={18} color={sub} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* Dark mode toggle */}
          <View style={[styles.toggleRow, { borderBottomColor: border }]}>
            <Icon name={isDark ? 'Moon' : 'Sun'} size={18} color={sub} />
            <Text style={[styles.itemLabel, { color: text, flex: 1 }]}>
              {isDark ? t('drawer.darkMode') : t('drawer.lightMode')}
            </Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#E5E7EB', true: '#3A7BD5' }}
              thumbColor="#fff"
            />
          </View>

          {/* Nav items */}
          {items.map((item) => (
            <Pressable
              key={item.label}
              style={[styles.item, { borderBottomColor: border }]}
              onPress={() => item.path ? navigate(item.path) : onClose()}
            >
              <Icon name={item.icon as any} size={18} color={sub} />
              <Text style={[styles.itemLabel, { color: text }]}>{item.label}</Text>
              <Icon name="ChevronRight" size={14} color={sub} />
            </Pressable>
          ))}
        </ScrollView>

        {/* Sign out */}
        <View style={[styles.signOut, { borderTopColor: border, paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={styles.signOutBtn}
            onPress={() => { onClose(); logout(); }}
          >
            <Icon name="LogOut" size={18} color="#DC2626" />
            <Text style={styles.signOutText}>{t('drawer.signOut')}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  drawer:        { position: 'absolute', left: 0, top: 0, bottom: 0, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 20 },
  profileSection:{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 20, borderBottomWidth: 1 },
  avatar:        { width: 44, height: 44, borderRadius: 14, backgroundColor: '#3A7BD5', alignItems: 'center', justifyContent: 'center' },
  avatarText:    { fontSize: 18, fontWeight: '800', color: '#fff' },
  name:          { fontSize: 15, fontWeight: '700' },
  accountId:     { fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  closeBtn:      { padding: 4 },
  toggleRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  item:          { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  itemLabel:     { fontSize: 14, fontWeight: '500' },
  signOut:       { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12 },
  signOutBtn:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  signOutText:   { fontSize: 14, fontWeight: '600', color: '#DC2626' },
});
