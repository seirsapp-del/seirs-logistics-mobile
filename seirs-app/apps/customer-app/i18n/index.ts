import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import yo from './locales/yo.json';
import ig from './locales/ig.json';
import ha from './locales/ha.json';

export const LANGUAGES = [
  { code: 'en', label: 'English'  },
  { code: 'yo', label: 'Yoruba'   },
  { code: 'ig', label: 'Igbo'     },
  { code: 'ha', label: 'Hausa'    },
] as const;

export type LanguageCode = typeof LANGUAGES[number]['code'];

const STORAGE_KEY = 'seirs_language';

async function getStoredLanguage(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ?? 'en';
  } catch {
    return 'en';
  }
}

export async function changeLanguage(code: LanguageCode) {
  await i18n.changeLanguage(code);
  await AsyncStorage.setItem(STORAGE_KEY, code);
}

export async function initI18n() {
  const lng = await getStoredLanguage();

  await i18n
    .use(initReactI18next)
    .init({
      resources: { en: { translation: en }, yo: { translation: yo }, ig: { translation: ig }, ha: { translation: ha } },
      lng,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      compatibilityJSON: 'v3',
    });
}

export default i18n;
