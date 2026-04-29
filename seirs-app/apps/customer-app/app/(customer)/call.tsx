import {
  View, Text, Pressable, StyleSheet, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { MOCK_DRIVERS } from '@/constants/mockData';

export default function CallDriverScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const params  = useLocalSearchParams<{ driverId: string }>();

  const driver  = MOCK_DRIVERS.find(d => d.id === params.driverId) ?? MOCK_DRIVERS[0];

  const [seconds, setSeconds]  = useState(0);
  const [muted,   setMuted]    = useState(false);
  const [speaker, setSpeaker]  = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={isDark ? ['#000000', '#1A0C00', '#000000'] : ['#0B1D3A', '#3A86FF', '#0B1D3A']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.container}>

          {/* Back */}
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>

          {/* Driver info */}
          <View style={styles.centerBlock}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarRing2}>
                <Avatar name={driver.name} size={100} />
              </View>
            </View>
            <Text style={styles.driverName}>{driver.name}</Text>
            <Text style={styles.driverSub}>{driver.vehicleType} · {driver.plate}</Text>
            <Text style={styles.timer}>{formatTime(seconds)}</Text>
            <Text style={styles.callStatus}>Call connected</Text>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <View style={styles.controlRow}>
              <Pressable
                style={[styles.controlBtn, muted && styles.controlBtnActive]}
                onPress={() => setMuted(!muted)}
              >
                <Ionicons name={muted ? 'mic-off' : 'mic-outline'} size={24} color="#fff" />
                <Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
              </Pressable>
              <Pressable
                style={[styles.controlBtn, speaker && styles.controlBtnActive]}
                onPress={() => setSpeaker(!speaker)}
              >
                <Ionicons name={speaker ? 'volume-high' : 'volume-medium-outline'} size={24} color="#fff" />
                <Text style={styles.controlLabel}>Speaker</Text>
              </Pressable>
              <Pressable style={styles.controlBtn} onPress={() => router.push({ pathname: '/(customer)/messages/[chatId]', params: { chatId: 'chat1' } })}>
                <Ionicons name="chatbubble-outline" size={24} color="#fff" />
                <Text style={styles.controlLabel}>Message</Text>
              </Pressable>
            </View>

            {/* End call */}
            <Pressable style={styles.endCallBtn} onPress={() => router.back()}>
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
            <Text style={styles.endCallText}>End Call</Text>
          </View>

        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  backBtn:   { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', marginTop: Spacing.sm },

  centerBlock: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  avatarRing:  { width: 132, height: 132, borderRadius: 66, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm },
  avatarRing2: { width: 116, height: 116, borderRadius: 58, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  driverName:  { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: '#fff' },
  driverSub:   { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)' },
  timer:       { fontSize: FontSize['3xl'], fontWeight: FontWeight.bold, color: '#fff', letterSpacing: 2, marginTop: Spacing.md },
  callStatus:  { fontSize: FontSize.sm, color: '#22C55E', fontWeight: FontWeight.semibold },

  controls:    { alignItems: 'center', gap: Spacing.lg },
  controlRow:  { flexDirection: 'row', gap: Spacing.xl },
  controlBtn:  { alignItems: 'center', gap: 6, width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
  controlBtnActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  controlLabel:{ color: 'rgba(255,255,255,0.85)', fontSize: FontSize.xs },
  endCallBtn:  { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
  endCallText: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.sm },
});
