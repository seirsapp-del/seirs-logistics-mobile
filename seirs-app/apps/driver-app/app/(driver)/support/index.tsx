/**
 * Driver support hub. Redirects to the unified Messages tab so drivers
 * have ONE inbox for customer chats + support tickets (same pattern as
 * customer-app). The new-ticket flow and ticket threads keep their own
 * routes; only the list view is unified.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function DriverSupportRedirectScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  useEffect(() => {
    const id = setTimeout(() => router.replace('/(driver)/(tabs)/messages' as any), 10);
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
