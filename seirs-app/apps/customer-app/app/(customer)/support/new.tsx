/**
 * New support ticket — premium redesign.
 *
 * Pattern borrowed from Intercom / Stripe Support Center:
 *   - Warm personalised greeting header (uses first name)
 *   - Team-avatars strip showing "our support crew" (social proof)
 *   - Big topic cards with descriptions instead of tiny chips
 *   - Response-time promise line under the greeting so users know
 *     what to expect ("Typically replies in a few hours")
 *   - Inline reassurance about business hours near the submit button
 *
 * Safe-area aware: the submit button uses insets.bottom padding so
 * gesture-nav phones (Pixel, newer Samsung) never overlap the CTA.
 */
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Package, CreditCard, Bike, User, MoreHorizontal, Clock, ShieldCheck, ArrowRight,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { Avatar } from '@/components/ui/Avatar';
import { supportApi, type TicketTopic } from '@/services/api';

const TOPICS: { key: TicketTopic; label: string; icon: any; hint: string }[] = [
  { key: 'delivery', label: 'Delivery issue',      icon: Package,         hint: 'Package late, missing, damaged, wrong address' },
  { key: 'billing',  label: 'Billing or refund',   icon: CreditCard,      hint: 'Charge questions, receipts, refunds' },
  { key: 'driver',   label: 'About a driver',      icon: Bike,            hint: 'Feedback, complaints, safety concerns' },
  { key: 'account',  label: 'My account',          icon: User,            hint: 'Sign-in, verification, profile changes' },
  { key: 'other',    label: 'Something else',      icon: MoreHorizontal,  hint: 'Suggestions, feedback, general questions' },
];

function firstName(fullName?: string | null): string {
  if (!fullName) return 'there';
  return fullName.trim().split(/\s+/)[0];
}

function isBusinessHoursNow(): boolean {
  // Africa/Lagos = UTC+1, no DST. 6am-10pm.
  const lagosHour = (new Date().getUTCHours() + 1 + 24) % 24;
  return lagosHour >= 6 && lagosHour < 22;
}

