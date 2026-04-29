import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const { height } = Dimensions.get('window');

const FEATURES = [
  { icon: 'flash',            text: 'Same-day delivery across Lagos, Abuja & PH' },
  { icon: 'location',         text: 'Live GPS tracking on every package' },
  { icon: 'shield-checkmark', text: 'Verified dispatch riders. Insured deliveries.' },
] as const;

export default function OnboardingScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';

  const heroBg    = isDark ? '#000000' : '#0B1D3A';
  const heroStart = isDark ? '#0A0A0A' : '#0B1D3A';
  const heroMid   = isDark ? '#1A0C00' : '#12306A';
  const heroEnd   = isDark ? '#0A0A0A' : '#0B1D3A';

  const primaryBtn1 = isDark ? '#FF6B00' : '#3A86FF';
  const primaryBtn2 = isDark ? '#C2410C' : '#1D6AE5';

  return (
    <View style={{ flex: 1, backgroundColor: heroBg }}>
      <StatusBar barStyle="light-content" />

      {/* Hero */}
      <LinearGradient
        colors={[heroStart, heroMid, heroEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Decorative orbs */}
        <View style={[styles.orb1, { backgroundColor: isDark ? 'rgba(255,107,0,0.12)' : 'rgba(58,134,255,0.15)' }]} />
        <View style={[styles.orb2, { backgroundColor: isDark ? 'rgba(0,194,255,0.08)' : 'rgba(46,196,182,0.10)' }]} />

        {/* Logo */}
        <View style={styles.logoBlock}>
          <View style={[
            styles.logoIconWrap,
            {
              backgroundColor: isDark ? 'rgba(255,107,0,0.12)' : 'rgba(58,134,255,0.15)',
              borderColor:     isDark ? 'rgba(255,107,0,0.30)' : 'rgba(58,134,255,0.30)',
            },
          ]}>
            <Ionicons name="cube" size={36} color={isDark ? '#FF6B00' : '#3A86FF'} />
          </View>
          <Text style={styles.logoText}>SEIRS</Text>
          <Text style={styles.logoSub}>LOGISTICS</Text>
        </View>

        {/* Tagline */}
        <Text style={styles.tagline}>
          Nigeria's fastest{'\n'}delivery platform.
        </Text>

        {/* Feature pills */}
        <View style={styles.pills}>
          {FEATURES.map((f) => (
            <View key={f.text} style={styles.pill}>
              <Ionicons name={f.icon} size={14} color={isDark ? '#FF6B00' : '#3A86FF'} />
              <Text style={styles.pillText}>{f.text}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Bottom sheet */}
      <View
        style={[
          styles.sheet,
          { backgroundColor: isDark ? '#0A0A0A' : '#FFFFFF' },
        ]}
      >
        <Text style={[styles.sheetTitle, { color: theme.text }]}>
          Fast. Reliable.{'\n'}Smart Delivery.
        </Text>
        <Text style={[styles.sheetSub, { color: theme.textSecond }]}>
          Connect with verified dispatch riders, track packages in real time, and get the best price automatically.
        </Text>

        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.push('/(auth)/register')}
        >
          <LinearGradient
            colors={[primaryBtn1, primaryBtn2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryBtnGradient}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
            I already have an account
          </Text>
        </Pressable>

        <Pressable
          style={styles.driverLink}
          onPress={() => router.push('/(auth)/driver-register')}
        >
          <Ionicons name="bicycle" size={16} color={theme.primary} />
          <Text style={[styles.driverLinkText, { color: theme.primary }]}>
            Become a dispatch rider
          </Text>
          <Ionicons name="arrow-forward" size={14} color={theme.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: height * 0.52,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    paddingHorizontal: Spacing.xl,
  },
  orb1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: -80,
    right: -100,
  },
  orb2: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    bottom: -60,
    left: -80,
  },
  logoBlock: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  logoText: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.black,
    color: '#FFFFFF',
    letterSpacing: 6,
  },
  logoSub: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 5,
    marginTop: 2,
  },
  tagline: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: Spacing.xl,
  },
  pills: {
    gap: Spacing.sm,
    width: '100%',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pillText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flex: 1,
  },

  sheet: {
    flex: 1,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    marginTop: -Radius.xl,
  },
  sheetTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    lineHeight: 36,
    marginBottom: Spacing.sm,
  },
  sheetSub: {
    fontSize: FontSize.base,
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },

  primaryBtn: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    gap: Spacing.sm,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },

  secondaryBtn: {
    height: 56,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
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
    paddingVertical: Spacing.sm,
  },
  driverLinkText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
});
