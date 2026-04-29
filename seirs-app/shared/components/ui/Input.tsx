import { View, Text, TextInput, StyleSheet, ViewStyle, TextInputProps } from 'react-native';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { Colors, Radius, FontSize, FontWeight, Spacing } from '../../theme/index';

interface InputProps extends TextInputProps {
  label?:      string;
  error?:      string;
  leftIcon?:   React.ReactNode;
  rightIcon?:  React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({ label, error, leftIcon, rightIcon, containerStyle, style, ...rest }: InputProps) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  const borderColor = error ? theme.error : theme.border;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && (
        <Text style={[styles.label, { color: theme.textSecond }]}>{label}</Text>
      )}
      <View style={[
        styles.inputRow,
        { backgroundColor: theme.surfaceSecond, borderColor },
        error && styles.errorBorder,
      ]}>
        {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
        <TextInput
          placeholderTextColor={theme.textThird}
          style={[styles.input, { color: theme.text }, style]}
          {...rest}
        />
        {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
      </View>
      {error && (
        <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.xs },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
  },
  errorBorder: { borderWidth: 1.5 },
  input: {
    flex: 1,
    fontSize: FontSize.base,
    height: '100%',
  },
  iconLeft:  { marginRight: Spacing.sm },
  iconRight: { marginLeft: Spacing.sm },
  errorText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
});
