const Translation = require('../models/Translation');
const axios = require('axios');

// LibreTranslate API endpoint
const LIBRE_TRANSLATE_API = process.env.LIBRE_TRANSLATE_URL || 'http://localhost:5000/translate';

// Auto-translate text using LibreTranslate
async function autoTranslate(text, sourceLang = 'en', targetLang = 'ar') {
  try {
    if (!text || typeof text !== 'string' || text.length === 0) {
      return text;
    }

    const response = await axios.post(LIBRE_TRANSLATE_API, {
      q: text,
      source: sourceLang,
      target: targetLang
    }, { timeout: 5000 });

    return response.data.translatedText || text;
  } catch (error) {
    console.error(`Translation error (${sourceLang} -> ${targetLang}):`, error.message);
    return text; // Return original text if translation fails
  }
}

// Middleware to auto-translate database entries
async function autoTranslateDbFields(req, res, next) {
  // Store original data for translation
  req.translationData = {
    model: req.body.model || req.params.model,
    fieldsToTranslate: req.body.fieldsToTranslate || ['title', 'description', 'name', 'content', 'message'],
    category: req.body.category || 'other'
  };

  next();
}

// Function to translate and store database fields
async function translateAndStoreDbFields(data, modelName, fieldNames) {
  try {
    const translations = [];

    for (const fieldName of fieldNames) {
      const value = data[fieldName];

      if (value && typeof value === 'string' && value.length > 0) {
        // Auto-translate
        const [arabic, urdu] = await Promise.all([
          autoTranslate(value, 'en', 'ar'),
          autoTranslate(value, 'en', 'ur')
        ]);

        // Store in translations table with replicated English version
        const translation = await Translation.create({
          original_text: value,
          english_text: value,
          arabic_text: arabic,
          urdu_text: urdu,
          model_name: modelName,
          field_name: fieldName,
          category: fieldName === 'title' ? 'title' : fieldName === 'description' ? 'description' : 'content'
        });

        translations.push({
          fieldName,
          translationId: translation.id,
          arabic,
          urdu
        });

        // Add translation reference to data
        data[`${fieldName}_translation_id`] = translation.id;
      }
    }

    return translations;
  } catch (error) {
    console.error('Error translating and storing fields:', error);
    return [];
  }
}

// Get translated version of a field
async function getTranslatedField(fieldValue, language = 'en', modelName = null) {
  try {
    if (!fieldValue) return fieldValue;

    const translation = await Translation.getTranslated(fieldValue, language, modelName);
    return translation;
  } catch (error) {
    console.error('Error getting translated field:', error);
    return fieldValue;
  }
}

// Translate response data based on user's language preference
async function translateResponseData(data, userLanguage = 'en', fieldsToTranslate = ['title', 'description', 'name', 'content', 'message']) {
  if (!data || userLanguage === 'en') {
    return data;
  }

  if (Array.isArray(data)) {
    return Promise.all(
      data.map(item => translateResponseData(item, userLanguage, fieldsToTranslate))
    );
  }

  if (typeof data === 'object') {
    const translatedData = { ...data };

    for (const field of fieldsToTranslate) {
      if (data[field]) {
        translatedData[field] = await getTranslatedField(data[field], userLanguage);
      }
    }

    // Recursively translate nested objects and arrays
    for (const key in translatedData) {
      if (typeof translatedData[key] === 'object' && translatedData[key] !== null) {
        translatedData[key] = await translateResponseData(translatedData[key], userLanguage, fieldsToTranslate);
      }
    }

    return translatedData;
  }

  return data;
}

module.exports = {
  autoTranslate,
  autoTranslateDbFields,
  translateAndStoreDbFields,
  getTranslatedField,
  translateResponseData
};
