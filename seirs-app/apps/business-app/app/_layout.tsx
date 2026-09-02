import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform, useColorScheme as useRNColorScheme } from 'react-native';
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
// Themed replacement for the Android system AlertDialog (work order
// item 4, 2026-08-24). Sits inside ThemeProvider because it reads the
// palette, and outside AuthProvider so a dialog can be raised from any
// screen including the signed-out ones.
import { SeirsDialogProvider } from '@/components/SeirsDialog';
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
import { useFonts } from 'expo-font';
import { installBrandFont } from '@seirs/shared/theme/brandFont';

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

/**
 * Inter, for every Text in the app.
 *
 * Installed at module scope so it is in place before the first render.
 * Nothing is drawn until the files themselves have loaded (see the gate
 * in RootLayout), so no screen ever asks for a family Android has not
 * registered yet.
 */
installBrandFont();

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
  /**
   * Register the device push token once authenticated.
   *
   * This call has been here since before expo-notifications was a
   * dependency of THIS app. It appeared to work on the dev laptop only
   * because the monorepo hoists the package up from customer-app and
   * driver-app, so the JS resolved and nobody noticed. In a clean EAS
   * release build for business the native module would never have been
   * linked and push would have died silently, with no crash to point at
   * it: the classic works-in-dev-breaks-in-release failure.
   *
   * Fixed 2026-08-24 by declaring `expo-notifications` in this app's own
   * package.json and adding its config plugin to app.json. Both are
   * NATIVE changes, so they do nothing until `npx expo run:android`
   * rebuilds this app. Until that rebuild ships, push on business is
   * still unverified.
   */
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


/**
 * Keep the Android system navigation bar in step with the app's theme.
 *
 * Without this Android paints it its own light grey regardless, which on a
 * dark-mode phone leaves a bright strip under a dark app (founder spotted it
 * 2026-09-01). Android-only: iOS has no such bar, and the calls no-op there.
 */
function SystemNavBar() {
  const scheme = useRNColorScheme();
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    /**
     * Ask the native registry FIRST.
     *
     * expo-navigation-bar is native, so a build made before it was added has
     * no such module, and a top-level import throws while the module is being
     * evaluated: at launch, taking the router and every route with it. That
     * is exactly how the document picker took the whole app down on
     * 2026-08-31, and this repeated it. On an older build the bar simply
     * stays as Android painted it.
     */
    if (!requireOptionalNativeModule('ExpoNavigationBar')) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const NavigationBar = require('expo-navigation-bar');
    const dark = scheme === 'dark';
    /**
     * Button style only. NOT setBackgroundColorAsync.
     *
     * The rebuild on 2 September finally put this native module in the APK,
     * and the first launch immediately warned:
     * "`setBackgroundColorAsync` is not supported with edge-to-edge enabled."
     *
     * Android 15 draws apps edge to edge, so the navigation bar is
     * transparent and shows whatever is behind it. Painting it is not just
     * unsupported, it is the wrong idea: the bar already picks up the
     * screen's own background, which is what "follows the theme" meant.
     *
     * What DOES need setting is the icon colour, or the three navigation
     * buttons are dark grey on a dark screen and effectively invisible.
     */
    NavigationBar.setButtonStyleAsync(dark ? 'light' : 'dark').catch(() => {});
  }, [scheme]);
  return null;
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

  // Inter, bundled. Held here rather than requested at run time so the app
  // reads the same on a handset with a FlipFont as on a stock one.
  const [fontsLoaded] = useFonts({
    'Inter-Regular':  require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium':   require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold':     require('../assets/fonts/Inter-Bold.ttf'),
    'Inter-Black':    require('../assets/fonts/Inter-Black.ttf'),
  });

  // The splash stays up for both. Rendering before the fonts register would
  // show one frame of the system font and then reflow the whole app.
  if (!i18nReady || !fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <SystemNavBar />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <SeirsDialogProvider>
              <AuthProvider>
                <AppContent />
              </AuthProvider>
            </SeirsDialogProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
