import { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Radius, Spacing, FontSize } from '@/constants/theme';
import { tx } from '@/i18n/tx';

interface Props extends Omit<TextInputProps, 'secureTextEntry'> {
  // Optional: falls back to theme tokens when not supplied. Form screens
  // inside a card pass these explicitly so the field matches the card it
  // sits on.
  borderColor?:     string;
  backgroundColor?: string;
}

/**
 * The password field, with the show/hide toggle.
 *
 * Business was the only app still inlining this, which is how its login
 * ended up with a plain Eye where the other two show Eye/EyeOff, and with
 * field geometry that drifted from the email field above it. Same component
 * as customer and driver now, so the three cannot drift apart again.
 */
export function PasswordInput({ borderColor, backgroundColor, style, ...props }: Props) {
  const [show, setShow] = useState(false);
  const { isDark } = useTheme();
  const theme      = Colors[isDark ? 'dark' : 'light'];
  const Icon       = show ? EyeOff : Eye;
  const bg         = backgroundColor ?? theme.surfaceSecond;
  const border     = borderColor     ?? theme.border;

  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderColor: border }]}>
      <TextInput
        {...props}
        secureTextEntry={!show}
        style={[styles.input, { color: theme.text }, style]}
      />
      <Pressable
        onPress={() => setShow(v => !v)}
        hitSlop={8}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityLabel={show ? tx('auto.passwordinput.hidePassword', 'Hide password') : tx('auto.passwordinput.showPassword', 'Show password')}
      >
        <Icon size={18} color={theme.textSecond} strokeWidth={1.5} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Radius.lg matches the email field directly above it. Customer and
  // driver had Radius.md here against an lg email field, so two stacked
  // inputs had different corners; fixed in all three 2026-09-01.
  wrap:   { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.lg, borderWidth: 1.5, paddingLeft: Spacing.md, paddingRight: 4 },
  input:  { flex: 1, fontSize: FontSize.base },
  toggle: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
});
