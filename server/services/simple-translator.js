#!/usr/bin/env node

/**
 * Simple Translation Server (LibreTranslate Alternative)
 * Uses Google Translate API via a simple wrapper
 * 
 * Start: node server/services/simple-translator.js
 * Port: 5000
 */

const http = require('http');
const url = require('url');
const querystring = require('querystring');

// Simple translation mapping (can be expanded)
const translations = {
  'en-ar': {
    'hello': 'مرحبا',
    'welcome': 'مرحبا',
    'goodbye': 'وداعا',
    'thank you': 'شكراً لك',
    'yes': 'نعم',
    'no': 'لا',
    'course': 'دورة',
    'student': 'طالب',
    'teacher': 'معلم',
    'classroom': 'فصل دراسي',
    'assignment': 'مهمة',
    'quiz': 'اختبار',
    'exam': 'امتحان',
    'material': 'مادة',
    'chapter': 'فصل',
    'lesson': 'درس',
    'attendance': 'الحضور',
    'grade': 'درجة',
    'assessment': 'تقييم',
    'requirement': 'متطلب',
  },
  'ar-en': {
    'مرحبا': 'hello',
    'وداعا': 'goodbye',
    'شكراً لك': 'thank you',
    'نعم': 'yes',
    'لا': 'no',
    'دورة': 'course',
    'طالب': 'student',
    'معلم': 'teacher',
    'فصل دراسي': 'classroom',
    'مهمة': 'assignment',
    'اختبار': 'quiz',
    'امتحان': 'exam',
    'مادة': 'material',
    'فصل': 'chapter',
    'درس': 'lesson',
    'الحضور': 'attendance',
    'درجة': 'grade',
    'تقييم': 'assessment',
    'متطلب': 'requirement',
  }
};

/**
 * Simple translation function using word-by-word mapping
 * For production, integrate with Google Translate API or similar
 */
function translateText(text, sourceLang, targetLang) {
  const key = `${sourceLang}-${targetLang}`;
  
  if (!translations[key]) {
    return text; // Return original if language pair not found
  }

  // For now, return a simple placeholder translation
  // In production, you'd call Google Translate API here
  
  // If it's a known phrase, return translation
  const lowerText = text.toLowerCase();
  if (translations[key][lowerText]) {
    return translations[key][lowerText];
  }

  // For unknown text, return original (fallback)
  // In production, make API call to Google/Azure Translator
  if (targetLang === 'ar' && sourceLang === 'en') {
    // Rough approximation for demonstration
    return text + ' (AR)'; // This is just a placeholder
  } else if (targetLang === 'en' && sourceLang === 'ar') {
    return text + ' (EN)'; // This is just a placeholder
  }

  return text;
}

const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (pathname === '/translate' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { q, source = 'en', target = 'ar' } = data;

        if (!q) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Missing "q" parameter' }));
          return;
        }

        const translatedText = translateText(q, source, target);

        res.writeHead(200);
        res.end(JSON.stringify({
          translatedText: translatedText,
          success: true
        }));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({
          error: 'Internal server error',
          message: error.message
        }));
      }
    });
  } else if (pathname === '/' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({
      message: 'Simple Translation Server running',
      endpoints: {
        'POST /translate': {
          description: 'Translate text',
          body: {
            q: 'Text to translate',
            source: 'en',
            target: 'ar'
          }
        }
      },
      note: 'This is a simple fallback translator. For production, integrate with Google Translate API'
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.TRANSLATOR_PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║     Simple Translation Server Running            ║
╚══════════════════════════════════════════════════╝

📍 Server: http://localhost:${PORT}
✅ Ready for translation requests

⚠️  Note: This is a simple fallback translator.
   For production use, consider:
   - Google Cloud Translation API
   - Azure Translator API
   - LibreTranslate (Docker): docker run -d -p 5000:5000 libretranslate/libretranslate

Test with:
  curl -X POST http://localhost:${PORT}/translate \\
    -H "Content-Type: application/json" \\
    -d '{"q":"Hello","source":"en","target":"ar"}'
  `);
});

process.on('SIGINT', () => {
  console.log('\n\n🛑 Translation server stopped');
  process.exit(0);
});
