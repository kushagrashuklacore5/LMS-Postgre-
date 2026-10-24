/**
 * Language Detection and Bilingual Data Processing Utility
 * Detects if text is Arabic or English and handles splitting data into _ar and _en columns
 */

/**
 * Detect if text contains Arabic characters
 * @param {string} text - Text to check
 * @returns {boolean} - True if text is primarily Arabic
 */
function isArabic(text) {
  if (!text || typeof text !== 'string') return false;
  
  // Arabic Unicode ranges: 0x0600-0x06FF (Arabic), 0x0750-0x077F (Arabic Supplement)
  // Also check for common Arabic diacritics and extended characters
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const arabicChars = text.match(arabicRegex) || [];
  
  // Consider text Arabic if more than 30% of characters are Arabic
  return arabicChars.length > text.length * 0.3;
}

/**
 * Detect if text contains primarily English characters
 * @param {string} text - Text to check
 * @returns {boolean} - True if text is primarily English
 */
function isEnglish(text) {
  if (!text || typeof text !== 'string') return false;
  
  // English is primarily Latin characters
  const englishRegex = /[a-zA-Z0-9\s\-_.,'!?]/g;
  const englishChars = text.match(englishRegex) || [];
  
  // Consider text English if more than 50% of characters are English/Latin
  return englishChars.length > text.length * 0.5;
}

/**
 * Detect language of text (arabic, english, or mixed)
 * @param {string} text - Text to detect
 * @returns {string} - 'arabic', 'english', or 'mixed'
 */
function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'english';
  
  const hasArabic = isArabic(text);
  const hasEnglish = isEnglish(text);
  
  if (hasArabic && !hasEnglish) return 'arabic';
  if (hasEnglish && !hasArabic) return 'english';
  if (hasArabic && hasEnglish) return 'mixed';
  
  return 'english'; // default fallback
}

/**
 * Process input data and split text into _ar and _en columns based on language
 * NOTE: Original field is preserved for backwards compatibility with NOT NULL constraints
 * @param {object} data - Input data object
 * @param {array} textFields - Array of field names that should be bilingual (e.g., ['name', 'description'])
 * @returns {object} - Processed data with _ar and _en columns where appropriate
 */
function processBilingualInput(data, textFields = []) {
  const processed = { ...data };

  // If no text fields specified, assume common ones
  if (textFields.length === 0) {
    textFields = ['name', 'title', 'description', 'content', 'message', 'className', 'courseName', 'subject', 'remark', 'remarks'];
  }

  // For each text field, detect language and split into _ar and _en
  textFields.forEach(field => {
    if (processed[field] !== undefined && processed[field] !== null) {
      const value = String(processed[field]).trim();
      const language = detectLanguage(value);

      if (language === 'arabic') {
        // Store in _ar, leave _en empty
        processed[`${field}_ar`] = value;
        processed[`${field}_en`] = '';
        // KEEP original field for backwards compatibility with NOT NULL constraints
        // processed[field] = value; // already set from input
      } else if (language === 'english') {
        // Store in _en, leave _ar empty
        processed[`${field}_en`] = value;
        processed[`${field}_ar`] = '';
        // KEEP original field for backwards compatibility
        // processed[field] = value; // already set from input
      } else if (language === 'mixed') {
        // Mixed: store in both _en and _ar
        processed[`${field}_en`] = value;
        processed[`${field}_ar`] = value;
        // KEEP original field
        // processed[field] = value; // already set from input
      }
    }
  });

  return processed;
}

/**
 * Retrieve bilingual data and return in requested language
 * @param {object} row - Database row with _ar and _en columns
 * @param {string} language - Requested language ('ar' or 'en')
 * @returns {object} - Row with fields merged from _ar or _en based on language
 */
function retrieveBilingualData(row, language = 'en') {
  if (!row) return row;

  const result = { ...row };
  const fields = Object.keys(row);

  // Find all _ar and _en column pairs
  const baseFields = new Set();
  fields.forEach(field => {
    const match = field.match(/^(.+)_(ar|en)$/);
    if (match) {
      baseFields.add(match[1]);
    }
  });

  // For each base field, use the requested language version
  baseFields.forEach(base => {
    const arField = `${base}_ar`;
    const enField = `${base}_en`;

    if (language === 'ar' && arField in row) {
      // Prefer Arabic version
      if (row[arField] && String(row[arField]).trim() !== '') {
        result[base] = row[arField];
      } else {
        // Fall back to English if Arabic is empty
        result[base] = row[enField] || '';
      }
    } else if (language === 'en' && enField in row) {
      // Prefer English version
      if (row[enField] && String(row[enField]).trim() !== '') {
        result[base] = row[enField];
      } else {
        // Fall back to Arabic if English is empty
        result[base] = row[arField] || '';
      }
    }

    // Clean up by removing _ar and _en fields from result if desired
    // delete result[arField];
    // delete result[enField];
  });

  return result;
}

module.exports = {
  isArabic,
  isEnglish,
  detectLanguage,
  processBilingualInput,
  retrieveBilingualData
};