export default function NewSupportTicketScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [step,         setStep]         = useState<'topic' | 'details'>('topic');
  const [topic,        setTopic]        = useState<TicketTopic | null>(null);
  const [subject,      setSubject]      = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  const canSubmit = !!subject.trim() && !!firstMessage.trim() && !submitting && !!topic;
  const openHours = isBusinessHoursNow();

  const submit = async () => {
    if (!canSubmit || !topic) return;
    setSubmitting(true);
    try {
      const ticket = await supportApi.create({
        topic,
        subject:      subject.trim(),
        firstMessage: firstMessage.trim(),
      });
      router.replace(`/(customer)/support/${ticket.id}` as any);
    } catch (e: any) {
      Alert.alert(
        t('support.error.title', { defaultValue: 'Could not open ticket' }),
        e?.message ?? String(e),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => (step === 'details' ? setStep('topic') : router.back())}
          style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {step === 'topic'
            ? t('support.newTitle',     { defaultValue: 'How can we help?' })
            : t('support.detailsTitle', { defaultValue: 'Tell us more' })}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'topic' ? (
            <>
              {/* Greeting */}
              <View style={styles.greetingWrap}>
                <Text style={[styles.greeting, { color: theme.text }]}>
                  Hi {firstName(user?.name)}, how can we help?
                </Text>
                <View style={styles.responseRow}>
                  <Clock size={13} color={openHours ? '#16A34A' : '#D97706'} />
                  <Text style={[styles.responseText, { color: theme.textSecond }]}>
                    {openHours
                      ? 'Typically replies in a few hours during today'
                      : 'Support opens at 6am WAT. We usually reply by 7am.'}
                  </Text>
                </View>
                {/* Team avatars strip — social proof + humanises the queue */}
                <View style={styles.teamRow}>
                  <View style={styles.avatarStack}>
                    <View style={styles.avatarOverlap}><Avatar name="Adaobi Nwosu"     size={28} /></View>
                    <View style={styles.avatarOverlap}><Avatar name="Musa Ibrahim"     size={28} /></View>
                    <View style={styles.avatarOverlap}><Avatar name="Femi Adegoke"     size={28} /></View>
                  </View>
                  <Text style={[styles.teamText, { color: theme.textSecond }]}>Our support team is standing by</Text>
                </View>
              </View>

              {/* Topic cards */}
              <Text style={[styles.sectionLabel, { color: theme.textSecond }]}>
                What is your question about?
              </Text>
              <View style={styles.topicList}>
                {TOPICS.map(tp => {
                  const IconC = tp.icon;
                  const selected = topic === tp.key;
                  return (
                    <Pressable
                      key={tp.key}
                      onPress={() => { setTopic(tp.key); setStep('details'); }}
                      style={({ pressed }) => [
                        styles.topicCard,
                        {
                          backgroundColor: selected ? `${theme.primary}12` : theme.surface,
                          borderColor:     selected ? theme.primary : theme.border,
                          opacity: pressed ? 0.85 : 1,
                        },
                        Shadows.xs,
                      ]}
                    >
                      <View style={[styles.topicIconWrap, { backgroundColor: `${theme.primary}15` }]}>
                        <IconC size={22} color={theme.primary} strokeWidth={1.75} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.topicLabel, { color: theme.text }]}>{tp.label}</Text>
                        <Text style={[styles.topicHint, { color: theme.textSecond }]}>{tp.hint}</Text>
                      </View>
                      <ArrowRight size={18} color={theme.textThird} strokeWidth={1.75} />
                    </Pressable>
                  );
                })}
              </View>

              {/* Trust line */}
              <View style={styles.trustRow}>
                <ShieldCheck size={13} color={theme.textThird} />
                <Text style={[styles.trustText, { color: theme.textThird }]}>
                  Conversations are private between you and the SEIRS support team.
                </Text>
              </View>
            </>
          ) : (
            <View style={{ padding: Spacing.md, gap: Spacing.lg }}>
              {/* Selected topic recap */}
              {topic && (
                <View style={[styles.topicRecap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={[styles.topicRecapIcon, { backgroundColor: `${theme.primary}18` }]}>
                    {(() => {
                      const IconC = TOPICS.find(t => t.key === topic)!.icon;
                      return <IconC size={18} color={theme.primary} />;
                    })()}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.topicRecapLabel, { color: theme.textSecond }]}>Topic</Text>
                    <Text style={[styles.topicRecapText,  { color: theme.text }]}>
                      {TOPICS.find(t => t.key === topic)?.label}
                    </Text>
                  </View>
                  <Pressable onPress={() => setStep('topic')} hitSlop={10}>
                    <Text style={[styles.changeLink, { color: theme.primary }]}>Change</Text>
                  </Pressable>
                </View>
              )}

              <View>
                <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>Subject</Text>
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  maxLength={200}
                  placeholder="A short summary of the issue"
                  placeholderTextColor={theme.textThird}
                  style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                />
                <Text style={[styles.counter, { color: theme.textThird }]}>{subject.length}/200</Text>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: theme.textSecond }]}>Describe what happened</Text>
                <TextInput
                  value={firstMessage}
                  onChangeText={setFirstMessage}
                  placeholder="Include tracking codes, times, or amounts when relevant. The more detail, the faster we can help."
                  placeholderTextColor={theme.textThird}
                  multiline
                  numberOfLines={7}
                  style={[styles.textarea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                />
              </View>

              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                style={[
                  styles.submitBtn,
                  { backgroundColor: canSubmit ? theme.primary : theme.border },
                  Shadows.sm,
                ]}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : (
                    <>
                      <Text style={styles.submitText}>Send to support</Text>
                      <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
                    </>
                  )}
              </Pressable>

              <View style={styles.hoursNote}>
                <Clock size={13} color={openHours ? '#16A34A' : '#D97706'} />
                <Text style={[styles.hoursNoteText, { color: theme.textSecond }]}>
                  {openHours
                    ? 'Support hours 6am–10pm WAT. Currently open.'
                    : 'Support hours 6am–10pm WAT. You will get an auto-response now; a real reply arrives by 7am.'}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  greetingWrap: { paddingHorizontal: Spacing.md, paddingTop: 20, paddingBottom: 12 },
  greeting:     { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, lineHeight: 30 },
  responseRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  responseText: { fontSize: FontSize.sm },
  teamRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  avatarStack:  { flexDirection: 'row', marginRight: 4 },
  avatarOverlap:{ marginLeft: -10 },
  teamText:     { fontSize: FontSize.xs, marginLeft: 6 },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: Spacing.md, marginTop: 20, marginBottom: 8 },

  topicList:    { paddingHorizontal: Spacing.md, gap: 10 },
  topicCard:    { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: Radius.lg, borderWidth: 1.5 },
  topicIconWrap:{ width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  topicLabel:   { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  topicHint:    { fontSize: FontSize.xs, marginTop: 3, lineHeight: 16 },

  trustRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, marginTop: 20 },
  trustText: { fontSize: 11, flex: 1, lineHeight: 15 },

  topicRecap:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.lg, borderWidth: 1 },
  topicRecapIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  topicRecapLabel:{ fontSize: 10, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  topicRecapText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginTop: 2 },
  changeLink:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  fieldLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input:      { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.base },
  textarea:   { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.base, minHeight: 160, textAlignVertical: 'top' },
  counter:    { fontSize: 11, textAlign: 'right', marginTop: 4 },

  submitBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: Radius.lg },
  submitText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },

  hoursNote:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  hoursNoteText: { fontSize: 11, flex: 1, lineHeight: 15 },
});
