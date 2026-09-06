/**
 * Driver-side new-ticket form (Chat 5). Same shape as customer's,
 * with driver-tuned topic defaults.
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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { supportApi, type TicketTopic } from '@/services/api';
import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';

const TOPICS = (): { key: TicketTopic; label: string; icon: any }[] => [
  { key: 'delivery', label: tr('auto.new.deliveryIssue', 'Delivery issue'), icon: 'cube-outline' },
  { key: 'account',  label: tr('auto.editProfile.account', 'Account'),        icon: 'person-outline' },
  { key: 'billing',  label: tr('auto.new.payoutFare', 'Payout / fare'),  icon: 'card-outline' },
  { key: 'driver',   label: tr('auto.new.onTheRoad', 'On the road'),    icon: 'bicycle-outline' },
  { key: 'other',    label: tr('auto.new.other', 'Other'),          icon: 'ellipsis-horizontal-outline' },
];

export default function DriverNewSupportTicketScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

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
        topic,
        subject:      subject.trim(),
        firstMessage: firstMessage.trim(),
      });
      router.replace(`/(driver)/support/${ticket.id}` as any);
    } catch (e: any) {
      alertDialog('Could not open ticket', e?.message ?? String(e));
    } finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('support.newTitle', { defaultValue: 'New support ticket' })}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.lg, paddingBottom: 40 }}>
          <View>
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('support.topicLabel', { defaultValue: 'What is this about?' })}</Text>
            <View style={styles.topicRow}>
              {TOPICS().map(tp => {
                const active = tp.key === topic;
                return (
                  <Pressable
                    key={tp.key}
                    onPress={() => setTopic(tp.key)}
                    style={[styles.topicChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? `${theme.primary}18` : theme.surface }]}
                  >
                    <Ionicons name={tp.icon} size={16} color={active ? theme.primary : theme.textSecond} />
                    <Text style={[styles.topicText, { color: active ? theme.primary : theme.text }]}>{tp.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('support.subjectLabel', { defaultValue: 'Subject' })}</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              maxLength={200}
              placeholder={tx('auto.new.oneLineSummary', 'One-line summary')}
              placeholderTextColor={theme.textThird}
              style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            />
            <Text style={[styles.counter, { color: theme.textThird }]}>{subject.length}/200</Text>
          </View>

          <View>
            <Text style={[styles.label, { color: theme.textSecond }]}>{t('support.messageLabel', { defaultValue: 'Describe the issue' })}</Text>
            <TextInput
              value={firstMessage}
              onChangeText={setFirstMessage}
              placeholder={tx('auto.new.includeTrackingCodesTimesOr', 'Include tracking codes, times, or delivery IDs when relevant.')}
              placeholderTextColor={theme.textThird}
              multiline
              numberOfLines={6}
              style={[styles.textarea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            />
          </View>

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={[styles.submitBtn, { backgroundColor: canSubmit ? theme.primary : theme.border }]}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('support.submit', { defaultValue: 'Open ticket' })}</Text>}
          </Pressable>

          <Text style={[styles.hint, { color: theme.textThird }]}>
            {t('support.hoursHint', { defaultValue: 'Support hours: 6am–10pm WAT. Messages sent outside those hours get a reply once we open at 6am.' })}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  label:       { fontSize: FontSize.xs, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  topicRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  topicText:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  input:       { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.base },
  textarea:    { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.base, minHeight: 140, textAlignVertical: 'top' },
  counter:     { fontSize: 11, textAlign: 'right', marginTop: 4 },
  submitBtn:   { paddingVertical: 14, borderRadius: Radius.lg, alignItems: 'center' },
  submitText:  { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
  hint:        { fontSize: 11, textAlign: 'center' },
});
