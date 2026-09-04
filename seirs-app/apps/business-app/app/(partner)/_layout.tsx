import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

/**
 * Top-level partner Stack: owns the back history.
 *
 *   (partner)/
 *     _layout.tsx          <- Stack (this file)
 *     (tabs)/
 *       _layout.tsx        <- Tabs (Dashboard, Inventory, Scan, Earnings, Store)
 *     documents.tsx        <- pushed onto the Stack
 *     payout-account.tsx   <- pushed onto the Stack
 *     ...all detail screens
 *
 * WHY this file exists (founder, on the phone, 2026-09-03: every back
 * press returned to the partner dashboard rather than the previous
 * screen).
 *
 * (partner) declared Tabs as its group layout, so every route file in the
 * folder was a TAB rather than a pushed screen. Opening Documents from
 * Store Settings switched tabs; pressing back then went to the tab
 * navigator's initial route, which is the dashboard. There was no history
 * to pop because nothing had been pushed.
 *
 * It also forced a maintenance burden nobody could win: every detail
 * screen had to be declared with href: null to keep it out of the tab
 * bar, and two of them slipped through and shipped as tabs six and seven
 * with truncated labels and no icons.
 *
 * Tabs-inside-Stack is what (business), customer-app and driver-app all
 * already do, and (business)/_layout.tsx says so in its own comment. This
 * is that pattern, applied to the one group that never got it.
 *
 * Route paths are unchanged: (tabs) is a group, so it contributes nothing
 * to the URL and every existing router.push('/(partner)/...') still
 * resolves.
 */
export default function PartnerLayout() {
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

  return (
    <Stack
      screenOptions={{
        headerShown:       false,
        contentStyle:      { backgroundColor: theme.background },
        animation:         'slide_from_right',
        animationDuration: 220,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
