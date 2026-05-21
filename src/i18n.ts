// i18n setup (issue #12).
//
// react-i18next, runtime-only — catalogs are bundled JSON, initialised
// synchronously so no Suspense boundary is needed. The browser-language
// detector picks the initial locale from navigator.language and persists a
// manual override (the LangSwitcher) in localStorage.
//
// Catalog layout per locale:
//   locales/<lang>.json        — UI chrome (nav, filters, panel headings, …)
//   locales/snark.<lang>.json  — generated snark (MOOP tiles, Burn Battle
//                                verdicts, Personality blurbs, …)
// The two are deep-merged into one resource so a translator gets the snark as
// a single self-contained file. Snark is English-only by policy; locales with
// no snark.<lang>.json fall back to snark.en.json via fallbackLng.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import snarkEn from './locales/snark.en.json';
import snarkFr from './locales/snark.fr.json';
import snarkEs from './locales/snark.es.json';

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
] as const;

type Dict = { [key: string]: unknown };

// Recursively merge `extra` onto `base` (plain objects only). Used to fold a
// snark.<lang>.json into its chrome catalog.
function deepMerge(base: Dict, extra: Dict): Dict {
  const out: Dict = { ...base };
  for (const key of Object.keys(extra)) {
    const b = out[key];
    const e = extra[key];
    if (
      b && e && typeof b === 'object' && typeof e === 'object' &&
      !Array.isArray(b) && !Array.isArray(e)
    ) {
      out[key] = deepMerge(b as Dict, e as Dict);
    } else {
      out[key] = e;
    }
  }
  return out;
}

const enMerged = deepMerge(en as Dict, snarkEn as Dict);
const frMerged = deepMerge(fr as Dict, snarkFr as Dict);
const esMerged = deepMerge(es as Dict, snarkEs as Dict);

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enMerged },
      fr: { translation: frMerged },
      es: { translation: esMerged },
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
