import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

export default function OnboardingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Hero section */}
      <View style={[styles.hero, { backgroundColor: theme.primary }]}>
        <View style={styles.logoWrapper}>
          <Text style={styles.logoText}>SEIRS</Text>
          <Text style={styles.logoSub}>Logistics</Text>
        </View>
        <Text style={styles.heroTagline}>Deliver anything,{'\n'}anywhere in Africa.</Text>

        {/* Decorative circles */}
        <View style={[styles.circle1, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
        <View style={[styles.circle2, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
      </View>

      {/* Bottom card */}
      <View style={[styles.card, { backgroundColor: theme.surface }, Shadows.lg]}>
        <Text style={[styles.title, { color: theme.text }]}>
          Fast. Reliable.{'\n'}Smart Delivery.
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecond }]}>
          Connect with drivers, track packages in real time, and get the best delivery price automatically.
        </Text>

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          onPress={() => router.push('/(auth)/register')}
        >
          <Text style={[styles.primaryBtnText, { color: theme.textOnPrimary }]}>
            Get Started
          </Text>
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, { borderColor: theme.border }]}
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
          <Text style={[styles.driverLinkText, { color: theme.primary }]}>
            Become a driver →
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    height: height * 0.48,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoText: {
    fontSize: 52,
    fontWeight: FontWeight.black,
    color: '#FFFFFF',
    letterSpacing: 8,
  },
  logoSub: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: -4,
  },
  heroTagline: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.medium,
    color: 'rgba(255,255,255,0.90)',
    textAlign: 'center',
    lineHeight: 28,
  },
  circle1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    bottom: -100,
    right: -80,
  },
  circle2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    top: -50,
    left: -60,
  },
  card: {
    flex: 1,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    marginTop: -Radius.xl,
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    lineHeight: 36,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.base,
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  primaryBtn: {
    height: 54,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  primaryBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  secondaryBtn: {
    height: 54,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  secondaryBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  driverLink: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  driverLinkText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
});
