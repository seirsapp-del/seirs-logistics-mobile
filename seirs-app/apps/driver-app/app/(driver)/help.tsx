import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, StatusBar, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

// Verified against the live system 2026-08-10 (founder audit): the old
// answers promised instant earnings, an invented ₦200 no-show fee, a
// 500-trip rating window, and decline penalties, none of which exist.
const DRIVER_HELP_FAQS = [
  { topic: 'Earnings', q: 'When will I receive my earnings?',       a: 'Earnings from each delivery clear 2 business days after it completes, then you can withdraw free any time (minimum ₦1,000). Need it sooner? Instant withdrawal unlocks earnings that are at least 24 hours old for a small fee, shown before you confirm.' },
  { topic: 'Earnings', q: 'How much does SEIRS take per delivery?', a: 'SEIRS takes a 30% service fee from each delivery fare; you keep 70%. Every trip in your earnings history shows the fare, the SEIRS fee, and your net so you can check the math yourself.' },
  { topic: 'Safety',   q: 'How do I report a difficult customer?',  a: 'Open Contact Support from the menu and describe what happened; you can reference the tracking code of the trip. Support replies during working hours (6am to 10pm WAT). For danger or threats, use SOS immediately.' },
  { topic: 'Trips',    q: 'What if the customer does not show up?', a: 'Message or call the customer from the trip screen first. If they stay unreachable, contact support from the same trip so the team can resolve it; do not abandon the package or leave it unattended.' },
  { topic: 'Account',  q: 'How is my rating calculated?',           a: 'Your rating is the average of every customer rating on your completed deliveries. If your average stays below 3.5, your account may be reviewed; the Ratings screen shows tips to improve.' },
  { topic: 'KYC',      q: 'What documents do I need for KYC?',      a: 'A government-issued ID (NIN, driver\'s licence, or international passport, front and back), a selfie, your driver\'s licence, vehicle photos, proof of vehicle ownership, and a valid insurance certificate. A guarantor letter is recommended but optional.' },
  { topic: 'Account',  q: 'Can I change my vehicle or bank account?', a: 'Yes, but both are protected changes: submit the new details in the app and our team reviews them before they apply. Bank changes pause withdrawals until approved; vehicle changes need photos of the outside, inside, and plate.' },
  { topic: 'Trips',    q: 'Can I decline a job request?',           a: 'Yes, you can decline any job request without penalty. Going into Wind Down mode stops new offers entirely while you finish your current jobs.' },
];


const TOPICS = [
  { icon: 'cash-outline',          label: 'Earnings' },
  { icon: 'person-outline',        label: 'Account' },
  { icon: 'car-outline',           label: 'Trips' },
  { icon: 'shield-outline',        label: 'Safety' },
  { icon: 'document-text-outline', label: 'KYC' },
];

