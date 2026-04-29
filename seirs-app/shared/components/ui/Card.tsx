import { View, StyleSheet, ViewStyle } from 'react-native';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { Colors, Radius, Shadows, Spacing } from '../../theme/index';

interface CardProps {
  children: React.ReactNode;
  style?:   ViewStyle;
  padding?: number;
  shadow?:  'none' | 'xs' | 'sm' | 'md' | 'lg';
  radius?:  number;
}

export function Card({ children, style, padding = Spacing.md, shadow = 'sm', radius = Radius.lg }: CardProps) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  const shadowStyle = shadow === 'none' ? {} : Shadows[shadow];

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderRadius: radius, padding },
        shadowStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});
