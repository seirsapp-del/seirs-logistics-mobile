import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize, FontWeight, Spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  return (
    <>
      <Stack.Screen options={{ title: 'Not Found', headerShown: false }} />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.code, { color: theme.textThird }]}>404</Text>
        <Text style={[styles.title, { color: theme.text }]}>Screen not found</Text>
        <Link href="/" style={[styles.link, { color: theme.primary }]}>Go to home</Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  code:      { fontSize: 64, fontWeight: FontWeight.bold },
  title:     { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  link:      { fontSize: FontSize.base, marginTop: Spacing.md },
});
