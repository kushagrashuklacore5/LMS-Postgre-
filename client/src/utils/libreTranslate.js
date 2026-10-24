import { API_ORIGIN } from '../config/api';
/**
 * LibreTranslate API Wrapper (via Backend Proxy)
 * Calls backend API which handles LibreTranslate requests
 */

/**
 * Translate a string of text using backend translation API
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code (default: 'en')
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<string>} - Translated text
 */
export async function translateText(text, sourceLanguage = 'en', targetLanguage) {
  try {
    console.log(`🔄 Translating: "${text.substring(0, 30)}..." from ${sourceLanguage} to ${targetLanguage}`);

const response = await fetch(`${API_ORIGIN}/api/translation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        sourceLanguage,
        targetLanguage,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.warn(`⚠️ Translation API error: ${response.status}`, errorData);
      return text; // Fallback to original
    }

    const data = await response.json();
    const translated = data.translatedText || text;
    console.log(`✅ Translated: "${translated.substring(0, 50)}..."`);
    return translated;
  } catch (error) {
    console.error('❌ Translation error:', error);
    return text; // Return original text if translation fails
  }
}

// Language support
export const LANGUAGE_MAP = {
  en: 'en', es: 'es', fr: 'fr', de: 'de', it: 'it', pt: 'pt', ru: 'ru', ja: 'ja',
  ko: 'ko', 'zh-CN': 'zh', 'zh-TW': 'zh', hi: 'hi', ar: 'ar', af: 'af', sq: 'sq',
  am: 'am', hy: 'hy', az: 'az', eu: 'eu', be: 'be', bn: 'bn', bs: 'bs', bg: 'bg',
  ca: 'ca', ceb: 'ceb', ny: 'ny', co: 'co', hr: 'hr', cs: 'cs', da: 'da', nl: 'nl',
  eo: 'eo', et: 'et', tl: 'tl', fi: 'fi', fy: 'fy', gl: 'gl', ka: 'ka', el: 'el',
  gu: 'gu', ht: 'ht', ha: 'ha', haw: 'haw', he: 'he', hmn: 'hmn', hu: 'hu', is: 'is',
  ig: 'ig', id: 'id', ga: 'ga', jw: 'jw', kn: 'kn', kk: 'kk', km: 'km', ku: 'ku',
  ky: 'ky', lo: 'lo', la: 'la', lv: 'lv', lt: 'lt', lb: 'lb', mk: 'mk', mg: 'mg',
  ms: 'ms', ml: 'ml', mt: 'mt', mi: 'mi', mr: 'mr', mn: 'mn', my: 'my', ne: 'ne',
  no: 'no', or: 'or', ps: 'ps', fa: 'fa', pl: 'pl', pa: 'pa', ro: 'ro', sm: 'sm',
  sa: 'sa', gd: 'gd', sr: 'sr', st: 'st', sn: 'sn', sd: 'sd', si: 'si', sk: 'sk',
  sl: 'sl', so: 'so', su: 'su', sw: 'sw', sv: 'sv', tg: 'tg', ta: 'ta', tt: 'tt',
  te: 'te', th: 'th', tr: 'tr', tk: 'tk', uk: 'uk', ur: 'ur', ug: 'ug', uz: 'uz',
  vi: 'vi', cy: 'cy', xh: 'xh', yi: 'yi', yo: 'yo', zu: 'zu',
};

/**
 * Get language name by code
 * @param {string} code - Language code
 * @returns {string} - Language name
 */
export function getLanguageName(code) {
  const languageNames = {
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    pt: 'Português',
    ru: 'Русский',
    ja: '日本語',
    ko: '한국어',
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    hi: 'हिंदी',
    ar: 'العربية',
  };
  return languageNames[code] || code;
}

export default {
  translateText,
  getLanguageName,
  LANGUAGE_MAP,
};
