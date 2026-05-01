import '@/i18n';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { Colors } from '@/constants/theme';
import { API_BASE } from '@/constants/config';
import { configureApi } from '@/services/api';
import * as Updates from 'expo-updates';

configureApi(API_BASE);

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
        router.replace('/(business)');
      } else if (businessRole === 'partner' && !inPartner) {
        router.replace('/(partner)');
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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <OTAUpdateChecker />
          <RootStack />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
