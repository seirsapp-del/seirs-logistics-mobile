import React, { useRef, useEffect, ComponentType } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions,
  ScrollView, Switch, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import {
  MARK_SW, MARK_WHEEL_R, MARK_HUB_R, MARK_HEAD_R, MARK_HEAD,
  MARK_FRAME_D, MARK_WHEELS, MARK_LINES, MARK_VIEWBOX_ATTR, markHeightFor,
} from '../brand/mark';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, SCREEN_WIDTH * 0.82);

export interface DrawerItem {
  /** Lucide icon name (e.g. 'User', 'Settings'). Resolved by the host app's Icon component. */
  icon:    string;
  label:   string;
  onPress?: () => void;
  /** Optional badge/counter on the right side (e.g. unread count). */
  badge?:  string | number;
  /** Style as a destructive item (red text + icon on a light plate). */
  danger?: boolean;
  /**
   * Optional group heading rendered above this item, shown only when it
   * differs from the previous item's. Lets a host app group a flat list
   * the way the Profile tab does, without every app having to.
   */
  section?: string;
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
    darkLabel: string;   // "Dark Mode": names what the switch controls
    /** @deprecated Unused. The row is always labelled darkLabel so the
     *  label and the switch state can never contradict each other. */
    lightLabel?: string;
  };

  /** Footer sign-out action. */
  signOut: { label: string; onPress: () => void };

  /**
   * Small print above Sign Out: version, and anything legal.
   *
   * The drawer ended at the theme toggle and then had roughly 40% of its
   * height empty before Sign Out, which reads as unfinished rather than
   * airy (founder, 2026-08-29: "dont forget the hambuger region").
   *
   * The Profile tab already solves this properly, ending with
   * "SEIRS Logistics v1.0.0" above its Sign Out, so the drawer borrows
   * its own app's answer rather than inventing one.
   */
  footerNote?: string;

  /** Theme tokens from the host app. */
  theme: DrawerThemeTokens;

  /**
   * Lucide icon component injected by the host app
   * (each app has its own thin Icon wrapper).
   */
  /**
   * Each app hands in its own Icon, and those registries are now typed:
   * business narrowed `name` to the keys it actually holds, so a wrong
   * name is a build error rather than a blank space (2026-09-05). A
   * component that accepts fewer names cannot be assigned to one
   * declared to accept every string, so the name is deliberately left
   * open HERE and enforced where icons are actually written. Nothing is
   * lost: DrawerItem.icon has always been a plain string.
   */
  Icon: ComponentType<{ name: any; size?: number; color?: string; strokeWidth?: number }>;
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
  visible, onClose, user, items, themeToggle, signOut, footerNote, theme, Icon,
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
            <React.Fragment key={`${item.label}-${idx}`}>
            {/*
              A section label whenever this item starts a new group.
              Six items in one flat list covered three different kinds of
              thing: features, help, and a setting. Profile groups its
              rows under ACCOUNT / ACTIVITY / SUPPORT and is much easier
              to scan for it (2026-08-29).
            */}
            {item.section && item.section !== items[idx - 1]?.section && (
              <Text style={[styles.sectionLabel, { color: theme.textThird }]}>
                {item.section}
              </Text>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.item,
                {
                  borderBottomColor: theme.border,
                  backgroundColor: pressed ? pressedBg : 'transparent',
                },
              ]}
              onPress={item.onPress}
            >
              {/*
                A danger row carries its icon on a light plate, the way
                Profile draws SOS. A thin red glyph on a dark row reads
                as decoration; the plate is what makes it findable when
                somebody is frightened and not reading.
              */}
              <View style={item.danger ? styles.dangerPlate : undefined}>
                <Icon
                  name={item.icon}
                  size={20}
                  color={item.danger ? dangerColor : theme.textSecond}
                  strokeWidth={item.danger ? 2.2 : 1.8}
                />
              </View>
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
            </React.Fragment>
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
              {/* The label names what the SWITCH controls, never where a
                  tap would take you. Showing "Light Mode" with the switch
                  ON while the app is plainly dark read as a straight
                  contradiction on the A30 (sweep 2026-08-23). "Dark Mode"
                  on = dark, off = light, true in both states. */}
              <Text style={[styles.itemLabel, { color: theme.text }]}>
                {themeToggle.darkLabel}
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

        {footerNote ? (
          <Text style={[styles.footerNote, { color: theme.textThird }]}>{footerNote}</Text>
        ) : null}

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
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.1,
    textTransform: 'uppercase',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6,
  },
  dangerPlate: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    marginLeft: -6,
  },
  footerNote: {
    fontSize: 11, textAlign: 'center',
    paddingHorizontal: 20, paddingBottom: 10,
  },
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
// Wordmark: "SEIRS" in the device system font (One UI Sans on Samsung,
// Roboto on Pixel, SF Pro on iOS): matches the splash look the founder
// chose. NOT a traced or bundled font.
//
// THE MARK WAS THE FIFTH COPY (found 2026-09-05, by the founder asking
// whether anybody had checked the drawer). It drew its own okada at
// stroke 3.5 with r6 wheels and the head at (28, 5), while the launcher
// icon, the splash, the website and the three in-app marks had all moved
// to the founder's locked A3 geometry. So the hamburger of every app
// showed an okada that existed nowhere else.
//
// Its comment said "matches SeirsMarkBold in the customer-app", which was
// true when written and false the moment that file changed. A comment
// claiming two things match is not a mechanism that keeps them matching,
// which is why the numbers now come from shared/brand/mark.ts, the same
// file scripts/build-mark-assets.js cuts the PNGs from.

function SeirsBrandLockup({ color, bgColor }: { color: string; bgColor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Svg width={48} height={markHeightFor(48)} viewBox={MARK_VIEWBOX_ATTR} fill="none">
        <Path d={MARK_FRAME_D}
              stroke={color} strokeWidth={MARK_SW} fill="none"
              strokeLinecap="round" strokeLinejoin="round"/>
        {MARK_WHEELS.map((w) => (
          <Circle key={`w${w.x}`} cx={w.x} cy={w.y} r={MARK_WHEEL_R} fill={color}/>
        ))}
        {MARK_LINES.map((l, i) => (
          <Line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                stroke={color} strokeWidth={MARK_SW} strokeLinecap="round"/>
        ))}
        <Circle cx={MARK_HEAD.x} cy={MARK_HEAD.y} r={MARK_HEAD_R} fill={color}/>
        {/* Hubs last, so they punch through the frame path's round cap. */}
        {MARK_WHEELS.map((w) => (
          <Circle key={`h${w.x}`} cx={w.x} cy={w.y} r={MARK_HUB_R} fill={bgColor}/>
        ))}
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
