const express = require('express');
const router = express.Router();
const Translation = require('../models/Translation');
const axios = require('axios');
const authMiddleware = require('../middleware/auth');

// Initialize LibreTranslate API endpoint (if using LibreTranslate)
const LIBRE_TRANSLATE_API = process.env.LIBRE_TRANSLATE_URL || 'http://localhost:5000/translate';

// Auto-translate text using LibreTranslate
async function autoTranslate(text, sourceLang = 'en', targetLang = 'ar') {
  try {
    const response = await axios.post(LIBRE_TRANSLATE_API, {
      q: text,
      source: sourceLang,
      target: targetLang
    });
    return response.data.translatedText || text;
  } catch (error) {
    console.error('Translation API error:', error.message);
    return text; // Return original text if translation fails
  }
}

// Create a new translation with auto-translation
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { original_text, category, field_name, model_name } = req.body;

    if (!original_text) {
      return res.status(400).json({ error: 'original_text is required' });
    }

    // Auto-translate to Arabic and Urdu
    const [arabic_text, urdu_text] = await Promise.all([
      autoTranslate(original_text, 'en', 'ar'),
      autoTranslate(original_text, 'en', 'ur')
    ]);

    const translation = await Translation.create({
      original_text,
      english_text: original_text,
      arabic_text,
      urdu_text,
      category: category || 'other',
      field_name,
      model_name
    });

    res.json({ success: true, translation });
  } catch (error) {
    console.error('Error creating translation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get translation by original text
router.get('/text/:text', async (req, res) => {
  try {
    const { text } = req.params;
    const { model_name } = req.query;

    const translation = await Translation.getByText(decodeURIComponent(text), model_name);

    if (!translation) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    res.json(translation);
  } catch (error) {
    console.error('Error getting translation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get translation by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const translation = await Translation.getById(id);

    if (!translation) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    res.json(translation);
  } catch (error) {
    console.error('Error getting translation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all translations for a model
router.get('/model/:model_name', async (req, res) => {
  try {
    const { model_name } = req.params;
    const translations = await Translation.getByModel(model_name);

    res.json({
      success: true,
      count: translations.length,
      translations
    });
  } catch (error) {
    console.error('Error getting translations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all translations with pagination
router.get('/', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const translations = await Translation.getAll(parseInt(limit), parseInt(offset));
    const stats = await Translation.getStats();

    res.json({
      success: true,
      count: translations.length,
      stats,
      translations
    });
  } catch (error) {
    console.error('Error getting translations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search translations
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const translations = await Translation.search(decodeURIComponent(query));

    res.json({
      success: true,
      count: translations.length,
      translations
    });
  } catch (error) {
    console.error('Error searching translations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update translation
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { english_text, arabic_text, urdu_text, category } = req.body;

    const result = await Translation.update(id, {
      english_text,
      arabic_text,
      urdu_text,
      category
    });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    res.json({ success: true, message: 'Translation updated' });
  } catch (error) {
    console.error('Error updating translation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete translation
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Translation.delete(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Translation not found' });
    }

    res.json({ success: true, message: 'Translation deleted' });
  } catch (error) {
    console.error('Error deleting translation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch create translations
router.post('/batch/create', authMiddleware, async (req, res) => {
  try {
    const { translations } = req.body;

    if (!Array.isArray(translations) || translations.length === 0) {
      return res.status(400).json({ error: 'translations array is required' });
    }

    // Auto-translate each entry
    const translationsWithTexts = await Promise.all(
      translations.map(async (trans) => {
        const [arabic, urdu] = await Promise.all([
          autoTranslate(trans.original_text, 'en', 'ar'),
          autoTranslate(trans.original_text, 'en', 'ur')
        ]);

        return {
          ...trans,
          english_text: trans.original_text,
          arabic_text: arabic,
          urdu_text: urdu
        };
      })
    );

    const results = await Translation.createBatch(translationsWithTexts);

    res.json({
      success: true,
      created: results.length,
      results
    });
  } catch (error) {
    console.error('Error batch creating translations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get translated text in a specific language
router.post('/get-translated', async (req, res) => {
  try {
    const { text, language = 'en', model_name } = req.body;

    const translated = await Translation.getTranslated(text, language, model_name);

    res.json({
      success: true,
      original: text,
      translated,
      language
    });
  } catch (error) {
    console.error('Error getting translated text:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
