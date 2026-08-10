import React, { useRef, useEffect, ComponentType } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions,
  ScrollView, Switch, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.82);

export interface DrawerItem {
  /** Lucide icon name (e.g. 'User', 'Settings'). Resolved by the host app's Icon component. */
  icon:    string;
  label:   string;
  onPress?: () => void;
  /** Optional badge/counter on the right side (e.g. unread count). */
  badge?:  string | number;
  /** Style as a destructive item (red text + icon). */
  danger?: boolean;
}

export interface DrawerThemeTokens {
  surface:    string;
  background: string;
  text:       string;
  textSecond: string;
  textThird:  string;
  border:     string;
  accent:     string;
  /** Optional override for danger color; defaults to a sensible red. */
  danger?:    string;
  isDark:     boolean;
}

export interface DrawerProps {
  visible: boolean;
  onClose: () => void;

  /** Profile header content. */
  user: { name: string; email?: string; avatar?: React.ReactNode };

  /** Menu items rendered in the body. */
  items: DrawerItem[];

  /** Optional theme toggle row. Omit to hide. */
  themeToggle?: {
    isDark:    boolean;
    onToggle:  () => void;
    darkLabel: string;   // "Dark Mode"
    lightLabel: string;  // "Light Mode"
  };

  /** Footer sign-out action. */
  signOut: { label: string; onPress: () => void };

  /** Theme tokens from the host app. */
  theme: DrawerThemeTokens;

  /**
   * Lucide icon component injected by the host app
   * (each app has its own thin Icon wrapper).
   */
  Icon: ComponentType<{ name: string; size?: number; color?: string; strokeWidth?: number }>;
}

/**
 * Headless drawer used by all 4 mobile apps.
 * Per spec §1.5 / §2.2 / §G1.
 *
 * The host app provides items, theme tokens, an Icon component, and
 * authenticated user data. This component handles animation, layout,
 * sign-out wiring, and the theme toggle UI.
 */
export function Drawer({
  visible, onClose, user, items, themeToggle, signOut, theme, Icon,
}: DrawerProps) {
  const insets = useSafeAreaInsets();
  const dangerColor = theme.danger ?? '#EF4444';

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

  const overlayBg = theme.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)';
  const pressedBg = theme.isDark ? '#1C2128' : '#F8FAFC';

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
            backgroundColor: theme.surface,
            paddingTop: insets.top,
            // Bottom inset so Sign Out button doesn't hide under the Android
            // gesture bar / nav bar when edgeToEdgeEnabled is true.
            paddingBottom: insets.bottom,
            width: DRAWER_WIDTH,
          },
        ]}
      >
        {/* Brand row: SEIRS v2 logo lockup. Mark colour follows theme so
            the okada is navy in light mode, white in dark mode. Yellow
            package stays constant: it's the brand signal. */}
        <View style={[styles.brand, { borderBottomColor: theme.border }]}>
          <SeirsBrandLockup color={theme.text} bgColor={theme.surface} />
        </View>

        {/* Profile header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          {user.avatar}
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
              {user.name}
            </Text>
            {user.email ? (
              <Text style={[styles.userEmail, { color: theme.textSecond }]} numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Menu items */}
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {items.map((item, idx) => (
            <Pressable
              key={`${item.label}-${idx}`}
              style={({ pressed }) => [
                styles.item,
                {
                  borderBottomColor: theme.border,
                  backgroundColor: pressed ? pressedBg : 'transparent',
                },
              ]}
              onPress={item.onPress}
            >
              <Icon
                name={item.icon}
                size={20}
                color={item.danger ? dangerColor : theme.textSecond}
                strokeWidth={1.8}
              />
              <Text style={[styles.itemLabel, { color: item.danger ? dangerColor : theme.text }]}>
                {item.label}
              </Text>
              {item.badge != null && String(item.badge) !== '' && String(item.badge) !== '0' && (
                <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              )}
              <Icon name="ChevronRight" size={16} color={theme.textThird} strokeWidth={2} />
            </Pressable>
          ))}

          {/* Theme toggle row */}
          {themeToggle && (
            <View style={[styles.item, { borderBottomColor: theme.border }]}>
              <Icon
                name={themeToggle.isDark ? 'Moon' : 'Sun'}
                size={20}
                color={theme.textSecond}
                strokeWidth={1.8}
              />
              <Text style={[styles.itemLabel, { color: theme.text }]}>
                {themeToggle.isDark ? themeToggle.lightLabel : themeToggle.darkLabel}
              </Text>
              <Switch
                value={themeToggle.isDark}
                onValueChange={themeToggle.onToggle}
                trackColor={{ false: '#E5E7EB', true: theme.accent }}
                thumbColor="#fff"
              />
            </View>
          )}
        </ScrollView>

        {/* Sign out */}
        <Pressable
          style={[styles.signOut, { borderTopColor: theme.border }]}
          onPress={signOut.onPress}
        >
          <Icon name="LogOut" size={20} color={dangerColor} strokeWidth={1.8} />
          <Text style={[styles.signOutText, { color: dangerColor }]}>
            {signOut.label}
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
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userName:  { fontSize: 17, fontWeight: '700' },
  userEmail: { fontSize: 11, marginTop: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical:   16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemLabel: { flex: 1, fontSize: 13, fontWeight: '500' },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  signOutText: { fontSize: 13, fontWeight: '600' },
});

// ── SEIRS brand lockup: mark + wordmark, shared across all 3 apps ────
// Okada: monoline strokes, matches SeirsMarkBold in the customer-app.
// Wordmark: "SEIRS" rendered in the device system font (One UI Sans on
// Samsung, Roboto on Pixel, SF Pro on iOS): matches the splash #58
// look the user chose. NOT a traced/bundled font.

function SeirsBrandLockup({ color, bgColor }: { color: string; bgColor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Svg width={48} height={32} viewBox="0 0 48 32" fill="none">
        <Path d="M 10 24 L 18 16 L 30 16 L 38 24"
              stroke={color} strokeWidth={3.5} fill="none"
              strokeLinecap="round" strokeLinejoin="round"/>
        <Circle cx={10} cy={24} r={6} fill={color}/>
        <Circle cx={10} cy={24} r={2} fill={bgColor}/>
        <Circle cx={38} cy={24} r={6} fill={color}/>
        <Circle cx={38} cy={24} r={2} fill={bgColor}/>
        <Line x1={37} y1={12} x2={42} y2={9} stroke={color} strokeWidth={3.5} strokeLinecap="round"/>
        <Line x1={24} y1={16} x2={28} y2={8}  stroke={color} strokeWidth={4} strokeLinecap="round"/>
        <Circle cx={28} cy={5} r={3.5} fill={color}/>
        <Line x1={27} y1={10} x2={37} y2={12} stroke={color} strokeWidth={3.5} strokeLinecap="round"/>
      </Svg>
      {/* Plain Text with natural letter-spacing: matches the home
          top-bar wordmark (which the user preferred over the old
          forced equal-cell SVG spacing). */}
      <Text style={{ fontSize: 22, fontWeight: '900', letterSpacing: 2.5, color }}>
        SEIRS
      </Text>
    </View>
  );
}
