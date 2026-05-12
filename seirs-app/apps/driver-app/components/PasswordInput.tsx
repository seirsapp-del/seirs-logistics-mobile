import { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius, Spacing, FontSize } from '@/constants/theme';

interface Props extends Omit<TextInputProps, 'secureTextEntry'> {
  // Optional — falls back to theme tokens when not supplied. Older form
  // screens (login, register) pass these to match surrounding card.
  // Newer screens (change-password, delete-account) rely on defaults.
  borderColor?:    string;
  backgroundColor?: string;
}

export function PasswordInput({ borderColor, backgroundColor, style, ...props }: Props) {
  const [show, setShow] = useState(false);
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];
  const Icon        = show ? EyeOff : Eye;
  const bg     = backgroundColor ?? theme.surfaceSecond;
  const border = borderColor     ?? theme.border;

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
        accessibilityLabel={show ? 'Hide password' : 'Show password'}
      >
        <Icon size={18} color={theme.textSecond} strokeWidth={1.5} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:   { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.md, borderWidth: 1.5, paddingLeft: Spacing.md, paddingRight: 4 },
  input:  { flex: 1, fontSize: FontSize.base },
  toggle: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
});
