/**
 * Business + partner new-ticket form (Chat 5).
 */
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { supportApi, type TicketTopic } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';

const TOPICS: { key: TicketTopic; label: string; icon: any }[] = [
  { key: 'delivery', label: 'Delivery',      icon: 'Package' },
  { key: 'billing',  label: 'Billing / invoice', icon: 'CreditCard' },
  { key: 'account',  label: 'Account',       icon: 'User' },
  { key: 'driver',   label: 'Driver / route',icon: 'Bike' },
  { key: 'other',    label: 'Other',         icon: 'MoreHorizontal' },
];

export default function BusinessNewTicketScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

  const [topic,        setTopic]        = useState<TicketTopic>('delivery');
  const [subject,      setSubject]      = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  const canSubmit = !!subject.trim() && !!firstMessage.trim() && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const ticket = await supportApi.create({
        topic, subject: subject.trim(), firstMessage: firstMessage.trim(),
      });
      router.replace(`/(business)/support/${ticket.id}` as any);
    } catch (e: any) {
      alertDialog('Could not open ticket', e?.message ?? String(e));
    } finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{tx('auto.new.newSupportTicket', 'New support ticket')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>
          <View>
            <Text style={[styles.label, { color: theme.textSecond }]}>WHAT IS THIS ABOUT?</Text>
            <View style={styles.topicRow}>
              {TOPICS.map(tp => {
                const active = tp.key === topic;
                return (
                  <Pressable
                    key={tp.key}
                    onPress={() => setTopic(tp.key)}
                    style={[styles.topicChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? `${theme.primary}18` : theme.surface }]}
                  >
                    <Icon name={tp.icon} size={14} color={active ? theme.primary : theme.textSecond} />
                    <Text style={[styles.topicText, { color: active ? theme.primary : theme.text }]}>{tp.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={[styles.label, { color: theme.textSecond }]}>SUBJECT</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              maxLength={200}
              placeholder="One-line summary"
              placeholderTextColor={theme.textSecond}
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            />
            <Text style={[styles.counter, { color: theme.textSecond }]}>{subject.length}/200</Text>
          </View>

          <View>
            <Text style={[styles.label, { color: theme.textSecond }]}>DESCRIBE THE ISSUE</Text>
            <TextInput
              value={firstMessage}
              onChangeText={setFirstMessage}
              placeholder="Include tracking codes, invoice numbers, or amounts when relevant."
              placeholderTextColor={theme.textSecond}
              multiline numberOfLines={6}
              style={[styles.textarea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            />
          </View>

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={[styles.submitBtn, { backgroundColor: canSubmit ? theme.primary : theme.border }]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{tx('auto.new.openTicket', 'Open ticket')}</Text>}
          </Pressable>

          <Text style={[styles.hint, { color: theme.textSecond }]}>
            Support hours: 6am-10pm WAT. Messages sent outside those hours get a reply once we open at 6am.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  label:       { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  topicRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  topicText:   { fontSize: 13, fontWeight: '600' },
  input:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textarea:    { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 140, textAlignVertical: 'top' },
  counter:     { fontSize: 12, textAlign: 'right', marginTop: 4 },
  submitBtn:   { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint:        { fontSize: 12, textAlign: 'center' },
});
