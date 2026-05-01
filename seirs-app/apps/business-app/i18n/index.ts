import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import yo from './locales/yo.json';
import ig from './locales/ig.json';
import ha from './locales/ha.json';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'yo', label: 'Yoruba'  },
  { code: 'ig', label: 'Igbo'    },
  { code: 'ha', label: 'Hausa'   },
] as const;

export type LanguageCode = typeof LANGUAGES[number]['code'];

const STORAGE_KEY = 'seirs_business_language';

export async function changeLanguage(code: LanguageCode) {
  await AsyncStorage.setItem(STORAGE_KEY, code);
  await i18n.changeLanguage(code);
}

async function getStoredLanguage(): Promise<string> {
  try { return (await AsyncStorage.getItem(STORAGE_KEY)) ?? 'en'; }
  catch { return 'en'; }
}

getStoredLanguage().then((lang) => {
  i18n
    .use(initReactI18next)
    .init({
      resources:       { en: { translation: en }, yo: { translation: yo }, ig: { translation: ig }, ha: { translation: ha } },
      lng:             lang,
      fallbackLng:     'en',
      interpolation:   { escapeValue: false },
      compatibilityJSON: 'v4' as any,
    });
});

export default i18n;
