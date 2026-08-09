/**
 * Business + partner support hub. Redirects to the unified Messages tab
 * so there is ONE inbox for driver chats + support tickets (same pattern
 * as customer-app and driver-app). Both the business drawer and the
 * partner-mode drawer land here; the new-ticket flow and ticket threads
 * keep their own routes, only the list view is unified.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';

export default function BusinessSupportRedirectScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

  useEffect(() => {
    const id = setTimeout(() => router.replace('/(business)/(tabs)/messages' as any), 10);
    return () => clearTimeout(id);
  }, [router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    </SafeAreaView>
  );
}
