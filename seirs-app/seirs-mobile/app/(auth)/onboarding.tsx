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
import { Colors, Spacing, Radius, FontSize, FontWeight, CLOUD_DANCER } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

const FEATURES = [
  { icon: 'flash',            text: 'Same-day delivery across Africa & Europe' },
  { icon: 'location',         text: 'Live GPS tracking on every package' },
  { icon: 'shield-checkmark', text: 'Insured & secured payments' },
];

export default function OnboardingScreen() {
  const router      = useRouter();
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const isDark      = colorScheme === 'dark';

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1B2A' }}>
      <StatusBar barStyle="light-content" />

      {/* Hero — full dark navy with floating elements */}
      <LinearGradient
        colors={['#0D1B2A', '#162D4A', '#0D1B2A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Decorative orbs */}
        <View style={[styles.orb1, { backgroundColor: 'rgba(244,96,12,0.15)' }]} />
        <View style={[styles.orb2, { backgroundColor: 'rgba(46,196,182,0.10)' }]} />

        {/* Logo */}
        <View style={styles.logoBlock}>
          <View style={styles.logoIconWrap}>
            <Ionicons name="cube" size={36} color="#F4600C" />
          </View>
          <Text style={styles.logoText}>SEIRS</Text>
          <Text style={styles.logoSub}>LOGISTICS</Text>
        </View>

        {/* Tagline */}
        <Text style={styles.tagline}>
          Deliver anything,{'\n'}anywhere — instantly.
        </Text>

        {/* Feature pills */}
        <View style={styles.pills}>
          {FEATURES.map((f) => (
            <View key={f.text} style={styles.pill}>
              <Ionicons name={f.icon as any} size={14} color="#F4600C" />
              <Text style={styles.pillText}>{f.text}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Bottom sheet */}
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: isDark ? '#141414' : CLOUD_DANCER,
          },
        ]}
      >
        <Text style={[styles.sheetTitle, { color: theme.text }]}>
          Fast. Reliable.{'\n'}Smart Delivery.
        </Text>
        <Text style={[styles.sheetSub, { color: theme.textSecond }]}>
          Connect with verified drivers, track packages in real time, and get the best price automatically.
        </Text>

        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.push('/(auth)/register')}
        >
          <LinearGradient
            colors={['#F4600C', '#D95209']}
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
          <Ionicons name="car" size={16} color="#F4600C" />
          <Text style={[styles.driverLinkText, { color: theme.primary }]}>
            Become a driver
          </Text>
          <Ionicons name="arrow-forward" size={14} color="#F4600C" />
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
    backgroundColor: 'rgba(244,96,12,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(244,96,12,0.3)',
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
