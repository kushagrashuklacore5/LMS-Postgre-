import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';
import { DEFAULT_LANGUAGE, ACTIVE_LANGUAGES, normalizeLanguageCode } from './languageRegistry';

export const NAMESPACES = [
  'common',
  'navigation',
  'dashboard',
  'forms',
  'notifications',
  'tours',
  'chatbot',
];

// Custom detector to read legacy localStorage key 'selectedLanguage' first, then 'i18nextLng'
const customDetector = {
  name: 'legacyLocalStorageDetector',
  lookup() {
    try {
      const legacy = localStorage.getItem('selectedLanguage');
      if (legacy) return normalizeLanguageCode(legacy);
      const standard = localStorage.getItem('i18nextLng');
      if (standard) return normalizeLanguageCode(standard);
    } catch {
      // Ignore storage access errors
    }
    return DEFAULT_LANGUAGE;
  },
  cacheUserLanguage(lng) {
    try {
      localStorage.setItem('selectedLanguage', lng);
      localStorage.setItem('i18nextLng', lng);
    } catch {
      // Ignore storage access errors
    }
  },
};

const languageDetector = new LanguageDetector();
languageDetector.addDetector(customDetector);

i18n
  .use(HttpBackend)
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: ACTIVE_LANGUAGES,
    defaultNS: 'common',
    ns: NAMESPACES,
    fallbackNS: NAMESPACES,
    
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },

    detection: {
      order: ['legacyLocalStorageDetector', 'localStorage', 'navigator'],
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false, // React already safeguards against XSS
    },

    react: {
      useSuspense: false, // Prevents full-screen suspended blank states
    },

    debug: false,
  });

export default i18n;
