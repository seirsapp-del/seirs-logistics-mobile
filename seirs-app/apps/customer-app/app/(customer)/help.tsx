import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, StatusBar, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { HELP_FAQS } from '@/constants/mockData';

const TOPICS = [
  { icon: 'car-outline',          label: 'Trips',      filter: (q: string) => q.toLowerCase().includes('cancel') || q.toLowerCase().includes('driver') },
  { icon: 'wallet-outline',       label: 'Payments',   filter: (q: string) => q.toLowerCase().includes('top up') || q.toLowerCase().includes('payment') },
  { icon: 'star-outline',         label: 'Rewards',    filter: (q: string) => q.toLowerCase().includes('reward') || q.toLowerCase().includes('point') },
  { icon: 'shield-outline',       label: 'Safety',     filter: (q: string) => false },
  { icon: 'person-outline',       label: 'Account',    filter: (q: string) => q.toLowerCase().includes('account') || q.toLowerCase().includes('profile') },
];

export default function HelpScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';

  const [query,      setQuery]      = useState('');
  const [expanded,   setExpanded]   = useState<number | null>(null);
  const [topic,      setTopic]      = useState<string | null>(null);

  const filteredFaqs = HELP_FAQS.filter(faq => {
    const matchesQuery = !query.trim() || faq.q.toLowerCase().includes(query.toLowerCase()) || faq.a.toLowerCase().includes(query.toLowerCase());
    return matchesQuery;
  });

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
            { icon: 'chatbubble-ellipses-outline', label: 'Live Chat',  sub: 'Avg. 2 min reply', color: '#3A86FF',
              onPress: () => Alert.alert('Coming soon', 'Live chat with our support team is launching shortly.') },
            { icon: 'call-outline',                label: 'Call Us',    sub: '0700-SEIRS-01',    color: '#22C55E',
              onPress: () => Linking.openURL('tel:07007347701').catch(() => Alert.alert('Could not open dialer')) },
            { icon: 'mail-outline',                label: 'Email',      sub: 'support@seirs.app', color: '#8B5CF6',
              onPress: () => Linking.openURL('mailto:support@seirs.app').catch(() => Alert.alert('Could not open email')) },
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
              <Text style={[styles.contactSub,   { color: theme.textSecond }]}>{c.sub}</Text>
            </Pressable>
          ))}
        </View>

        {/* Topic chips */}
        {!query && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Browse by Topic</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicRow}>
              {TOPICS.map(t => (
                <Pressable
                  key={t.label}
                  style={[
                    styles.topicChip,
                    { borderColor: topic === t.label ? theme.primary : theme.border },
                    topic === t.label && { backgroundColor: isDark ? '#001020' : '#EFF6FF' },
                  ]}
                  onPress={() => setTopic(prev => prev === t.label ? null : t.label)}
                >
                  <Ionicons name={t.icon as any} size={14} color={topic === t.label ? theme.primary : theme.textSecond} />
                  <Text style={[styles.topicText, { color: topic === t.label ? theme.primary : theme.textSecond }]}>{t.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* FAQs */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {query ? `Results for "${query}"` : 'Frequently Asked Questions'}
        </Text>

        {filteredFaqs.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface }]}>
            <Ionicons name="search-outline" size={36} color={theme.textThird} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No results found</Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecond }]}>
              Try a different search term or browse by topic.
            </Text>
          </View>
        ) : (
          filteredFaqs.map((faq, i) => (
            <Pressable
              key={i}
              style={[styles.faqCard, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
              onPress={() => setExpanded(prev => prev === i ? null : i)}
            >
              <View style={styles.faqHeader}>
                <Text style={[styles.faqQ, { color: theme.text, flex: 1 }]}>{faq.q}</Text>
                <Ionicons
                  name={expanded === i ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={theme.textSecond}
                />
              </View>
              {expanded === i && (
                <Text style={[styles.faqA, { color: theme.textSecond }]}>{faq.a}</Text>
              )}
            </Pressable>
          ))
        )}

        {/* Report trip issue */}
        <Pressable
          style={[styles.reportBtn, { backgroundColor: isDark ? '#1A0000' : '#FEF2F2', borderColor: '#FECACA' }]}
          onPress={() => router.push('/(customer)/report')}
        >
          <Ionicons name="flag-outline" size={18} color="#EF4444" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.reportTitle, { color: '#EF4444' }]}>Report a Trip Issue</Text>
            <Text style={[styles.reportSub, { color: theme.textSecond }]}>Lost item, driver complaint, overcharge</Text>
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
