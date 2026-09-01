import { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  Animated, Linking, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { SeirsMarkBold } from '@seirs/shared/components/SeirsLogoV2';
import { useTheme } from '@/context/ThemeContext';
import { Colors } from '@/constants/theme';

/**
 * Brought in line with the customer app (founder direction 2026-09-01).
 *
 * The business carousel had drifted into its own look: a yellow "BUSINESS"
 * wordmark, a much lighter gradient that washed the white text out, dots
 * stranded above the buttons, and two bare buttons floating on the gradient
 * with nothing anchoring them. Side by side with the customer app it read as
 * a different product.
 *
 * Copied from customer: the wordmark treatment (now grey, not yellow), the
 * darker gradient range, dot placement and behaviour, the bottom sheet, and
 * the three actions. "Become a Driver" is deliberately kept on the business
 * app too: a business owner is as likely to know a rider as anyone, and it
 * is a recruitment channel we were not using.
 *
 * Kept as-is: the slide icons and the Title Case headlines, which the founder
 * chose to leave alone.
 */
const SLIDE_DURATION = 4500;

const SLIDES = [
  {
    key:     'bulk',
    icon:    'Package' as const,
    title:   'Many Packages, One Booking',
    body:    'Each with its own receiver, its own tracking code, and its own photo.',
    gradient: ['#0F2B4C', '#1A3A63'] as [string, string],
  },
  {
    // Was "Business Wallet: fund once, dispatch many". That is the
    // pre-launch wallet model the founder killed (senders never hold
    // NGN, per CBN posture): the first screen a new business saw was
    // promising a product SEIRS does not offer. Receipts and points are
    // the true part, so they stay.
    key:     'wallet',
    icon:    'Receipt' as const,
    title:   'Pay As You Send',
    body:    'Card, transfer or USSD per booking, with an itemised receipt each time.',
    gradient: ['#0A1E36', '#235A9C'] as [string, string],
  },
  {
    key:     'tracking',
    icon:    'MapPin' as const,
    title:   'See Every Package Land',
    body:    'Live tracking, and a proof photo the moment each one is delivered.',
    gradient: ['#0F2B4C', '#1E4A80'] as [string, string],
  },
  {
    key:     'cargo',
    icon:    'Truck' as const,
    title:   'Move A Full Load',
    body:    'Farm produce, building materials or a house move, on a vehicle that fits.',
    gradient: ['#0A1E36', '#2D72CC'] as [string, string],
  },
  {
    /**
     * Interstate was missing entirely from the business carousel, which is
     * odd for the audience most likely to need it: a trader moving stock
     * between states, not a Lagos-to-Yaba drop. The customer app's version
     * of this slide sells a SEAT ("buy a seat with a driver already
     * going"); a business is sending goods, so the promise is a priced run
     * rather than a ride.
     */
    key:     'interstate',
    icon:    'Route' as const,
    title:   'Send It To Another State',
    body:    'Interstate runs priced up front, with the same tracking and proof.',
    gradient: ['#0F2B4C', '#1E4A80'] as [string, string],
  },
  {
    key:     'partner',
    icon:    'Store' as const,
    title:   'Your Shop, Our Network',
    body:    'Run a partner store: take packages in, scan them out, and earn on every one.',
    gradient: ['#0F2B4C', '#1A3A63'] as [string, string],
  },
  {
    key:     'recurring',
    icon:    'Repeat' as const,
    title:   'Send the Same Run Again',
    body:    'Save a delivery you make often and repeat it in a couple of taps.',
    gradient: ['#0A1E36', '#235A9C'] as [string, string],
  },
];

export default function OnboardingScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const [idx, setIdx] = useState(0);
  /**
   * Crossfade, matching the customer app (founder 2026-09-01: "the customers
   * app have a much smooth feeling"). useNativeDriver keeps it on the UI
   * thread, so it does not stutter while Metro or the JS thread is busy.
   */
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

  const goToSlide = (i: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setIdx(i);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    });
  };

  // Auto-advance only while focused: the timer used to keep running behind
  // the pushed login screen forever (found in driver-app live test
  // 2026-08-10, same pattern here).
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    timerRef.current = setTimeout(() => {
      goToSlide((idx + 1) % SLIDES.length);
    }, SLIDE_DURATION);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [idx, isFocused]);

  /**
   * A driver account cannot be created from in here: the SEIRS ID has to be
   * minted by the app you register in, so this opens the store listing
   * rather than a cross-app signup form.
   */
  const handleBecomeDriver = () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/app/seirs-driver'
      : 'https://play.google.com/store/apps/details?id=co.seirs.driver';
    Linking.openURL(url).catch(() => {});
  };

  const slide   = SLIDES[idx];
  const sheetBg = isDark ? '#161B22' : '#FFFFFF';

  return (
    <View style={{ flex: 1, backgroundColor: slide.gradient[0] }}>
      {/* The gradient sits INSIDE the fading view so the background moves
          with the content. It used to be outside, which meant the colour
          snapped while the slide scrolled: two motions at once, which is
          what read as cheap. */}
      <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
      <LinearGradient
        colors={slide.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Brand lockup: the okada mark + wordmark on every first-touch
            screen across all SEIRS apps (founder direction 2026-08-09).
            Grey, matching the customer app: the yellow was the only place
            that treatment appeared anywhere in SEIRS. */}
        <SafeAreaView style={styles.topBar} edges={['top']}>
          <View style={styles.logoRow}>
            <SeirsMarkBold size={40} color="#FFFFFF" hubColor={slide.gradient[0]} />
            <Text style={styles.logoText}>SEIRS</Text>
            {/* "Business & Partners", matching what login.tsx and
                forgot-password.tsx already say. Partner stores had no
                presence in the lockup even though slide 6 sells them
                (founder 2026-09-01). */}
            <Text style={styles.logoSub}>BUSINESS &amp; PARTNERS</Text>
          </View>
        </SafeAreaView>

        <View style={styles.slide}>
          {/* The business icon treatment is deliberately unchanged. */}
          <View style={styles.iconWrap}>
            <Icon name={slide.icon} size={52} color="#fff" strokeWidth={1.4} />
          </View>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
        </View>

        {/* Dots sit under the copy, not stranded above the buttons, and are
            tappable so somebody can go back to a slide they missed. */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Pressable key={i} onPress={() => goToSlide(i)} hitSlop={8}>
              <View
                style={[
                  styles.dot,
                  i === idx
                    ? { backgroundColor: '#FFFFFF',               width: 24 }
                    : { backgroundColor: 'rgba(255,255,255,0.35)', width: 8 },
                ]}
              />
            </Pressable>
          ))}
        </View>
      </LinearGradient>
      </Animated.View>

      {/* Bottom sheet, fixed across all slides. Anchors the actions instead
          of leaving them floating on the gradient. */}
      <View style={[styles.sheet, { backgroundColor: sheetBg, paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
        {/* Generic "Create an Account" because Business Sender vs Partner
            Store is chosen on the registration screen, not here.
            router.push (not replace) so the phone back button returns here
            instead of exiting the app. */}
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: '#0F2B4C' }]}
          onPress={() => router.push('/(auth)/register' as any)}
        >
          <Text style={styles.primaryBtnText}>Create an Account</Text>
          <Icon name="ChevronRight" size={18} color="#FFFFFF" strokeWidth={2.5} />
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, { borderColor: theme.border }]}
          onPress={() => router.push('/(auth)/login' as any)}
        >
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
            I Already Have an Account
          </Text>
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, { borderColor: theme.border }]}
          onPress={handleBecomeDriver}
        >
          <View style={styles.secondaryRow}>
            <Icon name="Truck" size={16} color={theme.text} strokeWidth={2} />
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
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    zIndex: 2,
  },
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoText: { fontSize: 14, fontWeight: '900', color: '#FFFFFF', letterSpacing: 4 },
  logoSub:  { fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginTop: 1 },
  slide:    { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconWrap: {
    width: 88, height: 88, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 40,
  },
  title:    { fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 16 },
  body:     { fontSize: 15, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  dots:     { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  dot:      { height: 8, borderRadius: 999 },
  sheet: {
    paddingHorizontal: 32,
    paddingTop: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    gap: 12,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    height: 56,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '500' },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
