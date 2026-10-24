const tenantConnectionManager = require('../config/tenant-connection-manager');

/**
 * Tenant Resolver Middleware
 * 
 * This middleware intercepts all incoming requests and:
 * 1. Extracts the superadmin ID from the JWT token or session
 * 2. Resolves the appropriate tenant database connection
 * 3. Injects the connection into the request context using AsyncLocalStorage
 * 4. Makes the connection available throughout the request lifecycle
 * 
 * This is completely transparent - existing controllers and services
 * don't need to know which database they're talking to.
 */

/**
 * Main tenant resolution middleware
 * Use this for all API routes that require tenant context
 */
const tenantResolver = (req, res, next) => {
  // Skip tenant resolution for health checks, static files, etc.
  if (shouldSkipTenantResolution(req.path)) {
    return next();
  }

  // Extract superadmin context from request
  const tenantContext = extractTenantContext(req);
  
  if (!tenantContext) {
    // For authentication endpoints or superadmin registration, 
    // we might not have tenant context yet
    return handleNoTenantContext(req, res, next);
  }

  // Resolve tenant connection and inject into context
  tenantConnectionManager.getTenantConnection(tenantContext.superadminId)
    .then(db => {
      // Store tenant info and DB connection in request for reference
      req.tenant = {
        superadminId: tenantContext.superadminId,
        database: db,
        isMaster: false
      };

      // Continue to next middleware with tenant context
      next();
    })
    .catch(err => {
      console.error('Tenant resolution failed:', err);
      
      // If tenant doesn't exist, it might be a new superadmin registration
      if (err.message.includes('Tenant not found')) {
        return handleTenantNotFound(req, res, next, tenantContext);
      }
      
      // For other errors, return 500
      res.status(500).json({
        success: false,
        message: 'Database connection error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });
};

/**
 * Middleware for routes that can work with or without tenant context
 * (like authentication, superadmin registration, etc.)
 */
const flexibleTenantResolver = (req, res, next) => {
  // Skip tenant resolution for health checks
  if (shouldSkipTenantResolution(req.path)) {
    return next();
  }

  const tenantContext = extractTenantContext(req);
  
  if (!tenantContext) {
    // No tenant context - use master DB for auth/superadmin operations
    req.tenant = {
      superadminId: null,
      database: tenantConnectionManager.masterDb,
      isMaster: true
    };
    return next();
  }

  // Try to get tenant connection, but don't fail if it doesn't exist
  tenantConnectionManager.getTenantConnection(tenantContext.superadminId)
    .then(db => {
      req.tenant = {
        superadminId: tenantContext.superadminId,
        database: db,
        isMaster: false
      };
      next();
    })
    .catch(err => {
      // If tenant doesn't exist, fall back to master DB
      if (err.message.includes('Tenant not found')) {
        req.tenant = {
          superadminId: tenantContext.superadminId,
          database: tenantConnectionManager.masterDb,
          isMaster: true,
          tenantNotFound: true
        };
        next();
      } else {
        console.error('Tenant resolution failed:', err);
        res.status(500).json({
          success: false,
          message: 'Database connection error'
        });
      }
    });
};

/**
 * Middleware for master-only operations
 * (superadmin registration, tenant management, etc.)
 */
const masterOnlyResolver = (req, res, next) => {
  req.tenant = {
    superadminId: null,
    database: tenantConnectionManager.masterDb,
    isMaster: true
  };
  next();
};

/**
 * Extract tenant context from request
 */
function extractTenantContext(req) {
  // Try JWT token first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const jwt = require('jsonwebtoken');
      const decoded = require("../config/jwt").verifyToken(token);
      
      // Direct superadmin access
      if (decoded.role === 'superadmin') {
        return {
          superadminId: decoded.id,
          role: 'superadmin',
          userId: decoded.id
        };
      }
      
      // Other roles - get their superadmin from token or lookup
      if (decoded.superadminId) {
        return {
          superadminId: decoded.superadminId,
          role: decoded.role,
          userId: decoded.id
        };
      }
      
      // For non-superadmin roles without superadminId in token,
      // we would need to look up their hierarchy
      // This is a placeholder - in real implementation, you'd query the DB
      return null;
    } catch (err) {
      console.error('JWT decode error:', err);
    }
  }

  // Try session-based authentication
  if (req.session && req.session.user) {
    const user = req.session.user;
    
    if (user.role === 'superadmin') {
      return {
        superadminId: user.id,
        role: user.role,
        userId: user.id
      };
    }
    
    if (user.superadminId) {
      return {
        superadminId: user.superadminId,
        role: user.role,
        userId: user.id
      };
    }
  }

  // Try query parameters (for development/testing only)
  if (req.query.superadminId && process.env.NODE_ENV === 'development') {
    return {
      superadminId: req.query.superadminId,
      role: 'development',
      userId: null
    };
  }

  return null;
}

/**
 * Check if tenant resolution should be skipped
 */
function shouldSkipTenantResolution(path) {
  const skipPaths = [
    '/health',
    '/ping',
    '/api/health',
    '/api/ping',
    '/favicon.ico',
    '/static/',
    '/public/',
    '/css/',
    '/js/',
    '/images/'
  ];

  return skipPaths.some(skipPath => path.startsWith(skipPath));
}

/**
 * Handle requests without tenant context
 */
function handleNoTenantContext(req, res, next) {
  // For authentication endpoints, use master DB
  if (isAuthenticationEndpoint(req.path)) {
    req.tenant = {
      superadminId: null,
      database: tenantConnectionManager.masterDb,
      isMaster: true
    };
    return next();
  }

  // For other endpoints, this is likely an error
  res.status(401).json({
    success: false,
    message: 'Authentication required'
  });
}

/**
 * Handle tenant not found (likely new superadmin registration)
 */
function handleTenantNotFound(req, res, next, tenantContext) {
  // If this is a superadmin registration or tenant creation endpoint,
  // we can proceed with master DB
  if (isTenantCreationEndpoint(req.path) && req.method === 'POST') {
    req.tenant = {
      superadminId: tenantContext.superadminId,
      database: tenantConnectionManager.masterDb,
      isMaster: true,
      tenantNotFound: true
    };
    return next();
  }

  // Otherwise, the tenant doesn't exist
  res.status(404).json({
    success: false,
    message: 'Tenant not found'
  });
}

/**
 * Check if path is an authentication endpoint
 */
function isAuthenticationEndpoint(path) {
  const authPaths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify-otp',
    '/api/superadmin/register',
    '/api/superadmin/login'
  ];

  return authPaths.some(authPath => path.startsWith(authPath));
}

/**
 * Check if path is a tenant creation endpoint
 */
function isTenantCreationEndpoint(path) {
  const tenantPaths = [
    '/api/superadmin/create-tenant',
    '/api/tenant/create',
    '/api/admin/register'
  ];

  return tenantPaths.some(tenantPath => path.startsWith(tenantPath));
}

/**
 * Helper function to get current database connection
 * This can be used in controllers and services
 */
function getCurrentDb(req) {
  if (req.tenant && req.tenant.database) {
    return req.tenant.database;
  }
  
  // Fallback to tenant connection manager
  return tenantConnectionManager.getDb();
}

/**
 * Helper function to check if current request is using master DB
 */
function isMasterDb(req) {
  return req.tenant ? req.tenant.isMaster : false;
}

/**
 * Helper function to get current superadmin ID
 */
function getCurrentSuperadminId(req) {
  return req.tenant ? req.tenant.superadminId : null;
}

/**
 * Error handling middleware for tenant resolution errors
 */
const tenantErrorHandler = (err, req, res, next) => {
  if (err.message && err.message.includes('Tenant')) {
    console.error('Tenant error:', err);
    return res.status(500).json({
      success: false,
      message: 'Tenant database error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  next(err);
};

module.exports = {
  tenantResolver,
  flexibleTenantResolver,
  masterOnlyResolver,
  tenantErrorHandler,
  getCurrentDb,
  isMasterDb,
  getCurrentSuperadminId
};
