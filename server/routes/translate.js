/**
 * Translation API Route
 * Integrates with the project's TranslationService which uses LibreTranslate (or a mock)
 */

const express = require('express');
const router = express.Router();
const translationService = require('../services/translationService');

/**
 * POST /api/translate
 * Body: { text, sourceLanguage = 'en', targetLanguage }
 * Uses the TranslationService which prefers LibreTranslate and falls back to mock translations.
 */
router.post('/translate', async (req, res) => {
  try {
    const { text, sourceLanguage = 'en', targetLanguage } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({ error: 'Missing required fields: text, targetLanguage' });
    }

    const translatedText = await translationService.translateText(text, targetLanguage, sourceLanguage);

    res.json({
      success: true,
      translatedText,
      method: translationService.useMockService ? 'mock' : 'libretranslate',
      language: targetLanguage
    });
  } catch (error) {
    console.error('Server translation error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
