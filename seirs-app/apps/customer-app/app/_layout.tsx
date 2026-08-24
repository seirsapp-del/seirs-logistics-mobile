import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRateCardSync } from '@/hooks/use-rate-card';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { DeletionPendingBanner } from '@/components/DeletionPendingBanner';
import { View } from 'react-native';
import { Colors } from '@/constants/theme';
import { API_BASE } from '@/constants/config';
import { configureApi } from '@/services/api';
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

// Wire the shared API service to this app's backend URL
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
// defaultProps is the supported way to set this app-wide but is not on
// RN's public types. Two @ts-ignore lines used to sit here, which also
// silenced any future error on these statements; a narrow cast keeps the
// type checking (sweep C-7.7).
type WithDefaultProps = { defaultProps?: Record<string, unknown> };
const textDefaults      = RNText as unknown as WithDefaultProps;
const textInputDefaults = RNTextInput as unknown as WithDefaultProps;
textDefaults.defaultProps = { ...(textDefaults.defaultProps ?? {}), maxFontSizeMultiplier: MAX_FONT_SCALE };
textInputDefaults.defaultProps = { ...(textInputDefaults.defaultProps ?? {}), maxFontSizeMultiplier: MAX_FONT_SCALE };

configureApi(API_BASE);

// Wire error reporting → backend /_telemetry/error → Sentry
configureErrorReporter({
  baseUrl: API_BASE,
  app: 'customer',
  appVersion: Constants.expoConfig?.version,
});
installGlobalErrorHandler();

function NavigationGuard() {
  const { isAuthenticated, role, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuth     = segments[0] === '(auth)';
    const inCustomer = segments[0] === '(customer)';

    if (!isAuthenticated && !inAuth) {
      router.replace('/(auth)/onboarding');
      return;
    }

    if (isAuthenticated && !inCustomer) {
      router.replace('/(customer)' as any);
    }
  }, [isAuthenticated, role, isLoading, segments]);

  return null;
}

function RootStack() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <NavigationGuard />
      {/* Persistent amber banner when the current user has a pending
          soft-delete. Renders above the stack so it stays visible on every
          screen until the user cancels or the grace window ends. */}
      <DeletionPendingBanner />
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="(auth)"     options={{ headerShown: false }} />
          <Stack.Screen name="(customer)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </View>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
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
  // Register the device push token once the user is authenticated. The
  // hook silently no-ops until expo-notifications is installed + a
  // native rebuild ships: see shared/hooks/usePushRegistration.ts.
  usePushRegistration(isAuthenticated);
  // Pull the live RateCard from backend on launch, cache in AsyncStorage,
  // refresh every 5 min. Until this resolves, fare calcs read the bundled
  // DEFAULT_RATE_CARD so the app prices correctly from the first frame.
  useRateCardSync();
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
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n()
      .then(() => setI18nReady(true))
      .catch(() => setI18nReady(true));
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
