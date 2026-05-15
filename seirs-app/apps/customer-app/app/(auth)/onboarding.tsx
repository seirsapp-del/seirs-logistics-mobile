import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions,
  StatusBar, Animated, Platform, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import {
  Package, MapPin, Truck, Users, ShoppingBag, Store,
  ChevronRight,
} from 'lucide-react-native';

const { width: W, height: H } = Dimensions.get('window');

const SLIDES = [
  {
    id: 'brand',
    Icon: Truck,
    headline: "Nigeria's smartest\ndelivery platform.",
    sub: 'Fast, verified, insured. Built for every corner of Nigeria.',
    gradientStart: '#0F2B4C',
    gradientEnd:   '#1A3A63',
    accentColor:   '#3A7BD5',
  },
  {
    id: 'send',
    Icon: Package,
    headline: 'Send anything,\nanywhere. Instantly.',
    sub: 'Documents, parcels, food — handed off to a verified rider in minutes.',
    gradientStart: '#0A1E36',
    gradientEnd:   '#235A9C',
    accentColor:   '#58A6FF',
  },
  {
    id: 'track',
    Icon: MapPin,
    headline: 'Watch your delivery\nmove — live.',
    sub: 'Real-time map tracking. Know exactly where your package is at all times.',
    gradientStart: '#0F2B4C',
    gradientEnd:   '#1E4A80',
    accentColor:   '#79B8FF',
  },
  {
    id: 'ride',
    Icon: Users,
    headline: 'Share a ride.\nSplit the cost.',
    sub: 'Going the same direction? Join a driver already on that route and save.',
    gradientStart: '#0A1E36',
    gradientEnd:   '#2D72CC',
    accentColor:   '#58A6FF',
  },
  {
    id: 'business',
    Icon: ShoppingBag,
    headline: 'For traders, farmers,\nand businesses too.',
    sub: 'Bulk deliveries, agricultural produce, building materials — we handle it all.',
    gradientStart: '#0F2B4C',
    gradientEnd:   '#1A3A63',
    accentColor:   '#3A7BD5',
  },
  {
    id: 'partner',
    Icon: Store,
    headline: 'Drop-off points\neverywhere.',
    sub: 'Partner stores near you. Never miss a delivery — even if you\'re not home.',
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

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      const next = (current + 1) % SLIDES.length;
      goToSlide(next);
    }, SLIDE_DURATION);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current]);

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
              <Truck size={20} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.logoText}>SEIRS</Text>
              <Text style={styles.logoSub}>LOGISTICS</Text>
            </View>
          </SafeAreaView>

          {/* Slide icon */}
          <View style={[styles.iconWrap, { borderColor: `${slide.accentColor}40`, backgroundColor: `${slide.accentColor}18` }]}>
            <SlideIcon size={52} color={slide.accentColor} strokeWidth={1.5} />
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
      <View style={[styles.sheet, { backgroundColor: sheetBg, paddingBottom: insets.bottom + Spacing.md }]}>
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

        <Pressable style={styles.driverLink} onPress={handleBecomeDriver}>
          <Truck size={15} color={theme.accent} strokeWidth={2} />
          <Text style={[styles.driverLinkText, { color: theme.accent }]}>
            Become a Driver
          </Text>
          <ChevronRight size={13} color={theme.accent} strokeWidth={2.5} />
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
    paddingBottom: Spacing.xl,
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
    width: 110,
    height: 110,
    borderRadius: 32,
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
  driverLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  driverLinkText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
});
