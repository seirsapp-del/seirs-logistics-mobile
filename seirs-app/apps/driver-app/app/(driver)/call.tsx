import {
  View, Text, Pressable, StyleSheet, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';

export default function DriverCallScreen() {
  const { name }  = useLocalSearchParams<{ name: string }>();
  const router    = useRouter();
  const cs        = useColorScheme();
  const theme     = Colors[cs ?? 'light'];
  const isDark    = cs === 'dark';

  const [seconds,  setSeconds]  = useState(0);
  const [muted,    setMuted]    = useState(false);
  const [speaker,  setSpeaker]  = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const callerName = name ?? 'Customer';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0A0A0A' : '#1C2B4A' }}>
      <StatusBar barStyle="light-content" />

      <View style={styles.content}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarRing}>
            <Avatar name={callerName} size={90} />
          </View>
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.callStatus}>{seconds < 5 ? 'Connecting…' : `On call · ${fmt(seconds)}`}</Text>
        </View>

        {/* Secondary controls */}
        <View style={styles.secondaryRow}>
          {[
            { icon: muted    ? 'mic-off'         : 'mic-outline',        label: muted    ? 'Unmute'   : 'Mute',    onPress: () => setMuted(m => !m),    active: muted    },
            { icon: speaker  ? 'volume-high'     : 'volume-medium-outline', label: speaker ? 'Speaker'  : 'Speaker', onPress: () => setSpeaker(s => !s),  active: speaker  },
            { icon: 'keypad-outline',                                        label: 'Keypad',                         onPress: () => {},                   active: false    },
          ].map(btn => (
            <Pressable
              key={btn.label}
              style={[styles.secBtn, btn.active && styles.secBtnActive]}
              onPress={btn.onPress}
            >
              <Ionicons name={btn.icon as any} size={24} color={btn.active ? '#fff' : 'rgba(255,255,255,0.8)'} />
              <Text style={[styles.secBtnLabel, { color: btn.active ? '#fff' : 'rgba(255,255,255,0.6)' }]}>{btn.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* End call */}
        <Pressable style={styles.endCallBtn} onPress={() => router.back()}>
          <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
        <Text style={styles.endCallLabel}>End Call</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'space-around', paddingVertical: Spacing.xl * 2 },

  avatarSection: { alignItems: 'center', gap: Spacing.md },
  avatarRing:    { width: 106, height: 106, borderRadius: 53, borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  callerName:    { color: '#fff', fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  callStatus:    { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.base },

  secondaryRow: { flexDirection: 'row', gap: Spacing.xl + 8 },
  secBtn:       { alignItems: 'center', gap: 8, padding: Spacing.md, borderRadius: Radius.xl, width: 80 },
  secBtnActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  secBtnLabel:  { fontSize: FontSize.xs },

  endCallBtn:   { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
  endCallLabel: { color: 'rgba(255,255,255,0.65)', fontSize: FontSize.sm, marginTop: -Spacing.md },
});
