import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

/**
 * Legacy loyalty screen redirect.
 *
 * The rewritten rewards catalogue lives at /(customer)/rewards with real
 * API-backed points, correct tier thresholds (0/1000/5000/15000), correct
 * earn-rate copy, and a working redemption flow. This file used to be a
 * separate screen with hardcoded MOCK values that misled users. Kept as
 * a bounce so any surviving deep link resolves to the correct screen.
 */
export default function LegacyLoyaltyRedirect() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  useEffect(() => {
    router.replace('/(customer)/rewards' as any);
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: theme.textSecond, fontSize: 14 }}>Opening rewards…</Text>
    </View>
  );
}
