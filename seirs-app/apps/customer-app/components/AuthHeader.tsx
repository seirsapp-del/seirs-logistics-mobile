import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SeirsMarkBold } from '@seirs/shared/components/SeirsLogoV2';
import { Palette, Spacing, FontSize, FontWeight } from '@/constants/theme';

/**
 * The branded bar that sits above every first-touch screen.
 *
 * Extracted 2026-09-01. The business app carries a navy strip with the
 * lockup across its whole auth flow, which is what makes it read as one
 * product; driver and customer had the lockup floating inside individual
 * screens, and on forgot-password it vanished entirely once the form was
 * submitted, leaving a bare page.
 *
 * Deliberately fixed navy in BOTH themes. Every other colour in these apps
 * is a theme token, but a brand bar that turns cream in light mode is not a
 * brand bar. Business made the same call.
 */
export function AuthHeader({ tag = null }: { tag?: string | null }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={[Palette.navy800, Palette.navy700]}
      style={[styles.bar, { paddingTop: insets.top + 24 }]}
    >
      <View style={styles.row}>
        <SeirsMarkBold size={40} color="#FFFFFF" hubColor={Palette.navy800} />
        <Text style={styles.brand}>SEIRS</Text>
        {tag ? <Text style={styles.tag}>{tag}</Text> : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bar:   { paddingBottom: 24, paddingHorizontal: Spacing.lg },
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  brand: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.black,
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  tag: {
    fontSize: 9,
    fontWeight: FontWeight.medium,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 3,
    marginTop: 1,
  },
});
