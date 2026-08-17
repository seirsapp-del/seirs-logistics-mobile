import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { Colors } from '@/constants/theme';
import { API_BASE } from '@/constants/config';
import { configureApi, configureSessionStorageKey } from '@/services/api';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { initI18n } from '@/i18n';
import { usePushRegistration } from '@seirs/shared/hooks/usePushRegistration';
import { ErrorBoundary } from '@seirs/shared/components/ErrorBoundary';
import {
  configureErrorReporter,
  installGlobalErrorHandler,
  setReporterUserIdGetter,
} from '@seirs/shared/services/errorReporter';

// The LogBox banner floats above the tab bar and swallows taps on it
// (founder 2026-08-16: it ate a Profile tap mid-test). Dev-only UI,
// never shown in a release build; warnings still reach Metro.
LogBox.ignoreAllLogs(true);

import { Text as RNText, TextInput as RNTextInput } from 'react-native';

/**
 * Cap how far system font scaling can stretch the UI.
 *
 * At 1.5x the dashboard broke badly on device: headlines overlapped
 * their subtitles, "Stories" rendered as "Stor", "Send a Package" as
 * "Send a.", and every tab label truncated (tested 2026-08-17). Text
 * still grows for readers who need it, which matters, but stops before
 * it tears the layout apart. Raising this means auditing the
 * fixed-height rows first.
 */
const MAX_FONT_SCALE = 1.25;
// @ts-ignore defaultProps is the supported way to set this app-wide
RNText.defaultProps = { ...(RNText.defaultProps ?? {}), maxFontSizeMultiplier: MAX_FONT_SCALE };
// @ts-ignore
RNTextInput.defaultProps = { ...(RNTextInput.defaultProps ?? {}), maxFontSizeMultiplier: MAX_FONT_SCALE };

configureApi(API_BASE);
// Business app stores session under a separate key so it can coexist with
// customer/driver tokens on a device that has multiple SEIRS apps installed.
configureSessionStorageKey('seirs_business_user');

configureErrorReporter({
  baseUrl: API_BASE,
  app: 'business',
  appVersion: Constants.expoConfig?.version,
});
installGlobalErrorHandler();

function NavigationGuard() {
  const { isAuthenticated, businessRole, isLoading } = useAuth();
  const segments = useSegments();
  const router   = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuth    = segments[0] === '(auth)';
    // Deep-linked from the password-reset email (seirsbusiness://
    // reset-password?token=...). Must stay reachable while signed out.
    // Cast: expo-router's generated route union lags new files until
    // the dev server regenerates .expo/types.
    const inReset   = (segments[0] as string) === 'reset-password';

    if (!isAuthenticated && !inAuth && !inReset) {
      router.replace('/(auth)/onboarding');
      return;
    }

    // Signed in but still sitting on an auth screen: send them into the
    // app. This used to switch on businessRole === 'sender' | 'partner'
    // and silently did NOTHING for any other value. The backend also
    // issues 'owner' for the account owner, so owners tapped Sign In,
    // authenticated fine, and stayed on the login screen with no error
    // (found on device 2026-08-16). Anything that is not a partner lands
    // on the business side, which is home for every business account.
    if (isAuthenticated && !inReset && inAuth) {
      router.replace(businessRole === 'partner' ? '/(partner)' as any : '/(business)' as any);
    }
    // Deliberately no business <-> partner bouncing once inside: partner
    // is a capability of a business account, not a separate app, so the
    // user moves between the two themselves (drawer in, "Back to
    // business" out). The old rule fought those controls.
  }, [isAuthenticated, businessRole, isLoading, segments]);

  return null;
}

function RootStack() {
  const { theme: themeKey, isDark } = useTheme();
  const theme = Colors[themeKey];

  return (
    <>
      <NavigationGuard />
      <Stack
        screenOptions={{
          headerStyle:       { backgroundColor: theme.surface },
          headerTintColor:   theme.text,
          headerShadowVisible: false,
          contentStyle:      { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(auth)"     options={{ headerShown: false }} />
        <Stack.Screen name="(business)" options={{ headerShown: false }} />
        <Stack.Screen name="(partner)"  options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

function OTAUpdateChecker() {
  useEffect(() => {
    if (__DEV__) return;
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (_) {}
    })();
  }, []);
  return null;
}

// Renders nothing until AuthContext finishes loading the stored session.
// Without this gate, expo-router renders the default route for one frame
// before NavigationGuard's useEffect can redirect: visible as a brief
// flash of the inside of the app on cold launch.
function AppContent() {
  const { isLoading, isAuthenticated, user } = useAuth();
  // Register the device push token once authenticated. No-op until
  // expo-notifications is installed + a native rebuild ships.
  usePushRegistration(isAuthenticated);
  useEffect(() => {
    setReporterUserIdGetter(() => user?.id ?? null);
  }, [user?.id]);
  if (isLoading) return null;
  return (
    <>
      <OTAUpdateChecker />
      <RootStack />
    </>
  );
}

export default function RootLayout() {
  // Wait for i18next to finish loading before rendering anything that calls
  // useTranslation(): otherwise t() is undefined and crashes the first
  // screen that uses it ("undefined is not a function").
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    // A rejected init used to leave i18nReady false forever, which holds
    // the splash screen up with no error anywhere (founder 2026-08-16).
    // Render with fallback strings instead of never rendering at all.
    initI18n()
      .then(() => setI18nReady(true))
      .catch((e) => { console.warn('i18n init failed, continuing:', e?.message); setI18nReady(true); });
  }, []);

  if (!i18nReady) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <AppContent />
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
