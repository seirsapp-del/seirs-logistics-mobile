import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { changeLanguage, LANGUAGES, type LanguageCode } from '@/i18n';
import i18n from '@/i18n';
import { useColors } from '@/context/ThemeContext';

export default function LanguageScreen() {
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { t }   = useTranslation();
  const current = i18n.language as LanguageCode;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Text style={[styles.heading, { color: colors.text }]}>{t('language.title')}</Text>
        <Text style={[styles.sub, { color: colors.textSecond }]}>{t('language.subtitle')}</Text>
      </View>
      <View style={styles.list}>
        {LANGUAGES.map((lang) => {
          const active = current === lang.code;
          return (
            <Pressable
              key={lang.code}
              style={[
                styles.item,
                { backgroundColor: colors.surface, borderColor: colors.border },
                active && { borderColor: colors.accent, backgroundColor: colors.primaryLight },
              ]}
              onPress={() => changeLanguage(lang.code)}
            >
              <Text style={[
                styles.label,
                { color: colors.textSecond },
                active && { color: colors.text },
              ]}>{lang.label}</Text>
              {active && <Icon name="CheckCircle2" size={20} color={colors.accent} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header:  { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  heading: { fontSize: 20, fontWeight: '800' },
  sub:     { fontSize: 13, marginTop: 4 },
  list:    { padding: 16, gap: 10 },
  item:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: 18, borderWidth: 1.5 },
  label:   { fontSize: 15, fontWeight: '600' },
});
