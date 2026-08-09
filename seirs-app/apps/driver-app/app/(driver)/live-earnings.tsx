/**
 * Retired screen (founder decision 2026-08-09): the withdraw flow at
 * /withdrawal is the single real money-out path, rebuilt on the V8
 * earnings ledger + Flutterwave transfer. This route stays only as a
 * redirect so stale links resolve.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function LiveEarningsRedirectScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  useEffect(() => {
    const id = setTimeout(() => router.replace('/(driver)/withdrawal' as any), 10);
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
