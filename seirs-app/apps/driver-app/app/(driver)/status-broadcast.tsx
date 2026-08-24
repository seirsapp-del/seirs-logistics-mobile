import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Wifi, AlertCircle, AlertTriangle, ChevronRight, CheckCircle } from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { driversApi } from '@/services/api';

// Spec V8 §2.14: quick three-button status broadcast. One tap posts a
// status the customer sees on their tracking screen.
//
// D-6.4 / D-9.1: this screen used to promise offline queuing ("queued
// locally and delivered when your connection comes back", "will retry
// until acknowledged", "logged offline every 30s and uploaded in
// batches"). None of that exists: send() is a bare await that alerts on
// failure, there is no NetInfo dependency and no AsyncStorage queue.
// A driver who lost signal in traffic was relying on a queue that was
// never built. The copy now says what the code actually does. If the
// queue is ever built, the copy can come back with it.

type Status = 'network' | 'traffic' | 'help';

// Wire-level type matches DriverStatusBroadcastType enum on the backend.
const WIRE: Record<Status, 'network_bad' | 'traffic' | 'need_help'> = {
  network: 'network_bad',
  traffic: 'traffic',
  help:    'need_help',
};

const OPTIONS: Array<{ key: Status; label: string; sub: string; color: string; Icon: any }> = [
  { key: 'network', label: 'Network is bad: still moving',     sub: 'GPS may be delayed but I&apos;m on the way',                color: '#3A7BD5', Icon: Wifi          },
  { key: 'traffic', label: 'Stuck in traffic',                  sub: 'I&apos;m moving slowly: ETA may extend',                  color: '#D97706', Icon: AlertCircle   },
  { key: 'help',    label: 'Need help: please contact support', sub: 'Trigger an alert to ops with my last known location',   color: '#DC2626', Icon: AlertTriangle },
];

export default function StatusBroadcastScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  const [sent,    setSent]    = useState<Status | null>(null);
  const [sending, setSending] = useState<Status | null>(null);

  const send = async (key: Status) => {
    setSending(key);
    setSent(null);
    try {
      await driversApi.sendStatusBroadcast({ type: WIRE[key] });
      setSent(key);
      const msg = OPTIONS.find(o => o.key === key)?.label ?? '';
      Alert.alert('Status sent', `Customer will see: "${msg}".`);
    } catch (e: any) {
      // No queue exists, so a failed send is simply not sent. Say so.
      Alert.alert(
        'Not sent',
        `${e?.message ?? 'The status could not be sent.'}

This needs a connection. Try again once you have signal.`,
      );
    } finally {
      setSending(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Status Broadcast</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        <Text style={[styles.intro, { color: theme.textSecond }]}>
          Tap any status to send it to the customer. Sending needs a connection: if it fails, nothing is stored, so try again once you have signal.
        </Text>

        {OPTIONS.map(o => {
          const isSending = sending === o.key;
          const isSent    = sent    === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => send(o.key)}
              disabled={!!sending}
              style={[
                styles.option,
                {
                  backgroundColor: theme.surface,
                  borderColor: isSent ? '#16A34A' : theme.border,
                },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: o.color + '15' }]}>
                <o.Icon size={22} color={o.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: theme.text }]}>{o.label.replace(/&apos;/g, '\'')}</Text>
                <Text style={[styles.optionSub,   { color: theme.textSecond }]}>{o.sub.replace(/&apos;/g, '\'')}</Text>
              </View>
              {isSending
                ? <ActivityIndicator color={o.color} />
                : isSent
                  ? <CheckCircle size={22} color="#16A34A" />
                  : <ChevronRight size={20} color={theme.textThird} />
              }
            </Pressable>
          );
        })}

        <View style={[styles.footnote, { backgroundColor: theme.primary + '10' }]}>
          <Wifi size={14} color={theme.primary} />
          <Text style={[styles.footnoteText, { color: theme.textSecond }]}>
            Your customer sees the last position SEIRS received from you. If you lose signal, that position stops updating until you are back online.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  intro:   { fontSize: FontSize.sm, lineHeight: 20, paddingVertical: Spacing.sm },

  option:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  iconWrap:    { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, marginBottom: 2 },
  optionSub:   { fontSize: FontSize.xs, lineHeight: 17 },

  footnote:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.md },
  footnoteText:{ flex: 1, fontSize: FontSize.xs, lineHeight: 17 },
});
