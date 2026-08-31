/**
 * SeirsSheet: the themed replacement for Alert.alert on the driver app.
 *
 * Why this exists (founder, on device 2026-08-24): "why does this have
 * this grayish unstylied background and the green words, seems like less
 * effort design, and i have seen it around the entire app". He was
 * looking at Android's AlertDialog. React Native exposes no control over
 * its surface, typography, corner radius, button colour or layout, so
 * the SEIRS design system simply stopped at the edge of that box.
 *
 * The correctness reason is bigger than the cosmetic one. Android's
 * AlertDialog renders only THREE buttons and silently discards the rest:
 * React Native slices the array at 3 before it ever reaches the OS. Two
 * real bugs came from that on this screen alone:
 *
 *   - "Report a problem" passed five buttons, so Cancel and the whole
 *     "Unsafe or refused item" reason were never drawn. A rider could
 *     not report an unsafe item at all.
 *   - "Cancel this job?" passes six, so "I feel unsafe", the wrong
 *     booking type and "Customer unreachable" were all invisible.
 *
 * A list has no such limit, and vertical rows give a gloved thumb a real
 * target instead of a 40px uppercase word in a corner.
 *
 * Usage is declarative on purpose: hold one `SeirsSheetSpec | null` in
 * state, hand it to one <SeirsSheet>, and every call site becomes a
 * setState instead of another imperative dialog API to learn.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

export type SeirsSheetOption = {
  /** Row label. Keep it an answer to the title, not a verb like "OK". */
  label: string;
  /** Optional second line: why a driver would pick this row. */
  sub?: string;
  /**
   * primary     filled, the recommended path
   * default     outlined
   * destructive red text, for the row that cannot be undone
   */
  variant?: 'primary' | 'default' | 'destructive';
  /** Left-hand Ionicons glyph. Optional: most rows read fine without one. */
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
};

export type SeirsSheetSpec = {
  title: string;
  /** Body copy. Money in here must already be kobo-formatted by naira(). */
  message?: string;
  options: SeirsSheetOption[];
  /** Label for the dismiss row. Pass null to hide it entirely. */
  cancelLabel?: string | null;
  onCancel?: () => void;
};

export function SeirsSheet({
  spec,
  onClose,
}: {
  spec: SeirsSheetSpec | null;
  onClose: () => void;
}) {
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const insets = useSafeAreaInsets();

  /**
   * Same floor as the active-delivery footer. On a 3-button Samsung
   * insets.bottom reports 0 while the navigation bar is still there, so
   * the last row of a sheet sat under it and could not be tapped.
   */
  const bottomPad = Math.max(insets.bottom + 24, 56);

  // Close first, then run the handler, same order as choose(). Several
  // handlers navigate away, and running them first left onClose() setting
  // state on a screen that had already gone.
  const dismiss = () => {
    const after = spec?.onCancel;
    onClose();
    after?.();
  };

  const choose = (opt: SeirsSheetOption) => {
    onClose();
    opt.onPress?.();
  };

  const cancelLabel = spec?.cancelLabel === undefined ? 'Cancel' : spec.cancelLabel;

  return (
    <Modal
      visible={!!spec}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: bottomPad }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Grab handle. Purely an affordance: it tells a rider the
              backdrop is dismissable without adding a second Cancel. */}
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <Text style={[styles.title, { color: theme.text }]}>{spec?.title}</Text>
          {!!spec?.message && (
            <Text style={[styles.message, { color: theme.textSecond }]}>{spec.message}</Text>
          )}

          {/* Scrolls because the cancel-job sheet carries six reasons and
              a short phone in landscape would otherwise bury the last. */}
          <ScrollView
            style={styles.list}
            contentContainerStyle={{ paddingBottom: 2 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {(spec?.options ?? []).map((opt, i) => {
              const isPrimary = opt.variant === 'primary';
              const isDanger  = opt.variant === 'destructive';
              const tint      = isDanger ? theme.error : theme.text;
              return (
                <Pressable
                  key={`${opt.label}-${i}`}
                  onPress={() => choose(opt)}
                  style={({ pressed }) => [
                    isPrimary ? styles.rowPrimary : styles.row,
                    isPrimary
                      ? { backgroundColor: theme.primary }
                      : { borderColor: isDanger ? theme.error : theme.border },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  {!!opt.icon && (
                    <Ionicons
                      name={opt.icon}
                      size={20}
                      color={isPrimary ? '#fff' : tint}
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.rowLabel,
                        { color: isPrimary ? '#fff' : tint },
                        isPrimary && { textAlign: opt.icon ? 'left' : 'center' },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {!!opt.sub && (
                      <Text
                        style={[
                          styles.rowSub,
                          { color: isPrimary ? 'rgba(255,255,255,0.85)' : theme.textSecond },
                          isPrimary && { textAlign: opt.icon ? 'left' : 'center' },
                        ]}
                      >
                        {opt.sub}
                      </Text>
                    )}
                  </View>
                  {!isPrimary && (
                    <Ionicons name="chevron-forward" size={18} color={theme.textThird} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {cancelLabel !== null && (
            <Pressable
              style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.6 : 1 }]}
              onPress={dismiss}
            >
              <Text style={[styles.cancelText, { color: theme.textSecond }]}>{cancelLabel}</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    // A sheet taller than this stops reading as a sheet and starts
    // reading as a broken screen.
    maxHeight: '85%',
  },
  handle:  { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: Spacing.md },
  title:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any },
  message: { fontSize: FontSize.sm, lineHeight: 20, marginTop: 4 },
  list:    { marginTop: Spacing.md, flexGrow: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    // 16pt vertical plus the line box clears the 48dp Android minimum
    // with room for a glove.
    paddingVertical: 16, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderRadius: Radius.lg, marginBottom: Spacing.sm,
  },
  rowPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: 18, paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg, marginBottom: Spacing.sm,
  },
  rowLabel:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold as any },
  rowSub:     { fontSize: FontSize.xs, lineHeight: 17, marginTop: 2 },
  cancel:     { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  cancelText: { fontSize: FontSize.base, fontWeight: FontWeight.bold as any },
});
