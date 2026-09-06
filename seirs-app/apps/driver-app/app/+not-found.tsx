import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

export default function NotFoundScreen() {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  return (
    <>
      <Stack.Screen options={{ title: tr('auto.notFound.notFound', 'Not Found'), headerShown: false }} />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.code, { color: theme.textThird }]}>404</Text>
        <Text style={[styles.title, { color: theme.text }]}>{tx('auto.NotFound.screenNotFound', 'Screen not found')}</Text>
        <Link href="/" style={[styles.link, { color: theme.primary }]}>{tx('auto.NotFound.goToHome', 'Go to home')}</Link>
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
