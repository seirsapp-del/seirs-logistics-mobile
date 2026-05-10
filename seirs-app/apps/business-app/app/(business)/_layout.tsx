import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

/**
 * Top-level business Stack — owns the back history.
 *
 *   (business)/
 *     _layout.tsx        <- Stack (this file)
 *     (tabs)/
 *       _layout.tsx      <- Tabs (Dashboard, Deliveries, Send, Wallet, Team)
 *     edit-profile.tsx   <- pushed onto the Stack
 *     csv-upload.tsx     <- pushed onto the Stack
 *     api-keys.tsx       <- pushed onto the Stack
 *     ...all detail screens
 *
 * Mirrors customer-app + driver-app's Tabs-inside-Stack pattern so the
 * Android back button pops to the previous detail screen, not Dashboard.
 */
export default function BusinessLayout() {
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

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
