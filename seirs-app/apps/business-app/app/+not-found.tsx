import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function NotFound() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F2B4C', marginBottom: 8 }}>
        Page not found
      </Text>
      <Pressable onPress={() => router.replace('/(auth)/login' as any)}>
        <Text style={{ color: '#3A7BD5', fontSize: 14 }}>Go to login</Text>
      </Pressable>
    </View>
  );
}
