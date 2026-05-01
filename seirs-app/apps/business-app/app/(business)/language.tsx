import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { changeLanguage, LANGUAGES, type LanguageCode } from '@/i18n';
import i18n from '@/i18n';

export default function LanguageScreen() {
  const insets  = useSafeAreaInsets();
  const { t }   = useTranslation();
  const current = i18n.language as LanguageCode;

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.heading}>{t('language.title')}</Text>
        <Text style={styles.sub}>{t('language.subtitle')}</Text>
      </View>
      <View style={styles.list}>
        {LANGUAGES.map((lang) => {
          const active = current === lang.code;
          return (
            <Pressable
              key={lang.code}
              style={[styles.item, active && styles.itemActive]}
              onPress={() => changeLanguage(lang.code)}
            >
              <Text style={[styles.label, active && styles.labelActive]}>{lang.label}</Text>
              {active && <Icon name="CheckCircle2" size={20} color="#3A7BD5" />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  heading:     { fontSize: 20, fontWeight: '800', color: '#0F2B4C' },
  sub:         { fontSize: 13, color: '#6B7280', marginTop: 4 },
  list:        { padding: 16, gap: 10 },
  item:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, padding: 18, borderWidth: 1.5, borderColor: '#E5E7EB' },
  itemActive:  { borderColor: '#3A7BD5', backgroundColor: '#EBF3FF' },
  label:       { fontSize: 15, fontWeight: '600', color: '#374151' },
  labelActive: { color: '#0F2B4C' },
});
