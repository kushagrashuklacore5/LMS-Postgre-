const jwt = require('jsonwebtoken');
const tenantConnectionManager = require('../config/tenant-connection-manager');

/**
 * Tenant Resolution Middleware
 * 
 * This middleware runs on every authenticated request and:
 * 1. Extracts the superadmin ID from the verified JWT payload
 * 2. Calls TenantConnectionManager.getPool(superadminId)
 * 3. Attaches the resolved pool/client to req.tenantDb
 * 4. If resolution fails, returns HTTP 503
 */
const tenantResolution = async (req, res, next) => {
  try {
    // Skip tenant resolution for login and register endpoints
    if (req.path.includes('/login') || req.path.includes('/register')) {
      return next();
    }

    // Extract superadmin ID from JWT token
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'missing_token',
        message: 'Authentication token is required'
      });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable is not set');
      return res.status(500).json({
        success: false,
        error: 'server_error',
        message: 'Server configuration error'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'token_expired',
          message: 'Authentication token has expired'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'invalid_token',
          message: 'Invalid authentication token'
        });
      } else {
        console.error('JWT verification error:', jwtError);
        return res.status(401).json({
          success: false,
          error: 'invalid_token',
          message: 'Token verification failed'
        });
      }
    }

    // Verify the token has the required structure
    if (!decoded.superadminId || !decoded.role) {
      return res.status(401).json({
        success: false,
        error: 'invalid_token',
        message: 'Token is missing required fields'
      });
    }

    // Get tenant database pool
    try {
      const tenantPool = await tenantConnectionManager.getPool(decoded.superadminId);
      
      // Attach the tenant pool to the request
      req.tenantDb = tenantPool;
      req.user = decoded;
      
      next();
    } catch (tenantError) {
      console.error('Tenant resolution error:', tenantError);
      
      if (tenantError.message.includes('Tenant not found')) {
        return res.status(403).json({
          success: false,
          error: 'tenant_not_found',
          message: 'Tenant database not found'
        });
      } else if (tenantError.code === 'ECONNREFUSED' || tenantError.code === 'ENOTFOUND') {
        return res.status(503).json({
          success: false,
          error: 'tenant_db_unavailable',
          message: 'Tenant database is temporarily unavailable'
        });
      } else {
        return res.status(503).json({
          success: false,
          error: 'tenant_db_unavailable',
          message: 'Failed to connect to tenant database'
        });
      }
    }
  } catch (error) {
    console.error('Tenant resolution middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Internal server error during tenant resolution'
    });
  }
};

module.exports = tenantResolution;
