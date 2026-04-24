import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
// Language detection is temporarily disabled — English only for now.
// Re-enable by importing LanguageDetector, adding .use(LanguageDetector),
// and restoring the `detection` block below.
// import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import de from './locales/de.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
      de: { translation: de },
    },
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es', 'de'],
    // All translations are bundled statically — force sync init so React
    // components are connected to i18n before the first render.
    initImmediate: false,
    interpolation: {
      escapeValue: false,
    },
    // detection: {
    //   order: ['localStorage', 'navigator'],
    //   caches: ['localStorage'],
    //   lookupLocalStorage: 'lolas_language',
    // },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
