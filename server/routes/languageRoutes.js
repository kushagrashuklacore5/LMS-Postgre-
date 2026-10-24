const express = require('express');
const router = express.Router();
const User = require('../models/User'); // Assuming you have a User model

// A signed-in user may read or change only their own language preference.
const ownEmailOnly = (req, res, next) => {
  const email = String(req.body?.email || req.params?.email || '').trim().toLowerCase();
  if (!email || email !== String(req.user?.email || '').toLowerCase()) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
};

// Save user language preference
router.post('/user/preference', ownEmailOnly, async (req, res) => {
  try {
    const { email, language } = req.body;
    
    if (!email || !language) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and language are required' 
      });
    }

    // Update user's language preference in database
    const updatedUser = await User.findOneAndUpdate(
      { email: email },
      { 
        $set: { 
          languagePreference: language,
          updatedAt: new Date()
        }
      },
      { new: true, upsert: false }
    );

    if (!updatedUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Language preference saved successfully',
      language: language
    });

  } catch (error) {
    console.error('Error saving language preference:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get user language preference
router.get('/user/preference/:email', ownEmailOnly, async (req, res) => {
  try {
    const { email } = req.params;
    
    const user = await User.findOne({ email: email });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({ 
      success: true, 
      language: user.languagePreference || 'en',
      email: email
    });

  } catch (error) {
    console.error('Error getting language preference:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Get all supported languages
router.get('/supported', (req, res) => {
  res.json({
    success: true,
    languages: [
      { code: 'en', name: 'English', rtl: false },
      { code: 'ar', name: 'العربية', rtl: true }
    ]
  });
});

module.exports = router;
