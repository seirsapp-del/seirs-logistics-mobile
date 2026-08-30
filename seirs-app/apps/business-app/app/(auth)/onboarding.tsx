import { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions, FlatList,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { SeirsMarkBold, SeirsWordmark } from '@seirs/shared/components/SeirsLogoV2';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    key:     'bulk',
    icon:    'Package' as const,
    title:   'Ship in Bulk',
    body:    'Create multi-stop deliveries and send many packages in one booking, each with its own receiver and tracking code.',
    gradient: ['#0F2B4C', '#1a4070'] as [string, string],
  },
  {
    // Was "Business Wallet: fund once, dispatch many". That is the
    // pre-launch wallet model the founder killed (senders never hold
    // NGN, per CBN posture): the first screen a new business saw was
    // promising a product SEIRS does not offer. Receipts and points are
    // the true part, so they stay.
    key:     'wallet',
    icon:    'Receipt' as const,
    title:   'Every Naira Accounted',
    body:    'Pay per booking with your card. Itemised receipts on every delivery, and loyalty points on each one.',
    gradient: ['#1a3a5c', '#3A7BD5'] as [string, string],
  },
  {
    key:     'partner',
    icon:    'Store' as const,
    title:   'Partner Store',
    body:    'Operate a collection point. Manage incoming packages, scan QR codes, and earn weekly payouts.',
    gradient: ['#163050', '#0F2B4C'] as [string, string],
  },
  {
    key:     'team',
    icon:    'Users' as const,
    title:   'One Account, Many Branches',
    body:    'Ikeja, Lekki, Apapa: each dispatches independently from the same account, on one itemised statement.',
    gradient: ['#0F2B4C', '#0a1f38'] as [string, string],
  },
];

export default function OnboardingScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const flatRef  = useRef<FlatList>(null);
  const [idx, setIdx] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  // Auto-advance only while focused: the interval used to keep scrolling
  // the FlatList behind the pushed login screen forever (found in
  // driver-app live test 2026-08-10, same pattern here).
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    const timer = setInterval(() => {
      const next = (idx + 1) % SLIDES.length;
      flatRef.current?.scrollToIndex({ index: next, animated: true });
      setIdx(next);
    }, 4500);
    return () => clearInterval(timer);
  }, [idx, isFocused]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue:  idx,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [idx]);

  const slide = SLIDES[idx];

  return (
    <LinearGradient colors={slide.gradient} style={[styles.container, { paddingTop: insets.top }]}>
      {/* Brand lockup: the okada mark + wordmark on every first-touch
          screen across all SEIRS apps (founder direction 2026-08-09). */}
      <View style={styles.brandRow}>
        <SeirsMarkBold size={44} color="#fff" hubColor="#0F2B4C" />
        <SeirsWordmark size={92} color="#fff" />
        <Text style={styles.brandSub}>BUSINESS</Text>
      </View>
      <FlatList
        ref={flatRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.iconWrap}>
              <Icon name={item.icon} size={52} color="#fff" strokeWidth={1.4} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === idx && styles.dotActive]}
          />
        ))}
      </View>

      {/* Both options always visible: new users sign up, returning users sign in.
          Previously only one button showed per slide (Sign In on slides 0-2,
          Get Started on slide 3) which hid the sign-up path entirely if the
          user tapped Sign In before auto-advance reached the last slide. */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 24 }]}>
        {/* Generic "Sign Up" because Business Sender vs Partner Store
            is chosen on the registration screen, not here. */}
        {/* router.push (not replace) so phone back button returns to
            this onboarding screen instead of exiting the app. */}
        <Pressable style={styles.btn} onPress={() => router.push('/(auth)/register' as any)}>
          <Text style={styles.btnText}>Sign Up</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnOutline, { marginTop: 12 }]}
          onPress={() => router.push('/(auth)/login' as any)}
        >
          <Text style={[styles.btnText, styles.btnOutlineText]}>Sign In</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  brandRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 18 },
  brandSub:  { color: '#FFBE0B', fontSize: 12, fontWeight: '800', letterSpacing: 2, marginLeft: 2 },
  slide:     { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 40 },
  iconWrap:  {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 40,
  },
  title:     { fontSize: 28, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 16 },
  body:      { fontSize: 15, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 22 },
  dots:      { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 24 },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { width: 20, backgroundColor: '#fff' },
  cta:       { paddingHorizontal: 32 },
  btn:       {
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center',
  },
  btnText:       { color: '#0F2B4C', fontWeight: '700', fontSize: 16 },
  btnOutline:    { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)' },
  btnOutlineText: { color: '#fff' },
});
