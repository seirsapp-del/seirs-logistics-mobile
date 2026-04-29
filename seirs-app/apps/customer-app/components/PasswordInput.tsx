import { useState } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet, TextInputProps } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius, Spacing, FontSize } from '@/constants/theme';

interface Props extends Omit<TextInputProps, 'secureTextEntry'> {
  borderColor: string;
  backgroundColor: string;
}

export function PasswordInput({ borderColor, backgroundColor, style, ...props }: Props) {
  const [visible]   = useState(false);
  const [show, setShow] = useState(false);
  const colorScheme = useColorScheme();
  const theme       = Colors[colorScheme ?? 'light'];

  return (
    <View style={[styles.wrap, { backgroundColor, borderColor }]}>
      <TextInput
        {...props}
        secureTextEntry={!show}
        style={[styles.input, { color: theme.text }, style]}
      />
      <Pressable onPress={() => setShow(v => !v)} hitSlop={8} style={styles.toggle}>
        <Text style={[styles.toggleText, { color: theme.textSecond }]}>
          {show ? '🙈' : '👁️'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:       { flexDirection: 'row', alignItems: 'center', height: 52, borderRadius: Radius.md, borderWidth: 1.5, paddingLeft: Spacing.md, paddingRight: 4 },
  input:      { flex: 1, fontSize: FontSize.base },
  toggle:     { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  toggleText: { fontSize: 18 },
});
