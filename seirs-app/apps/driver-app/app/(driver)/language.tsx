import {
  View, Text, Pressable, StyleSheet, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, changeLanguage, type LanguageCode } from '@/i18n';
import { useState } from 'react';
import i18n from '@/i18n';

// All payouts settle in NGN at launch — FX display is a v1.1 feature.
const CURRENCIES = [
  { code: 'NGN', symbol: '₦', label: 'Nigerian Naira',  flag: '🇳🇬' },
];

const LANGUAGE_FLAGS: Record<string, string> = {
  en: '🇳🇬',
  yo: '🇳🇬',
  ig: '🇳🇬',
  ha: '🇳🇬',
};

export default function LanguageScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();

  const [selectedLang, setSelectedLang] = useState<LanguageCode>(
    (i18n.language as LanguageCode) ?? 'en',
  );
  const [selectedCurr, setSelectedCurr] = useState('NGN');

  const handleSelectLanguage = async (code: LanguageCode) => {
    setSelectedLang(code);
    await changeLanguage(code);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable
          style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('language.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Language */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>
          {t('language.appLanguage')}
        </Text>
        <View
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
        >
          {LANGUAGES.map((lang, i, arr) => (
            <Pressable
              key={lang.code}
              style={[
                styles.row,
                i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                selectedLang === lang.code && {
                  backgroundColor: isDark ? '#001020' : '#EFF6FF',
                },
              ]}
              onPress={() => handleSelectLanguage(lang.code)}
            >
              <Text style={styles.flag}>{LANGUAGE_FLAGS[lang.code] ?? '🌐'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.langLabel, { color: theme.text }]}>{lang.label}</Text>
                <Text style={[styles.langSub, { color: theme.textSecond }]}>
                  {t('language.nigeria')}
                </Text>
              </View>
              {selectedLang === lang.code && (
                <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
              )}
            </Pressable>
          ))}
        </View>

        {/* Currency */}
        <Text style={[styles.sectionTitle, { color: theme.textSecond }]}>
          {t('language.displayCurrency')}
        </Text>
        <View
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, Shadows.xs]}
        >
          {CURRENCIES.map((curr, i, arr) => (
            <Pressable
              key={curr.code}
              style={[
                styles.row,
                i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                selectedCurr === curr.code && {
                  backgroundColor: isDark ? '#001020' : '#EFF6FF',
                },
              ]}
              onPress={() => setSelectedCurr(curr.code)}
            >
              <Text style={styles.flag}>{curr.flag}</Text>
              <View
                style={[
                  styles.symbolWrap,
                  {
                    backgroundColor:
                      selectedCurr === curr.code ? theme.primary : theme.surfaceSecond,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.symbol,
                    {
                      color:
                        selectedCurr === curr.code ? '#fff' : theme.textSecond,
                    },
                  ]}
                >
                  {curr.symbol}
                </Text>
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
        <View
          style={[
            styles.note,
            {
              backgroundColor: isDark ? '#001020' : '#EFF6FF',
              borderColor: theme.primary + '30',
            },
          ]}
        >
          <Ionicons name="information-circle-outline" size={16} color={theme.primary} />
          <Text style={[styles.noteText, { color: theme.textSecond }]}>
            {t('language.currencyNote')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content:      { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: Spacing.xs,
  },
  card: { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  flag:      { fontSize: 22 },
  langLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
  langSub:   { fontSize: FontSize.xs, marginTop: 2 },
  symbolWrap:{
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  symbol: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  noteText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },
});
