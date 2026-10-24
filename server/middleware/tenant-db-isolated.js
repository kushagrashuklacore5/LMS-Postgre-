
const { getTenantDatabase, mainDb } = require('../config/multi-tenant-db-isolated');

// Middleware to attach appropriate database to request
function tenantDatabaseIsolation(req, res, next) {
  try {
    // Get user from authentication middleware
    const user = req.user;
    
    console.log(`
=== STRICT Tenant Database Isolation ===`);
    console.log(`Request: ${req.method} ${req.originalUrl}`);
    console.log(`User exists:`, !!user);
    console.log(`User role:`, user?.role);
    console.log(`User email:`, user?.email);
    
    if (!user) {
      console.error('No user found in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    console.log(`User: ${user.email} (${user.role})`);
    console.log(`Request: ${req.method} ${req.originalUrl}`);

    // CRITICAL: Internal admin portal routes use MAIN database ONLY
    if (req.originalUrl.includes('/internal/')) {
      console.log('🔒 Using MAIN database for internal admin portal');
      req.db = mainDb;
      req.isMainDb = true;
      req.tenantId = null;
      next();
      return;
    }

    // CRITICAL: Superadmin users get their OWN tenant database
    if (user.role === 'superadmin') {
      const superadminId = user.userId || user.id;
      const tenantDb = getTenantDatabase(superadminId);
      console.log(`🔒 Using TENANT database for superadmin: ${superadminId}`);
      req.db = tenantDb;
      req.tenantId = superadminId;
      req.isMainDb = false;
      req.superadminId = superadminId;
      next();
      return;
    }

    // CRITICAL: All other users MUST have superadminId and use that tenant database
    if (user.superadminId) {
      const tenantDb = getTenantDatabase(user.superadminId);
      console.log(`🔒 Using TENANT database for user ${user.userId} (superadmin: ${user.superadminId})`);
      req.db = tenantDb;
      req.tenantId = user.superadminId;
      req.isMainDb = false;
      req.superadminId = user.superadminId;
      next();
      return;
    }

    // CRITICAL: No fallback - this prevents any database sharing
    console.error('🚨 DATABASE ISOLATION BREACH: User without proper superadmin assignment:', user);
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied: User database assignment error' 
    });
    
  } catch (error) {
    console.error('🚨 Tenant database isolation error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Database connection error' 
    });
  }
}

module.exports = tenantDatabaseIsolation;
