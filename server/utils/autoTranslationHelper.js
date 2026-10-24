const translationService = require('../services/translationService');

/**
 * Auto-translation helper for bilingual data
 * Automatically translates missing language columns using LibreTranslate
 */

/**
 * Translate text from source language to target language
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language ('ar' or 'en')
 * @param {string} sourceLang - Source language ('ar' or 'en')
 * @returns {Promise<string>} - Translated text or original if translation fails
 */
async function translateText(text, targetLang, sourceLang = 'en') {
  try {
    if (!text || text.trim() === '') return '';
    if (targetLang === sourceLang) return text;

    console.log(`[AutoTranslate] Translating from ${sourceLang} to ${targetLang}...`);
    const translated = await translationService.translateText(text, targetLang, sourceLang);
    console.log(`[AutoTranslate] ✅ Success: "${text.substring(0, 30)}..." → "${translated.substring(0, 30)}..."`);
    return translated;
  } catch (error) {
    console.error(`[AutoTranslate] ❌ Error translating: ${error.message}`);
    return ''; // Return empty string if translation fails
  }
}

/**
 * Auto-translate bilingual input to fill missing language columns
 * If Arabic text is provided, automatically translate to English
 * If English text is provided, automatically translate to Arabic
 * @param {object} data - Data object with bilingual fields
 * @param {array} textFields - Array of fields to translate (e.g., ['name', 'description'])
 * @returns {Promise<object>} - Data with translated fields filled in
 */
async function autoTranslateBilingualInput(data, textFields = []) {
  const processed = { ...data };

  // Default text fields to process
  if (textFields.length === 0) {
    textFields = ['name', 'title', 'description', 'content', 'message', 'className', 'courseName', 'subject', 'remark', 'remarks'];
  }

  try {
    // Process each bilingual field pair
    for (const field of textFields) {
      const arField = `${field}_ar`;
      const enField = `${field}_en`;

      // Check if we have Arabic text but no English
      if (processed[arField] && processed[arField].trim() !== '' && 
          (!processed[enField] || processed[enField].trim() === '')) {
        console.log(`[AutoTranslate] Field "${field}": Found Arabic, translating to English...`);
        processed[enField] = await translateText(processed[arField], 'en', 'ar');
      }

      // Check if we have English text but no Arabic
      if (processed[enField] && processed[enField].trim() !== '' && 
          (!processed[arField] || processed[arField].trim() === '')) {
        console.log(`[AutoTranslate] Field "${field}": Found English, translating to Arabic...`);
        processed[arField] = await translateText(processed[enField], 'ar', 'en');
      }
    }

    return processed;
  } catch (error) {
    console.error(`[AutoTranslate] Error during auto-translation:`, error.message);
    // Return data with untranslated fields if auto-translation fails
    return processed;
  }
}

/**
 * Retrieve bilingual data and auto-translate missing content based on user's language preference
 * @param {object} row - Database row with _ar and _en columns
 * @param {string} language - Requested language ('ar' or 'en')
 * @param {array} textFields - Array of fields that might need translation
 * @returns {Promise<object>} - Row with fields merged from _ar or _en, auto-translating if needed
 */
async function retrieveAndTranslateBilingualData(row, language = 'en', textFields = []) {
  if (!row) return row;

  const result = { ...row };
  const fields = Object.keys(row);

  // Default text fields
  if (textFields.length === 0) {
    textFields = ['name', 'title', 'description', 'content', 'message', 'className', 'courseName', 'subject', 'remark', 'remarks'];
  }

  try {
    // Find all _ar and _en column pairs
    const baseFields = new Set();
    fields.forEach(field => {
      const match = field.match(/^(.+)_(ar|en)$/);
      if (match && textFields.includes(match[1])) {
        baseFields.add(match[1]);
      }
    });

    // For each base field, use requested language with auto-translation fallback
    for (const base of baseFields) {
      const arField = `${base}_ar`;
      const enField = `${base}_en`;
      const arValue = row[arField] ? String(row[arField]).trim() : '';
      const enValue = row[enField] ? String(row[enField]).trim() : '';

      if (language === 'ar') {
        // User wants Arabic
        if (arValue !== '') {
          // Arabic exists, use it
          result[base] = arValue;
        } else if (enValue !== '') {
          // Arabic missing, translate from English
          console.log(`[AutoTranslate] Auto-translating ${base} from English to Arabic...`);
          const translated = await translateText(enValue, 'ar', 'en');
          result[base] = translated || enValue; // Use English as fallback if translation fails
        } else {
          // Both missing
          result[base] = '';
        }
      } else if (language === 'en') {
        // User wants English
        if (enValue !== '') {
          // English exists, use it
          result[base] = enValue;
        } else if (arValue !== '') {
          // English missing, translate from Arabic
          console.log(`[AutoTranslate] Auto-translating ${base} from Arabic to English...`);
          const translated = await translateText(arValue, 'en', 'ar');
          result[base] = translated || arValue; // Use Arabic as fallback if translation fails
        } else {
          // Both missing
          result[base] = '';
        }
      }
    }

    return result;
  } catch (error) {
    console.error(`[AutoTranslate] Error during retrieval translation:`, error.message);
    // Return as-is if translation fails
    return result;
  }
}

module.exports = {
  translateText,
  autoTranslateBilingualInput,
  retrieveAndTranslateBilingualData
};