export default function DriverHelpScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [query,    setQuery]    = useState('');
  const [topic,    setTopic]    = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Topic chips actually filter now (audit 2026-08-10: they were
  // decorative, tapping did nothing). Tap toggles; tap again clears.
  const filtered = DRIVER_HELP_FAQS.filter(faq =>
    (!topic || (faq as any).topic === topic) &&
    (!query.trim() ||
      faq.q.toLowerCase().includes(query.toLowerCase()) ||
      faq.a.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Help Center</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Search */}
        <View style={[styles.searchWrap, { backgroundColor: theme.surfaceSecond, borderColor: theme.border }]}>
          <Ionicons name="search-outline" size={18} color={theme.textThird} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search for help…"
            placeholderTextColor={theme.textThird}
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={theme.textThird} />
            </Pressable>
          )}
        </View>

        {/* Quick contact */}
        <View style={styles.contactRow}>
          {[
            // Straight to a NEW ticket (founder 2026-08-10: the old
            // route bounced through the Messages tab first). Brand
            // palette only: sky / green / navy.
            { icon: 'chatbubble-ellipses-outline', label: 'Live Chat', sub: '6am–10pm WAT reply', color: '#3A7BD5',
              onPress: () => router.push('/(driver)/support/new' as any) },
            { icon: 'call-outline',                label: 'Call Us',   sub: '0700-SEIRS-01',    color: '#16A34A',
              onPress: () => Linking.openURL('tel:07007347701').catch(() => {}) },
            { icon: 'mail-outline',                label: 'Email',     sub: 'drivers@seirs.co',color: '#0F2B4C',
              onPress: () => Linking.openURL('mailto:drivers@seirs.co').catch(() => {}) },
          ].map(c => (
            <Pressable
              key={c.label}
              onPress={c.onPress}
              style={[styles.contactCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
            >
              <View style={[styles.contactIcon, { backgroundColor: c.color + '15' }]}>
                <Ionicons name={c.icon as any} size={22} color={c.color} />
              </View>
              <Text style={[styles.contactLabel, { color: theme.text }]}>{c.label}</Text>
              <Text style={[styles.contactSub, { color: theme.textSecond }]}>{c.sub}</Text>
            </Pressable>
          ))}
        </View>

        {/* Topics */}
        {!query && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Browse by Topic</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicRow}>
              {TOPICS.map(t => {
                const active = topic === t.label;
                return (
                  <Pressable
                    key={t.label}
                    onPress={() => setTopic(active ? null : t.label)}
                    style={[
                      styles.topicChip,
                      { borderColor: active ? theme.primary : theme.border },
                      active && { backgroundColor: theme.primary + '12' },
                    ]}
                  >
                    <Ionicons name={t.icon as any} size={14} color={active ? theme.primary : theme.textSecond} />
                    <Text style={[styles.topicText, { color: active ? theme.primary : theme.textSecond }]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* FAQs */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {query ? `Results for "${query}"` : 'Frequently Asked Questions'}
        </Text>

        {filtered.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
            <Ionicons name="search-outline" size={36} color={theme.textThird} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No results found</Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>Try a different search term or contact support.</Text>
          </View>
        ) : (
          filtered.map((faq, i) => (
            <Pressable
              key={i}
              style={[styles.faqCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
              onPress={() => setExpanded(prev => prev === i ? null : i)}
            >
              <View style={styles.faqHeader}>
                <Text style={[styles.faqQ, { color: theme.text, flex: 1 }]}>{faq.q}</Text>
                <Ionicons name={expanded === i ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecond} />
              </View>
              {expanded === i && (
                <Text style={[styles.faqA, { color: theme.textSecond }]}>{faq.a}</Text>
              )}
            </Pressable>
          ))
        )}

        {/* Report issue */}
        {/* D-1.7: this card had a chevron and no onPress, so the one route
            out of a dispute was a dead tap. */}
        <Pressable
          style={[styles.reportBtn, { backgroundColor: isDark ? '#1A0000' : '#FEF2F2', borderColor: '#FECACA' }]}
          onPress={() => router.push('/(driver)/support/new' as any)}
        >
          <Ionicons name="flag-outline" size={18} color="#EF4444" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.reportTitle, { color: '#EF4444' }]}>Report a Trip Issue</Text>
            <Text style={[styles.reportSub, { color: theme.textSecond }]}>Customer dispute, route issue, vehicle damage</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#EF4444" />
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1.5, paddingHorizontal: Spacing.md, height: 50 },
  searchInput: { flex: 1, fontSize: FontSize.base },

  contactRow:  { flexDirection: 'row', gap: Spacing.sm },
  contactCard: { flex: 1, alignItems: 'center', gap: 6, padding: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1 },
  contactIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  contactLabel:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  contactSub:  { fontSize: 10, textAlign: 'center' },

  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  topicRow:  { gap: Spacing.sm, paddingRight: Spacing.md },
  topicChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5 },
  topicText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  faqCard:   { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  faqHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  faqQ:      { fontSize: FontSize.base, fontWeight: FontWeight.semibold, lineHeight: 22 },
  faqA:      { fontSize: FontSize.sm, lineHeight: 21 },

  emptyCard:  { alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl, borderRadius: Radius.xl },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  emptyDesc:  { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },

  reportBtn:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1.5 },
  reportTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  reportSub:   { fontSize: FontSize.xs, marginTop: 2 },
});
