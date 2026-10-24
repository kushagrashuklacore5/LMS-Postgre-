/**
 * Centralized Language Registry for 20 Indian Languages & English Baseline
 * 
 * Scalable single source of truth for:
 * - Standard BCP-47 locale codes (e.g. 'hi-IN', 'bn-IN', 'ur-IN')
 * - Legacy short codes ('en', 'hi', 'ur', etc.)
 * - English display names
 * - Endonyms / Native script names
 * - Text direction ('ltr' vs 'rtl')
 * - Script classifications and font families
 */

export const SUPPORTED_LANGUAGES = {
  'en-IN': {
    code: 'en-IN',
    legacyCode: 'en',
    name: 'English',
    nativeName: 'English (India)',
    dir: 'ltr',
    script: 'Latin',
    fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif",
    isDefault: true,
  },
  'hi-IN': {
    code: 'hi-IN',
    legacyCode: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    dir: 'ltr',
    script: 'Devanagari',
    fontFamily: "'Noto Sans Devanagari', 'Plus Jakarta Sans', sans-serif",
    isDefault: false,
  },
  'bn-IN': {
    code: 'bn-IN',
    legacyCode: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    dir: 'ltr',
    script: 'Bengali',
    fontFamily: "'Noto Sans Bengali', sans-serif",
    isDefault: false,
  },
  'te-IN': {
    code: 'te-IN',
    legacyCode: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    dir: 'ltr',
    script: 'Telugu',
    fontFamily: "'Noto Sans Telugu', sans-serif",
    isDefault: false,
  },
  'mr-IN': {
    code: 'mr-IN',
    legacyCode: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    dir: 'ltr',
    script: 'Devanagari',
    fontFamily: "'Noto Sans Devanagari', sans-serif",
    isDefault: false,
  },
  'ta-IN': {
    code: 'ta-IN',
    legacyCode: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    dir: 'ltr',
    script: 'Tamil',
    fontFamily: "'Noto Sans Tamil', sans-serif",
    isDefault: false,
  },
  'gu-IN': {
    code: 'gu-IN',
    legacyCode: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    dir: 'ltr',
    script: 'Gujarati',
    fontFamily: "'Noto Sans Gujarati', sans-serif",
    isDefault: false,
  },
  'kn-IN': {
    code: 'kn-IN',
    legacyCode: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    dir: 'ltr',
    script: 'Kannada',
    fontFamily: "'Noto Sans Kannada', sans-serif",
    isDefault: false,
  },
  'ml-IN': {
    code: 'ml-IN',
    legacyCode: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    dir: 'ltr',
    script: 'Malayalam',
    fontFamily: "'Noto Sans Malayalam', sans-serif",
    isDefault: false,
  },
  'pa-IN': {
    code: 'pa-IN',
    legacyCode: 'pa',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    dir: 'ltr',
    script: 'Gurmukhi',
    fontFamily: "'Noto Sans Gurmukhi', sans-serif",
    isDefault: false,
  },
  'or-IN': {
    code: 'or-IN',
    legacyCode: 'or',
    name: 'Odia',
    nativeName: 'ଓଡ଼ିଆ',
    dir: 'ltr',
    script: 'Odia',
    fontFamily: "'Noto Sans Oriya', sans-serif",
    isDefault: false,
  },
  'as-IN': {
    code: 'as-IN',
    legacyCode: 'as',
    name: 'Assamese',
    nativeName: 'অসমীয়া',
    dir: 'ltr',
    script: 'Bengali-Assamese',
    fontFamily: "'Noto Sans Bengali', sans-serif",
    isDefault: false,
  },
  'ur-IN': {
    code: 'ur-IN',
    legacyCode: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    dir: 'rtl',
    script: 'Perso-Arabic',
    fontFamily: "'Noto Nastaliq Urdu', 'Noto Sans Arabic', sans-serif",
    isDefault: false,
  },
  'sa-IN': {
    code: 'sa-IN',
    legacyCode: 'sa',
    name: 'Sanskrit',
    nativeName: 'संस्कृतम्',
    dir: 'ltr',
    script: 'Devanagari',
    fontFamily: "'Noto Sans Devanagari', sans-serif",
    isDefault: false,
  },
  'ks-IN': {
    code: 'ks-IN',
    legacyCode: 'ks',
    name: 'Kashmiri',
    nativeName: 'کٲشُر',
    dir: 'rtl',
    script: 'Perso-Arabic',
    fontFamily: "'Noto Nastaliq Urdu', 'Noto Sans Arabic', sans-serif",
    isDefault: false,
  },
  'ne-IN': {
    code: 'ne-IN',
    legacyCode: 'ne',
    name: 'Nepali',
    nativeName: 'नेपाली',
    dir: 'ltr',
    script: 'Devanagari',
    fontFamily: "'Noto Sans Devanagari', sans-serif",
    isDefault: false,
  },
  'kok-IN': {
    code: 'kok-IN',
    legacyCode: 'kok',
    name: 'Konkani',
    nativeName: 'कोंकणी',
    dir: 'ltr',
    script: 'Devanagari',
    fontFamily: "'Noto Sans Devanagari', sans-serif",
    isDefault: false,
  },
  'mni-IN': {
    code: 'mni-IN',
    legacyCode: 'mni',
    name: 'Manipuri',
    nativeName: 'মৈতৈলোন্',
    dir: 'ltr',
    script: 'Bengali',
    fontFamily: "'Noto Sans Bengali', sans-serif",
    isDefault: false,
  },
  'brx-IN': {
    code: 'brx-IN',
    legacyCode: 'brx',
    name: 'Bodo',
    nativeName: 'बर\'',
    dir: 'ltr',
    script: 'Devanagari',
    fontFamily: "'Noto Sans Devanagari', sans-serif",
    isDefault: false,
  },
  'sat-IN': {
    code: 'sat-IN',
    legacyCode: 'sat',
    name: 'Santali',
    nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ',
    dir: 'ltr',
    script: 'Ol Chiki',
    fontFamily: "'Noto Sans Ol Chiki', sans-serif",
    isDefault: false,
  },
};

export const DEFAULT_LANGUAGE = 'en-IN';

// All 20 active languages registered in the LMS
export const ACTIVE_LANGUAGES = Object.keys(SUPPORTED_LANGUAGES);

/**
 * Normalize input language code to standard locale
 * Handles legacy 'en' -> 'en-IN', 'hi' -> 'hi-IN', 'bn' -> 'bn-IN', etc.
 */
export const normalizeLanguageCode = (code) => {
  if (!code) return DEFAULT_LANGUAGE;
  const cleaned = String(code).trim();
  if (SUPPORTED_LANGUAGES[cleaned]) return cleaned;
  // Match by legacy code or lowercase
  const entry = Object.values(SUPPORTED_LANGUAGES).find(
    (lang) => lang.legacyCode.toLowerCase() === cleaned.toLowerCase() || lang.code.toLowerCase() === cleaned.toLowerCase()
  );
  return entry ? entry.code : DEFAULT_LANGUAGE;
};

export default SUPPORTED_LANGUAGES;
