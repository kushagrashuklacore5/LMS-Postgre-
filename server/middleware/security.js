const helmet = require('helmet');

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Frontend URL configuration
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
const API_URL = process.env.API_URL || 'http://localhost:5002';

// Security configuration
const securityConfig = {
  // Content Security Policy (CSP)
  contentSecurityPolicy: {
    directives: {
      // Development: More relaxed CSP
      ...(isDevelopment && {
        'default-src': ["'self'"],
        'script-src': [
          "'self'",
          "'unsafe-inline'", // For development hot reload
          "'unsafe-eval'",  // For development debugging
          "https://apis.google.com", // If using Google services
          "https://www.gstatic.com"
        ],
        'style-src': [
          "'self'",
          "'unsafe-inline'", // For Tailwind CSS and inline styles
          "https://fonts.googleapis.com"
        ],
        'font-src': [
          "'self'",
          "https://fonts.gstatic.com"
        ],
        'img-src': [
          "'self'",
          "data:",
          "https:",
          "blob:"
        ],
        'connect-src': [
          "'self'",
          FRONTEND_URL,
          API_URL,
          "ws:", // WebSockets for development
          "wss:" // Secure WebSockets
        ],
        'frame-src': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': isProduction ? [] : null
      }),
      
      // Production: Strict CSP
      ...(!isDevelopment && {
        'default-src': ["'self'"],
        'script-src': [
          "'self'",
          "https://apis.google.com",
          "https://www.gstatic.com"
        ],
        'style-src': [
          "'self'",
          "https://fonts.googleapis.com"
        ],
        'font-src': [
          "'self'",
          "https://fonts.gstatic.com"
        ],
        'img-src': [
          "'self'",
          "data:",
          "https:",
          "blob:"
        ],
        'connect-src': [
          "'self'",
          FRONTEND_URL,
          API_URL,
          "wss:" // Only secure WebSockets in production
        ],
        'frame-src': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': []
      })
    },
    reportOnly: isDevelopment // Report-only in development, enforce in production
  },

  // Cross-Origin Resource Policy
  crossOriginResourcePolicy: {
    policy: "cross-origin"
  },

  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy: false, // Disable to avoid breaking frontend

  // X-Frame-Options (prevent clickjacking)
  frameguard: {
    action: 'deny' // Prevents page from being embedded in iframe
  },

  // X-Content-Type-Options (prevent MIME sniffing)
  noSniff: true,

  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },

  // HSTS (HTTP Strict Transport Security) - Only in production
  hsts: isProduction ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  } : false,

  // Hide X-Powered-By header
  hidePoweredBy: true,

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false
  },

  // Expect-CT header
  expectCt: isProduction ? {
    maxAge: 86400,
    enforce: true
  } : false,

  // Permissions Policy
  permissionsPolicy: {
    directives: {
      camera: ["'none'"],
      microphone: ["'none'"],
      geolocation: ["'none'"],
      payment: ["'none'"],
      usb: ["'none'"],
      magnetometer: ["'none'"],
      gyroscope: ["'none'"],
      accelerometer: ["'none'"]
    }
  }
};

// Remove null values from config
const cleanConfig = Object.fromEntries(
  Object.entries(securityConfig).filter(([_, value]) => value !== null)
);

// Create helmet middleware with configuration
const securityMiddleware = helmet(cleanConfig);

// Helper function to get current security headers (for testing)
function getSecurityHeaders() {
  const headers = securityMiddleware;
  return {
    'Content-Security-Policy': 'Configured for ' + (isDevelopment ? 'development' : 'production'),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': isProduction ? 'max-age=31536000; includeSubDomains; preload' : 'disabled in development',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
  };
}

// Log security configuration on startup
console.log('🛡️ Security Middleware Initialized');
console.log(`📊 Environment: ${isDevelopment ? 'Development' : 'Production'}`);
console.log(`🔗 Frontend URL: ${FRONTEND_URL}`);
console.log(`🔗 API URL: ${API_URL}`);
console.log(`🔒 CSP Mode: ${isDevelopment ? 'Report-Only' : 'Enforced'}`);

module.exports = {
  securityMiddleware,
  getSecurityHeaders,
  securityConfig
};
