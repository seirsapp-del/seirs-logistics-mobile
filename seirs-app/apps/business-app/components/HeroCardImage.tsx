import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SeirsMarkBold } from '@/components/SeirsLogoV2';
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
 * frame.
 *
 * ── THE LARGE EMPTY BLOCK (found on device 2026-08-24) ────────────────
 * The founder opened the business dashboard and the "Send many packages
 * in one run" slide showed roughly 250px of nothing above its text, on
 * the first screen of the app, so it read as broken.
 *
 * Nothing was missing and no URL was dead. The card is a fixed 200px
 * tall with its title and description absolutely positioned at the
 * bottom, so about 150px of it is always image area. The built-in
 * fallback cards in constants/heroCards.ts deliberately carry NO
 * imageUrl (see the walrus/pine-forest note in that file: random stock
 * photos were brand damage), and this component's fallback was a flat
 * gradient. In dark mode that gradient ran #1C2128 to #0D1117, which is
 * the dark background colour, so the reserved area was not merely plain,
 * it was invisible. The card looked like a caption floating in a hole.
 *
 * Two fixes, both here:
 *   1. The imageless fallback now carries the SEIRS okada mark as a
 *      watermark, so the reserved space has a subject and the card reads
 *      as designed rather than unfinished. Same treatment customer-app
 *      uses, so the two apps' carousels stay one design.
 *   2. A CMS card whose imageUrl 404s used to leave the same hole, since
 *      a failed <Image> renders nothing at all. onError now drops it back
 *      onto the branded fallback instead of a bare rectangle.
 */

interface Props {
  imageUrl?:   string;
  badgeKey?:   string;       // i18n key for the small pill label
  badgeColor?: string;       // hex for the pill background
  titleKey?:   string;       // i18n key for the title
  descKey?:    string;       // i18n key for the description
  // Raw text from the CMS. Wins over the matching *Key prop: admin-authored
  // copy is already in its final wording and must not go through i18next
  // (a title containing a colon would be read as a namespace lookup).
  badge?:      string;
  title?:      string;
  desc?:       string;
  onPress?:    () => void;
}

export function HeroCardImage({
  imageUrl, badgeKey, badgeColor, titleKey, descKey, badge, title, desc, onPress,
}: Props) {
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

  const badgeText = badge ?? (badgeKey ? t(badgeKey) : undefined);
  const titleText = title ?? (titleKey ? t(titleKey) : undefined);
  const descText  = desc  ?? (descKey  ? t(descKey)  : undefined);

  // A CMS image that will not load must not leave a hole. Reset on a new
  // url so a card that failed once is retried when the admin fixes it.
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [imageUrl]);
  const showImage = !!imageUrl && !imageFailed;

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
      {/* Background image: covers the whole card. */}
      {showImage ? (
        <Image
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <>
          <LinearGradient
            colors={isDark ? ['#1C2128', '#0D1117'] : ['#0F2B4C', '#1A3A63']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* The okada, watermarked into the space the layout reserves
              for artwork. Nudged up because the bottom of the card is
              spoken for by the title and description. pointerEvents none
              so it never eats the tap that opens the article. */}
          <View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              alignItems: 'center', justifyContent: 'center',
              opacity: 0.14, transform: [{ translateY: -14 }],
            }}
          >
            <SeirsMarkBold size={190} color="#FFFFFF" hubColor="#0F2B4C" />
          </View>
        </>
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
      {badgeText ? (
        <View style={[styles.badge, { backgroundColor: badgeColor ?? theme.accent }]}>
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      ) : null}

      {/* Title + description + chevron (bottom) */}
      <View style={styles.contentBlock}>
        {titleText ? <Text style={styles.title} numberOfLines={2}>{titleText}</Text> : null}
        <View style={styles.descRow}>
          {descText ? (
            <Text style={styles.desc} numberOfLines={2}>{descText}</Text>
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
