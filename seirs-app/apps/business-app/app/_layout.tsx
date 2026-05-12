import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { Colors } from '@/constants/theme';
import { API_BASE } from '@/constants/config';
import { configureApi, configureSessionStorageKey } from '@/services/api';
import * as Updates from 'expo-updates';
import { initI18n } from '@/i18n';
import { usePushRegistration } from '@seirs/shared/hooks/usePushRegistration';

configureApi(API_BASE);
// Business app stores session under a separate key so it can coexist with
// customer/driver tokens on a device that has multiple SEIRS apps installed.
configureSessionStorageKey('seirs_business_user');

function NavigationGuard() {
  const { isAuthenticated, businessRole, isLoading } = useAuth();
  const segments = useSegments();
  const router   = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuth    = segments[0] === '(auth)';
    const inBiz     = segments[0] === '(business)';
    const inPartner = segments[0] === '(partner)';

    if (!isAuthenticated && !inAuth) {
      router.replace('/(auth)/onboarding');
      return;
    }

    if (isAuthenticated) {
      if (businessRole === 'sender' && !inBiz) {
        router.replace('/(business)' as any);
      } else if (businessRole === 'partner' && !inPartner) {
        router.replace('/(partner)' as any);
      }
    }
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
// before NavigationGuard's useEffect can redirect — visible as a brief
// flash of the inside of the app on cold launch.
function AppContent() {
  const { isLoading, isAuthenticated } = useAuth();
  // Register the device push token once authenticated. No-op until
  // expo-notifications is installed + a native rebuild ships.
  usePushRegistration(isAuthenticated);
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
