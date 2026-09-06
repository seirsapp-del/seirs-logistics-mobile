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

/**
 * Language only (founder 2026-09-06, on device): the "Nigeria" line under
 * every language and the whole "Display currency: NGN" card said nothing a
 * rider could act on, so both are gone. Naira is the only currency and the
 * language is the only choice.
 */
export default function LanguageScreen() {
  const router  = useRouter();
  const cs      = useColorScheme();
  const theme   = Colors[cs ?? 'light'];
  const isDark  = cs === 'dark';
  const { t }   = useTranslation();

  const [selectedLang, setSelectedLang] = useState<LanguageCode>(
    (i18n.language as LanguageCode) ?? 'en',
  );

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
              <Text style={[styles.langLabel, { color: theme.text, flex: 1 }]}>{lang.label}</Text>
              {selectedLang === lang.code && (
                <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
              )}
            </Pressable>
          ))}
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
    paddingVertical: 16,
  },
  langLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
