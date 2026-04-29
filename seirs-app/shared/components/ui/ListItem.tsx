import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { Colors, Radius, FontSize, FontWeight, Spacing } from '../../theme/index';

interface ListItemProps {
  title:       string;
  subtitle?:   string;
  leftIcon?:   string;
  leftIconBg?: string;
  leftIconColor?: string;
  rightText?:  string;
  rightIcon?:  boolean;
  rightElement?: React.ReactNode;
  onPress?:    () => void;
  destructive?: boolean;
  showDivider?: boolean;
}

export function ListItem({
  title, subtitle,
  leftIcon, leftIconBg, leftIconColor,
  rightText, rightIcon = true, rightElement,
  onPress, destructive = false, showDivider = true,
}: ListItemProps) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  const titleColor = destructive ? theme.error : theme.text;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress && { opacity: 0.7 },
      ]}
    >
      {/* Left icon */}
      {leftIcon && (
        <View style={[
          styles.iconWrap,
          { backgroundColor: leftIconBg ?? theme.surfaceSecond },
        ]}>
          <Ionicons name={leftIcon as any} size={18} color={leftIconColor ?? theme.textSecond} />
        </View>
      )}

      {/* Text block */}
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>{title}</Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: theme.textSecond }]} numberOfLines={1}>{subtitle}</Text>
        )}
      </View>

      {/* Right */}
      {rightElement ?? (
        <>
          {rightText && (
            <Text style={[styles.rightText, { color: theme.textSecond }]}>{rightText}</Text>
          )}
          {rightIcon && onPress && (
            <Ionicons name="chevron-forward" size={16} color={theme.textThird} />
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textBlock: { flex: 1, gap: 2 },
  title:     { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  subtitle:  { fontSize: FontSize.sm },
  rightText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
