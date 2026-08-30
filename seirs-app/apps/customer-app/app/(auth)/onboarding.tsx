import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions,
  StatusBar, Animated, Platform, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { SeirsMarkBold } from '@/components/SeirsLogoV2';
import {
  Package, MapPin, Truck, Users, ShoppingBag, Store,
  ChevronRight,
} from 'lucide-react-native';

const { width: W, height: H } = Dimensions.get('window');

const SLIDES = [
  {
    id: 'brand',
    Icon: Truck,
    headline: "Send, ride, travel.",
    sub: 'Parcels, in-city rides and intercity seats, all in one app.',
    gradientStart: '#0F2B4C',
    gradientEnd:   '#1A3A63',
    accentColor:   '#3A7BD5',
  },
  {
    id: 'send',
    Icon: Package,
    headline: 'Sent by a verified rider.',
    sub: 'Documents, parcels, hot food or fragile goods, each on the right vehicle.',
    gradientStart: '#0A1E36',
    gradientEnd:   '#235A9C',
    accentColor:   '#58A6FF',
  },
  {
    id: 'track',
    Icon: MapPin,
    headline: 'See where it is.',
    sub: 'Live map tracking, and a proof photo the moment it lands.',
    gradientStart: '#0F2B4C',
    gradientEnd:   '#1E4A80',
    accentColor:   '#79B8FF',
  },
  {
    id: 'ride',
    Icon: Users,
    headline: 'Travelling between cities?',
    sub: 'Buy a seat with a driver already going, and pay for the leg you ride.',
    gradientStart: '#0A1E36',
    gradientEnd:   '#2D72CC',
    accentColor:   '#58A6FF',
  },
  {
    id: 'business',
    Icon: ShoppingBag,
    headline: 'Farm loads to house moves.',
    sub: 'Produce, building materials and machine parts, on a vehicle that fits.',
    gradientStart: '#0F2B4C',
    gradientEnd:   '#1A3A63',
    accentColor:   '#3A7BD5',
  },
  {
    id: 'partner',
    Icon: Store,
    headline: 'Collect on your time.',
    sub: 'Drop off or pick up at a partner store, whenever it suits you.',
    gradientStart: '#0A1E36',
    gradientEnd:   '#235A9C',
    accentColor:   '#79B8FF',
  },
] as const;

const SLIDE_DURATION = 4500;

export default function OnboardingScreen() {
  const router      = useRouter();
  const cs          = useColorScheme();
  const theme       = Colors[cs ?? 'light'];
  const isDark      = cs === 'dark';
  const insets      = useSafeAreaInsets();

  const [current, setCurrent] = useState(0);
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToSlide = (index: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setCurrent(index);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    });
  };

  // Auto-advance only while focused: the carousel used to keep animating
  // behind the pushed login screen forever (found in driver-app live test
  // 2026-08-10, same pattern here).
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    timerRef.current = setTimeout(() => {
      const next = (current + 1) % SLIDES.length;
      goToSlide(next);
    }, SLIDE_DURATION);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, isFocused]);

  const slide = SLIDES[current];
  const SlideIcon = slide.Icon;

  const handleBecomeDriver = () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/app/seirs-driver'
      : 'https://play.google.com/store/apps/details?id=com.seirs.driver';
    Linking.openURL(url).catch(() => {});
  };

  const sheetBg = isDark ? '#161B22' : '#FFFFFF';

  return (
    <View style={{ flex: 1, backgroundColor: slide.gradientStart }}>
      <StatusBar barStyle="light-content" />

      {/* ── Slide hero ─────────────────────────────────────────────────── */}
      <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
        <LinearGradient
          colors={[slide.gradientStart, slide.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <SafeAreaView style={styles.topBar} edges={['top']}>
            <View style={styles.logoRow}>
              {/* Okada brand mark on every first-touch screen across all
                  SEIRS apps (founder direction 2026-08-09). */}
              <SeirsMarkBold size={40} color="#FFFFFF" hubColor={slide.gradientStart} />
              <Text style={styles.logoText}>SEIRS</Text>
              <Text style={styles.logoSub}>LOGISTICS</Text>
            </View>
          </SafeAreaView>

          {/* Slide icon */}
          <View style={[styles.iconWrap, { borderColor: `${slide.accentColor}40`, backgroundColor: `${slide.accentColor}18` }]}>
            <SlideIcon size={44} color={slide.accentColor} strokeWidth={1.5} />
          </View>

          {/* Slide text */}
          <Text style={styles.headline}>{slide.headline}</Text>
          <Text style={styles.sub}>{slide.sub}</Text>

          {/* Progress dots */}
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <Pressable key={i} onPress={() => goToSlide(i)}>
                <View
                  style={[
                    styles.dot,
                    i === current
                      ? { backgroundColor: '#FFFFFF',      width: 24 }
                      : { backgroundColor: 'rgba(255,255,255,0.35)', width: 8 },
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </LinearGradient>
      </Animated.View>

      {/* ── Bottom sheet (fixed across all slides) ─────────────────────── */}
      {/* insets.bottom measures 0 on this 3-button Android nav layout, so the
          raw value puts the last CTA (Become a Driver) under the nav bar. The
          floor is what actually clears it (measured, request.tsx:376). */}
      <View style={[styles.sheet, { backgroundColor: sheetBg, paddingBottom: Math.max(insets.bottom, 24) + Spacing.md }]}>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: '#0F2B4C' }]}
          onPress={() => router.push('/(auth)/register' as any)}
        >
          <Text style={styles.primaryBtnText}>Create an Account</Text>
          <ChevronRight size={18} color="#FFFFFF" strokeWidth={2.5} />
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, { borderColor: theme.border }]}
          onPress={() => router.push('/(auth)/login' as any)}
        >
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
            I Already Have an Account
          </Text>
        </Pressable>

        {/* Founder 2026-08-10 (driver-app parity): full button like the
            two above, not a cramped text link under them. */}
        <Pressable
          style={[styles.secondaryBtn, { borderColor: theme.border }]}
          onPress={handleBecomeDriver}
        >
          <View style={styles.secondaryRow}>
            <Truck size={16} color={theme.text} strokeWidth={2} />
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
              Become a Driver
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  logoText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.black,
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  logoSub: {
    fontSize: 9,
    fontWeight: FontWeight.medium,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 3,
    marginTop: 1,
  },
  iconWrap: {
    width: 94,
    height: 94,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1.5,
  },
  headline: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: Spacing.md,
  },
  sub: {
    fontSize: FontSize.base,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: Radius.full,
  },
  sheet: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    marginTop: -Radius.xl,
    gap: Spacing.md,
  },
  primaryBtn: {
    height: 56,
    borderRadius: Radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  secondaryBtn: {
    height: 56,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
