/**
 * Language Middleware
 * 
 * Extracts user's language preference from:
 * 1. Query parameter: ?language=en or ?language=ar
 * 2. Request header: Accept-Language: en or ar
 * 3. User's profile (if authenticated): user.preferredLanguage
 * 4. Default: 'en'
 */

const languageMiddleware = (req, res, next) => {
  // Get language from various sources in order of priority
  let language = 'en'; // default

  // 1. Check query parameter
  if (req.query.language && ['en', 'ar', 'ur'].includes(req.query.language.toLowerCase())) {
    language = req.query.language.toLowerCase();
  }
  
  // 2. Check request header
  if (!req.query.language && req.headers['accept-language']) {
    const acceptLanguage = req.headers['accept-language'].toLowerCase();
    if (acceptLanguage.includes('ar')) {
      language = 'ar';
    } else if (acceptLanguage.includes('ur')) {
      language = 'ur';
    }
  }

  // 3. Check user's stored preference (if authenticated)
  if (req.user && req.user.preferredLanguage) {
    language = req.user.preferredLanguage.toLowerCase();
  }

  // 4. Check request body (for POST requests)
  if (req.body && req.body.language && ['en', 'ar', 'ur'].includes(req.body.language.toLowerCase())) {
    language = req.body.language.toLowerCase();
  }

  // Store in request object for use in controllers
  req.language = language;
  req.userLanguage = language;

  // Log language selection
  console.log(`📝 Request language: ${language.toUpperCase()}`);

  next();
};

module.exports = languageMiddleware;
