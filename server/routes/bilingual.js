const express = require('express');
const router = express.Router();
const BilingualDbService = require('../services/BilingualDbService');
const isAuthenticated = require('../middleware/auth');

/**
 * Create or update any data with automatic bilingual translation
 * Endpoint: POST /api/bilingual/create
 * Body: { table, data, language: 'en' or 'ar' }
 */
router.post('/create', isAuthenticated, async (req, res) => {
  try {
    const { table, data, language = 'en' } = req.body;

    if (!table || !data) {
      return res.status(400).json({
        success: false,
        message: 'Table name and data are required'
      });
    }

    // Process input and auto-translate
    const processedData = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        const translated = await BilingualDbService.processInput(value, language);
        processedData[`${key}_en`] = translated.en;
        processedData[`${key}_ar`] = translated.ar;
      } else {
        processedData[key] = value;
      }
    }

    // Store in database
    const result = await BilingualDbService.storeBilingualData(global.db, table, processedData);

    res.json({
      success: true,
      message: 'Data stored in both English and Arabic',
      data: result
    });
  } catch (error) {
    console.error('Bilingual create error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to store bilingual data',
      error: error.message
    });
  }
});

/**
 * Retrieve data in user's preferred language
 * Endpoint: GET /api/bilingual/get?table=courses&language=ar&id=1
 */
router.get('/get', isAuthenticated, async (req, res) => {
  try {
    const { table, language = 'en', id } = req.query;

    if (!table) {
      return res.status(400).json({
        success: false,
        message: 'Table name is required'
      });
    }

    const whereClause = id ? `id = ${id}` : '';
    const rows = await BilingualDbService.retrieveBilingualData(
      global.db,
      table,
      [], // Will fetch all columns
      whereClause,
      language
    );

    res.json({
      success: true,
      language: language,
      data: rows
    });
  } catch (error) {
    console.error('Bilingual get error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve bilingual data',
      error: error.message
    });
  }
});

/**
 * Update data with automatic translation
 * Endpoint: PUT /api/bilingual/update
 * Body: { table, id, data, language: 'en' or 'ar' }
 */
router.put('/update', isAuthenticated, async (req, res) => {
  try {
    const { table, id, data, language = 'en' } = req.body;

    if (!table || !id || !data) {
      return res.status(400).json({
        success: false,
        message: 'Table name, ID, and data are required'
      });
    }

    // Process input and auto-translate
    const processedData = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        const translated = await BilingualDbService.processInput(value, language);
        processedData[`${key}_en`] = translated.en;
        processedData[`${key}_ar`] = translated.ar;
      } else {
        processedData[key] = value;
      }
    }

    // Update in database
    const result = await BilingualDbService.storeBilingualData(global.db, table, processedData, id);

    res.json({
      success: true,
      message: 'Data updated in both English and Arabic',
      data: result
    });
  } catch (error) {
    console.error('Bilingual update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update bilingual data',
      error: error.message
    });
  }
});

/**
 * Translate a string
 * Endpoint: POST /api/bilingual/translate
 * Body: { text, targetLanguage: 'en' or 'ar' }
 */
router.post('/translate', isAuthenticated, async (req, res) => {
  try {
    const { text, targetLanguage = 'en' } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Text is required'
      });
    }

    let translated;
    if (targetLanguage === 'ar') {
      translated = await BilingualDbService.translateToArabic(text);
    } else {
      translated = await BilingualDbService.translateToEnglish(text);
    }

    res.json({
      success: true,
      original: text,
      translated: translated,
      targetLanguage: targetLanguage
    });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to translate',
      error: error.message
    });
  }
});

module.exports = router;
