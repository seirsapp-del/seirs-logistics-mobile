import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import i18n, { changeLanguage, type LanguageCode } from '@/i18n';

// Only show languages we actually have translations for.
const LANGUAGES: { code: LanguageCode; label: string; sub: string; flag: string }[] = [
  { code: 'en', label: 'English',  sub: 'Nigeria', flag: '🇳🇬' },
  { code: 'yo', label: 'Yorùbá',   sub: 'Nigeria', flag: '🇳🇬' },
  { code: 'ha', label: 'Hausa',    sub: 'Nigeria', flag: '🇳🇬' },
  { code: 'ig', label: 'Igbo',     sub: 'Nigeria', flag: '🇳🇬' },
];

const CURRENCIES = [
  { code: 'NGN', symbol: '₦', label: 'Nigerian Naira',  flag: '🇳🇬' },
];

export default function LanguageScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

  const current = (i18n.language?.split('-')[0] ?? 'en') as LanguageCode;
  const [selectedLang, setSelectedLang] = useState<LanguageCode>(current);
  // All transactions are NGN at launch; FX display is a v1.1 feature.
  const [selectedCurr] = useState('NGN');

  const handleLanguageChange = async (code: LanguageCode) => {
    setSelectedLang(code);
    await changeLanguage(code);
    // Show the beta-translations notice for any non-English pick.
    // The Alert renders with the NEW language because changeLanguage()
    // already swapped i18n before this t() call resolves.
    if (code !== 'en') {
      Alert.alert(
        t('languageNotice.title'),
        t('languageNotice.body'),
        [{ text: t('languageNotice.ok'), style: 'default' }],
      );
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('settings.languageTitle')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Language */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>{t('settings.appLanguage')}</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          {LANGUAGES.map((lang, i, arr) => (
            <Pressable
              key={lang.code}
              style={[
                styles.row,
                i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                selectedLang === lang.code && { backgroundColor: isDark ? '#001020' : '#EFF6FF' },
              ]}
              onPress={() => handleLanguageChange(lang.code)}
            >
              <Text style={styles.flag}>{lang.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.langLabel, { color: theme.text }]}>{lang.label}</Text>
                <Text style={[styles.langSub, { color: theme.textSecond }]}>{lang.sub}</Text>
              </View>
              {selectedLang === lang.code && (
                <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
              )}
            </Pressable>
          ))}
        </View>

        {/* Currency */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>{t('settings.displayCurrency')}</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}>
          {CURRENCIES.map((curr, i, arr) => (
            <Pressable
              key={curr.code}
              style={[
                styles.row,
                i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                selectedCurr === curr.code && { backgroundColor: isDark ? '#001020' : '#EFF6FF' },
              ]}
              onPress={() => {}}
            >
              <Text style={styles.flag}>{curr.flag}</Text>
              <View style={[styles.symbolWrap, { backgroundColor: selectedCurr === curr.code ? theme.primary : theme.surfaceSecond }]}>
                <Text style={[styles.symbol, { color: selectedCurr === curr.code ? '#fff' : theme.textSecond }]}>{curr.symbol}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.langLabel, { color: theme.text }]}>{curr.code}</Text>
                <Text style={[styles.langSub, { color: theme.textSecond }]}>{curr.label}</Text>
              </View>
              {selectedCurr === curr.code && (
                <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
              )}
            </Pressable>
          ))}
        </View>

        {/* Note */}
        <View style={[styles.note, { backgroundColor: isDark ? '#001020' : '#EFF6FF', borderColor: theme.primary + '30' }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.primary} />
          <Text style={[styles.noteText, { color: theme.textSecond }]}>
            {t('settings.currencyNote')}
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content:      { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: Spacing.xs },
  card:         { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },

  row:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
  flag:      { fontSize: 22 },
  langLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  langSub:   { fontSize: FontSize.xs, marginTop: 2 },
  symbolWrap:{ width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  symbol:    { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  note:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.xl, borderWidth: 1 },
  noteText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },
});
