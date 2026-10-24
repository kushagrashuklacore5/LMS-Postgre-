const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { processBilingualInput } = require('../utils/bilingualHelper');
const { autoTranslateBilingualInput, retrieveAndTranslateBilingualData } = require('../utils/autoTranslationHelper');

// authMiddleware sets req.user.userId (and falls back to a guest user with
// userId null), so `req.user.id` was always undefined here.
const getUserId = (req) => req.user?.userId ?? req.user?.id ?? null;

// No tenant middleware runs on /api/user, so fall back to the default DB the
// same way the other routes do.
const getDb = (req) => req.tenant?.database || require('../config/database-switch');

// BCP-47 style codes used by the client registry (e.g. en-IN, kok-IN) plus
// legacy two/three-letter codes (en, hi, kok).
const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

// Get user language preference
router.get('/language-preference', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = getDb(req);
    const query = 'SELECT language_code FROM user_language_preferences WHERE user_id = ?';
    db.get(query, [userId], (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      // null means "no saved preference": the client keeps its local choice
      // instead of being forced back to English.
      res.json({ language: row?.language_code || null });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user language preference
router.post('/language-preference', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { language } = req.body || {};

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!language || typeof language !== 'string' || !LANGUAGE_CODE.test(language)) {
      return res.status(400).json({ error: 'A valid language code is required' });
    }

    const db = getDb(req);
    const query = `
      INSERT INTO user_language_preferences (user_id, language_code, updated_at)
      VALUES (?, ?, utc_now_text())
      ON CONFLICT (user_id) DO UPDATE SET language_code = excluded.language_code, updated_at = excluded.updated_at
    `;

    db.run(query, [userId, language], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to save language preference' });
      }

      res.json({
        success: true,
        language,
        message: 'Language preference saved successfully'
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
