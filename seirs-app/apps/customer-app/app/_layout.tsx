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
import { initI18n } from '@/i18n';

// Wire the shared API service to this app's backend URL
configureApi(API_BASE);

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
      router.replace('/(customer)');
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
        <Stack.Screen name="(auth)"     options={{ headerShown: false }} />
        <Stack.Screen name="(customer)" options={{ headerShown: false }} />
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
  const { isLoading } = useAuth();
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
    initI18n().then(() => setI18nReady(true));
  }, []);

  if (!i18nReady) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
