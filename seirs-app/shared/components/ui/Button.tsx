import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle, View } from 'react-native';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { Colors, Radius, FontSize, FontWeight, Shadows, Spacing } from '../../theme/index';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?:   Variant;
  size?:      Size;
  loading?:   boolean;
  disabled?:  boolean;
  leftIcon?:  React.ReactNode;
  rightIcon?: React.ReactNode;
  style?:     ViewStyle;
  labelStyle?: TextStyle;
  fullWidth?: boolean;
}

export function Button({
  label, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false,
  leftIcon, rightIcon, style, labelStyle, fullWidth = false,
}: ButtonProps) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  const heights: Record<Size, number> = { sm: 40, md: 52, lg: 56 };
  const fontSizes: Record<Size, number> = { sm: FontSize.sm, md: FontSize.base, lg: FontSize.md };

  const getBg = () => {
    if (disabled) return theme.border;
    switch (variant) {
      case 'primary':   return theme.primary;
      // No `secondary` token on the SEIRS palette — falls back to the
      // brand accent (sky blue). No callers currently use variant="secondary",
      // but keeping the variant available for future use.
      case 'secondary': return theme.accent ?? '#2EC4B6';
      case 'danger':    return theme.error;
      case 'outline':
      case 'ghost':     return 'transparent';
    }
  };

  const getTextColor = () => {
    if (disabled) return theme.textThird;
    switch (variant) {
      case 'primary':
      case 'secondary':
      case 'danger':   return '#FFFFFF';
      case 'outline':
      case 'ghost':    return theme.primary;
    }
  };

  const getBorder = () => variant === 'outline' ? { borderWidth: 1.5, borderColor: theme.primary } : {};
  const getShadow = () => {
    if (disabled || variant === 'outline' || variant === 'ghost') return {};
    // Primary buttons get a colored drop shadow that picks up the brand
    // tone. Both modes use the sky-blue shadow since the brand sky-blue
    // accent reads on dark and light navy reads similarly in dark mode.
    if (variant === 'primary') return isDark ? Shadows.navy : Shadows.sky;
    return {};
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { height: heights[size], backgroundColor: getBg() },
        getBorder(),
        getShadow(),
        fullWidth && styles.fullWidth,
        pressed && !disabled && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <View style={styles.inner}>
          {leftIcon}
          <Text style={[styles.label, { fontSize: fontSizes[size], color: getTextColor() }, labelStyle]}>
            {label}
          </Text>
          {rightIcon}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  fullWidth: { width: '100%' },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },
});
