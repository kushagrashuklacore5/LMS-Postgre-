const axios = require('axios');
const mockTranslationService = require('../mockTranslationService');

class TranslationService {
  constructor() {
    this.libreTranslateUrl = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000';
    this.defaultLanguage = 'en';
    this.supportedLanguages = ['en', 'ar', 'es', 'fr', 'de', 'zh', 'hi', 'ur'];
    this.useMockService = false;
  }

  /**
   * Check if LibreTranslate is available
   * @returns {Promise<boolean>} Service availability status
   */
  async isServiceAvailable() {
    try {
      const response = await axios.get(`${this.libreTranslateUrl}/languages`, {
        timeout: 5000
      });
      this.useMockService = false;
      return response.status === 200;
    } catch (error) {
      console.error('LibreTranslate service unavailable, using mock service:', error.message);
      this.useMockService = true;
      return true; // Mock service is always available
    }
  }

  /**
   * Translate text using LibreTranslate or mock service
   * @param {string} text - Text to translate
   * @param {string} targetLang - Target language code
   * @param {string} sourceLang - Source language code (default: 'en')
   * @returns {Promise<string>} Translated text
   */
  async translateText(text, targetLang, sourceLang = 'en') {
    try {
      if (!text || text.trim() === '') return text;
      if (targetLang === sourceLang) return text;

      // Check if we should use mock service
      if (this.useMockService) {
        return await mockTranslationService.translateText(text, targetLang, sourceLang);
      }

      // Try LibreTranslate first
      const response = await axios.post(`${this.libreTranslateUrl}/translate`, {
        q: text,
        source: sourceLang,
        target: targetLang,
        format: 'text',
        api_key: ''
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data.translatedText || text;
    } catch (error) {
      console.error('Translation error, falling back to mock service:', error.message);
      // Fallback to mock service
      return await mockTranslationService.translateText(text, targetLang, sourceLang);
    }
  }

  /**
   * Translate multiple texts in batch
   * @param {Array<string>} texts - Array of texts to translate
   * @param {string} targetLang - Target language code
   * @param {string} sourceLang - Source language code
   * @returns {Promise<Array<string>>} Array of translated texts
   */
  async translateBatch(texts, targetLang, sourceLang = 'en') {
    const translations = [];
    
    for (const text of texts) {
      const translated = await this.translateText(text, targetLang, sourceLang);
      translations.push(translated);
    }
    
    return translations;
  }

  /**
   * Get supported languages from LibreTranslate or mock service
   * @returns {Promise<Array>} Array of supported languages
   */
  async getSupportedLanguages() {
    try {
      if (this.useMockService) {
        return await mockTranslationService.getSupportedLanguages();
      }

      const response = await axios.get(`${this.libreTranslateUrl}/languages`, {
        timeout: 5000
      });
      return response.data || [];
    } catch (error) {
      console.error('Error fetching supported languages, using mock service:', error.message);
      return await mockTranslationService.getSupportedLanguages();
    }
  }

  /**
   * Validate language code
   * @param {string} langCode - Language code to validate
   * @returns {boolean} True if language is supported
   */
  isLanguageSupported(langCode) {
    return this.supportedLanguages.includes(langCode);
  }

  /**
   * Get default language
   * @returns {string} Default language code
   */
  getDefaultLanguage() {
    return this.defaultLanguage;
  }
}

module.exports = new TranslationService();
