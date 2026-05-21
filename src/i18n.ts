// i18n setup (issue #12).
//
// react-i18next, runtime-only — catalogs are bundled JSON, initialised
// synchronously so no Suspense boundary is needed. The browser-language
// detector picks the initial locale from navigator.language and persists a
// manual override (the LangSwitcher) in localStorage.
//
// Scope so far: App.tsx chrome (nav, filters, topbar, load/empty states).
// Per-view strings are a mechanical follow-up — see issue #12.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
] as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES.map((l) => l.code),
    // Match "fr-CA" → "fr".
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'playascope-lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
