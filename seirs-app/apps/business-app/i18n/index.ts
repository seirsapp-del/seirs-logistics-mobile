// Intl.PluralRules polyfill — Hermes (RN's JS engine) doesn't ship it,
// so i18next's plural resolver was falling back to v3 format and logging
// a warning on every screen. Importing this side-effect-only registers
// `Intl.PluralRules` globally before i18next initialises.
import 'intl-pluralrules';
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

/**
 * Async initialiser called by app/_layout.tsx before rendering anything
 * that uses useTranslation(). Exported as a named function so the layout
 * can await it; otherwise the first screen that calls t() would see an
 * undefined `t` for one render and crash.
 *
 * Idempotent — safe to call more than once. The previous fire-and-forget
 * auto-init pattern caused a TypeError when the layout did
 * `import { initI18n }` because no such export existed.
 */
export async function initI18n(): Promise<typeof i18n> {
  if (i18n.isInitialized) return i18n;
  const lang = await getStoredLanguage();
  await i18n.use(initReactI18next).init({
    resources:       { en: { translation: en }, yo: { translation: yo }, ig: { translation: ig }, ha: { translation: ha } },
    lng:             lang,
    fallbackLng:     'en',
    interpolation:   { escapeValue: false },
    compatibilityJSON: 'v4' as any,
  });
  return i18n;
}

export default i18n;
