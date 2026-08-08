import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Single image-backed hero card. Matches the "Joyn / Netflix featured
 * card" pattern: full-bleed image, dark gradient overlay at the bottom
 * for text readability, optional badge pill in the top-left, title +
 * description + chevron at the bottom.
 *
 * Image is `<Image>` with `resizeMode="cover"` so it always fills the
 * frame. If `imageUrl` is missing the card falls back to a navy gradient
 * so the layout still reads correctly while you source artwork.
 */

interface Props {
  imageUrl?:   string;
  badgeKey?:   string;       // i18n key for the small pill label
  badgeColor?: string;       // hex for the pill background
  titleKey?:   string;       // i18n key for the title
  descKey?:    string;       // i18n key for the description
  onPress?:    () => void;
}

export function HeroCardImage({
  imageUrl, badgeKey, badgeColor, titleKey, descKey, onPress,
}: Props) {
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.wrap,
        Shadows.navy,
        { backgroundColor: isDark ? '#0D1117' : '#0F2B4C' },
      ]}
    >
      {/* Background image — covers the whole card. */}
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={isDark ? ['#1C2128', '#0D1117'] : ['#0F2B4C', '#1A3A63']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Dark gradient over the bottom 60% so the title + desc read on
          any image. Top stays clear so the image can breathe. */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.10)', 'rgba(15,43,76,0.85)']}
        locations={[0, 0.4, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Badge pill (top-left) */}
      {badgeKey ? (
        <View style={[styles.badge, { backgroundColor: badgeColor ?? theme.accent }]}>
          <Text style={styles.badgeText}>{t(badgeKey)}</Text>
        </View>
      ) : null}

      {/* Title + description + chevron (bottom) */}
      <View style={styles.contentBlock}>
        {titleKey ? <Text style={styles.title} numberOfLines={2}>{t(titleKey)}</Text> : null}
        <View style={styles.descRow}>
          {descKey ? (
            <Text style={styles.desc} numberOfLines={2}>{t(descKey)}</Text>
          ) : <View style={{ flex: 1 }} />}
          {onPress ? (
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    height: 200,
    width: '100%',
  },
  badge: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeText: {
    color: '#0F2B4C',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  contentBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.md,
  },
  title: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: 4,
  },
  descRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  desc: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    lineHeight: 18,
  },
});
