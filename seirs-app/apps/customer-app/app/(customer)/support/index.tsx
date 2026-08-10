/**
 * Customer support hub. Redirects to the unified Messages tab so
 * users have a single inbox for driver chats + support tickets, then
 * a persistent header CTA to open a new ticket.
 *
 * Previously this was a separate list-of-tickets screen but that
 * created two "message inboxes": driver chats in the tab bar and
 * support here: which was confusing (users kept looking for support
 * in the Messages tab and finding nothing).
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function SupportRedirectScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  useEffect(() => {
    // Replace so back button skips this redirect and pops to whatever
    // opened it (drawer, help screen, deep link).
    const id = setTimeout(() => router.replace('/(customer)/(tabs)/messages' as any), 10);
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
