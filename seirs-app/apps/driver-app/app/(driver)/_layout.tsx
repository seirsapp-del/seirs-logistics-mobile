import { Stack } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

/**
 * Top-level driver Stack — owns the back history.
 *
 *   (driver)/
 *     _layout.tsx       <- Stack (this file)
 *     (tabs)/
 *       _layout.tsx     <- Tabs (5 bottom-bar screens)
 *     active.tsx        <- pushed onto the Stack
 *     kyc.tsx           <- pushed onto the Stack
 *     job/[id].tsx      <- pushed onto the Stack
 *     ...all detail screens
 *
 * Mirrors customer-app's Tabs-inside-Stack pattern so Android back button
 * pops to the previous detail screen instead of the home tab.
 */
export default function DriverLayout() {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  return (
    <Stack
      screenOptions={{
        headerShown:        false,
        contentStyle:       { backgroundColor: theme.background },
        animation:          'slide_from_right',
        animationDuration:  220,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
