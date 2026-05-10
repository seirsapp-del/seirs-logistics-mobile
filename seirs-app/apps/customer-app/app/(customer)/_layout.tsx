import { Stack } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

/**
 * Top-level customer Stack — owns the back history.
 *
 *   (customer)/
 *     _layout.tsx       <- Stack (this file) — handles Android back button
 *     (tabs)/
 *       _layout.tsx     <- Tabs (5 bottom-bar screens)
 *     request.tsx       <- pushed onto the Stack
 *     send.tsx          <- pushed onto the Stack
 *     edit-profile.tsx  <- pushed onto the Stack
 *     ...all detail screens
 *
 * Why a Stack at the parent level: with the previous Tabs-only setup,
 * pressing the Android back button on a detail screen popped the user
 * back to the home tab instead of the previous screen. Wrapping the
 * tabs in a Stack restores natural back behaviour — the same pattern
 * Uber, Bolt, and DoorDash use. URLs don't change because (tabs) is a
 * route group.
 */
export default function CustomerLayout() {
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
      {/* Tabs group — the 5 bottom-bar screens render inside (tabs)/_layout.tsx */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* All other files in (customer)/ are auto-registered as Stack screens
          (request, send, edit-profile, payment/*, trip/*, etc.). No need to
          enumerate them here unless we want per-screen options. */}
    </Stack>
  );
}
