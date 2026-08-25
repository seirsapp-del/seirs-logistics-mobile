/**
 * One document tile: empty prompt, spinner while it uploads, thumbnail
 * with a tick once it is on file.
 *
 * WHY it is a component: the vehicle-change screen asks for the same five
 * proofs KYC already asks for, and the ownership form asks for two more.
 * Three private copies of "dashed box, camera glyph, green tick" is how
 * they drift into looking like three different products, and how a fix to
 * one of them silently misses the other two.
 *
 * It renders and nothing else. Picking the image, uploading it and
 * deciding what a failure means belong to the screen that owns the
 * document, because those answers differ per document.
 */
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

interface Props {
  label: string;
  /** Second line inside the empty tile. Dropped once there is an image. */
  hint?: string;
  /** Uploaded URL, or a local uri while it is still being sent. */
  url?: string | null;
  busy?: boolean;
  onPress: () => void;
  /** Read-only: an approved rider looking at what is already on file. */
  locked?: boolean;
  /**
   * Portrait tile sized to sit three-across in a row. Default is a short
   * full-width strip, which is what a single document wants.
   */
  tall?: boolean;
}

export function DocUploadTile({ label, hint, url, busy, onPress, locked = false, tall = false }: Props) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  return (
    <Pressable
      onPress={onPress}
      disabled={busy || locked}
      style={[
        tall ? styles.tall : styles.wide,
        {
          borderColor: url ? theme.success : theme.border,
          backgroundColor: theme.background,
          opacity: locked ? 0.7 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={theme.primary} />
      ) : url ? (
        <>
          <Image source={{ uri: url }} style={styles.img} />
          <View style={styles.check}>
            <Ionicons name="checkmark-circle" size={20} color={theme.success} />
          </View>
        </>
      ) : (
        <>
          <Ionicons name="camera-outline" size={tall ? 22 : 20} color={theme.textThird} />
          <Text style={[styles.label, { color: theme.text }]} numberOfLines={2}>{label}</Text>
          {!!hint && (
            <Text style={[styles.hint, { color: theme.textThird }]} numberOfLines={2}>{hint}</Text>
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tall: {
    flex: 1, aspectRatio: 0.85, borderRadius: Radius.lg, borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, overflow: 'hidden',
  },
  wide: {
    height: 92, borderRadius: Radius.lg, borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden',
    paddingHorizontal: Spacing.sm,
  },
  img:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  check: { position: 'absolute', top: 6, right: 6, backgroundColor: '#fff', borderRadius: 12 },
  label: { fontSize: FontSize.xs, fontWeight: FontWeight.bold as any, textAlign: 'center' },
  hint:  { fontSize: 10, lineHeight: 13, textAlign: 'center' },
});
