import { StyleSheet, Text, type TextProps } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?:  string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({ style, lightColor, darkColor, type = 'default', ...rest }: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  return (
    <Text
      style={[
        { color },
        type === 'default'         && styles.default,
        type === 'title'           && styles.title,
        type === 'defaultSemiBold' && styles.semiBold,
        type === 'subtitle'        && styles.subtitle,
        type === 'link'            && styles.link,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default:  { fontSize: 16, lineHeight: 24 },
  semiBold: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  title:    { fontSize: 32, fontWeight: 'bold', lineHeight: 32 },
  subtitle: { fontSize: 20, fontWeight: 'bold' },
  link:     { fontSize: 16, lineHeight: 30, color: '#FF6B00' },
});
