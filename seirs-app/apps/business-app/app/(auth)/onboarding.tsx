import { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions, FlatList,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    key:     'bulk',
    icon:    'Package' as const,
    title:   'Ship in Bulk',
    body:    'Create multi-stop deliveries, upload a CSV, and send hundreds of packages in minutes.',
    gradient: ['#0F2B4C', '#1a4070'] as [string, string],
  },
  {
    key:     'wallet',
    icon:    'Wallet' as const,
    title:   'Business Wallet',
    body:    'Fund once, dispatch many. Track every naira spent with itemised receipts and loyalty points.',
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
    title:   'Team Access',
    body:    'Add Managers and Dispatchers to your account. Everyone works together in one place.',
    gradient: ['#0F2B4C', '#0a1f38'] as [string, string],
  },
];

export default function OnboardingScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const flatRef  = useRef<FlatList>(null);
  const [idx, setIdx] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      const next = (idx + 1) % SLIDES.length;
      flatRef.current?.scrollToIndex({ index: next, animated: true });
      setIdx(next);
    }, 4500);
    return () => clearInterval(timer);
  }, [idx]);

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

      {/* CTA on last slide */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 24 }]}>
        {idx === SLIDES.length - 1 ? (
          <Pressable style={styles.btn} onPress={() => router.replace('/(auth)/register')}>
            <Text style={styles.btnText}>Get Started</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.btn, styles.btnOutline]}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={[styles.btnText, styles.btnOutlineText]}>Sign In</Text>
          </Pressable>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  slide:     { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 80 },
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
