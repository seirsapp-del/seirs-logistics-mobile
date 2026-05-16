import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
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

configureApi(API_BASE);

configureErrorReporter({
  baseUrl: API_BASE,
  app: 'driver',
  appVersion: Constants.expoConfig?.version,
});
installGlobalErrorHandler();

function NavigationGuard() {
  const { isAuthenticated, role, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuth   = segments[0] === '(auth)';
    const inDriver = segments[0] === '(driver)';

    if (!isAuthenticated && !inAuth) {
      router.replace('/(auth)/onboarding');
      return;
    }

    if (isAuthenticated && !inDriver) {
      router.replace('/(driver)');
    }
  }, [isAuthenticated, role, isLoading, segments]);

  return null;
}

function RootStack() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <>
      <NavigationGuard />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(auth)"   options={{ headerShown: false }} />
        <Stack.Screen name="(driver)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
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
// before NavigationGuard's useEffect can redirect — visible as a brief
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
  // useTranslation() — otherwise t() is undefined and crashes the first
  // screen that uses it ("undefined is not a function").
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  if (!i18nReady) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
