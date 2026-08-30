import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions,
  StatusBar, Animated, Platform, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import {
  Truck, Wallet, MapPin, Clock, Shield, Award,
  ChevronRight, Package,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { SeirsMarkBold } from '@seirs/shared/components/SeirsLogoV2';

const { width: W, height: H } = Dimensions.get('window');

// Driver-focused slides: different copy from customer onboarding but
// the same animated cross-fade pattern (gold-standard from customer-app).
/*
 * Copy corrected on device, 2026-08-30. Four of the six slides claimed
 * things the code does not do:
 *
 *   "insured" / "Insured trips" / "Every trip is covered"
 *       SEIRS does not insure anything. The insurance partners in admin
 *       are a DIRECTORY of external insurers a rider can buy from.
 *   "No waiting" / "withdraw anytime"
 *       Earnings land pending until availableAt, the minimum withdrawal
 *       is 1,000, daily caps apply, and a new rider has 10% held for 30
 *       days. Same false promise the website carried until last night.
 *   "Every customer is identity-verified"
 *       identityVerifiedAt is nullable and unverified users keep full
 *       access. Verification is a trust upgrade, not a gate.
 *   "Top drivers earn more. Period."
 *       Nothing in earnings.service reads a rating.
 *
 * The design, the slide count and the animation are untouched.
 */
const SLIDES = [
  {
    id: 'brand',
    Icon: Truck,
    headline: 'Drive with SEIRS.',
    sub: 'Deliveries, rides and intercity runs. Prices set by us, so you never haggle.',
    gradientStart: '#0F2B4C',
    gradientEnd:   '#1A3A63',
    accentColor:   '#3A7BD5',
  },
  {
    id: 'earnings',
    Icon: Wallet,
    headline: 'Paid to your bank.',
    sub: 'Earnings clear, then go out to your account in the next payout run.',
    gradientStart: '#0A1E36',
    gradientEnd:   '#235A9C',
    accentColor:   '#58A6FF',
  },
  {
    id: 'flex',
    Icon: Clock,
    headline: 'Online when you choose.',
    sub: 'No shifts, no quotas. Finish the job in your hand, then go.',
    gradientStart: '#0F2B4C',
    gradientEnd:   '#1E4A80',
    accentColor:   '#79B8FF',
  },
  {
    id: 'routes',
    Icon: MapPin,
    headline: 'Smart routing.',
    sub: 'Your drops come sorted into the order that keeps the distance down.',
    gradientStart: '#0A1E36',
    gradientEnd:   '#2D72CC',
    accentColor:   '#58A6FF',
  },
  {
    id: 'safety',
    Icon: Shield,
    headline: 'Every job on the record.',
    sub: 'Scans, photos and one-time codes at every handoff.',
    gradientStart: '#0F2B4C',
    gradientEnd:   '#1A3A63',
    accentColor:   '#3A7BD5',
  },
  {
    id: 'rewards',
    Icon: Award,
    headline: 'Your record travels.',
    sub: 'Ratings and completed trips follow you onto every job.',
    gradientStart: '#0A1E36',
    gradientEnd:   '#235A9C',
    accentColor:   '#79B8FF',
  },
] as const;

const SLIDE_DURATION = 4500;

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const [current, setCurrent] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToSlide = (index: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setCurrent(index);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    });
  };

  // Auto-advance only while this screen is focused. The carousel used to
  // keep cross-fading behind the pushed login screen forever (live test
  // 2026-08-10: visible sliding/jank while typing credentials on a
  // Samsung A30).
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

  // Cross-app conversion: someone downloaded the driver app but actually
  // wants to send a package: link them to the customer app's store page
  // so they end up in the right product.
  const handleSendPackage = () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/app/seirs-customer'
      : 'https://play.google.com/store/apps/details?id=co.seirs.customer';
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
              <Text style={styles.logoSub}>DRIVER</Text>
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
                      ? { backgroundColor: '#FFFFFF', width: 24 }
                      : { backgroundColor: 'rgba(255,255,255,0.35)', width: 8 },
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </LinearGradient>
      </Animated.View>

      {/* ── Bottom sheet (fixed across all slides) ─────────────────────── */}
      <View style={[styles.sheet, { backgroundColor: sheetBg, paddingBottom: Spacing.lg + insets.bottom }]}>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: '#0F2B4C' }]}
          onPress={() => router.push('/(auth)/driver-register' as any)}
        >
          <Text style={styles.primaryBtnText}>Become a Driver</Text>
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

        {/* Founder 2026-08-10: full button like the two above, not a
            cramped text link under them. */}
        <Pressable
          style={[styles.secondaryBtn, { borderColor: theme.border }]}
          onPress={handleSendPackage}
        >
          <View style={styles.secondaryRow}>
            <Package size={16} color={theme.text} strokeWidth={2} />
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
              I Just Want to Send a Package
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
