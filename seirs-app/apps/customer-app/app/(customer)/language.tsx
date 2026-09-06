import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import i18n, { changeLanguage, type LanguageCode } from '@/i18n';
import { alertDialog } from '@/components/SeirsDialog';

// Only the languages we actually have translations for. Endonyms, never
// translated: a Yoruba speaker looks for "Yorùbá" whatever the app is set to.
const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'yo', label: 'Yorùbá'  },
  { code: 'ha', label: 'Hausa'   },
  { code: 'ig', label: 'Igbo'    },
];

/**
 * Language only (founder 2026-09-06, on device): the "Nigeria" line under
 * every language and the "Display currency: NGN" card told the customer
 * nothing they could change, so both are gone.
 */
export default function LanguageScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';
  const { t }  = useTranslation();

  const current = (i18n.language?.split('-')[0] ?? 'en') as LanguageCode;
  const [selectedLang, setSelectedLang] = useState<LanguageCode>(current);

  const handleLanguageChange = async (code: LanguageCode) => {
    setSelectedLang(code);
    await changeLanguage(code);
    // Show the beta-translations notice for any non-English pick.
    // The `t` from useTranslation() is a closure captured at this render
    // and still resolves keys in the PREVIOUS language even after
    // changeLanguage() ran. Force the new language explicitly via
    // i18n.t(..., { lng: code }) so the Alert renders correctly.
    if (code !== 'en') {
      alertDialog(
        i18n.t('languageNotice.title', { lng: code }),
        i18n.t('languageNotice.body',  { lng: code }),
        [{ text: i18n.t('languageNotice.ok', { lng: code }), style: 'default' }],
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
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  content:      { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: Spacing.xs },
  card:         { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },

  row:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 16 },
  langLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold },
});
