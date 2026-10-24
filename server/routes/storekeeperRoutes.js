const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../config/database-switch');

// Helper function to get database from request context or fallback to master
function getDatabaseFromRequest(req) {
  return req.tenant?.database || db;
}

/**
 * GET /api/storekeeper/vendors
 * Get all vendors for storekeeper's university
 */
router.get('/vendors', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    
    console.log('GET /vendors - Request received');
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Storekeeper not authenticated' });
    }
    
    // Get user's university_id
    getDatabaseFromRequest(req).get(
      'SELECT university_id FROM users WHERE id = ?',
      [userId],
      (err, user) => {
        if (err) {
          console.error('Get user error:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
        }
        
        if (!user) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Get vendors for this university
        getDatabaseFromRequest(req).all(
          'SELECT * FROM vendors WHERE university_id = ? ORDER BY name',
          [user.university_id],
          (err, vendors) => {
            if (err) {
              console.error('Get vendors error:', err);
              return res.status(500).json({ success: false, message: 'Failed to fetch vendors' });
            }

            console.log('Vendors loaded:', vendors.length);
            res.status(200).json({ 
              success: true, 
              data: vendors || []
            });
          }
        );
      }
    );
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/storekeeper/inventory
 * Get all inventory items for storekeeper's university
 */
router.get('/inventory', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Storekeeper not authenticated' });
    }
    
    // Get user's university_id
    getDatabaseFromRequest(req).get(
      'SELECT university_id FROM users WHERE id = ?',
      [userId],
      (err, user) => {
        if (err) {
          console.error('Get user error:', err);
          return res.status(500).json({ success: false, message: 'Failed to get user info' });
        }
        
        if (!user) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Get all inventory items for this university
        getDatabaseFromRequest(req).all(
          'SELECT * FROM inventory WHERE university_id = ? ORDER BY id DESC',
          [user.university_id],
          (err, items) => {
            if (err) {
              console.error('Get inventory error:', err);
              return res.status(500).json({ success: false, message: 'Failed to load inventory' });
            }

            res.status(200).json({ success: true, data: items });
          }
        );
      }
    );
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/storekeeper/vendor-stock
 * Get all vendor stock items for storekeeper's university
 */
router.get('/vendor-stock', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    
    console.log('GET /vendor-stock - Request received');
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Storekeeper not authenticated' });
    }
    
    // Get user's university_id
    getDatabaseFromRequest(req).get(
      'SELECT university_id FROM users WHERE id = ?',
      [userId],
      (err, user) => {
        if (err) {
          console.error('Get user error:', err);
          return res.status(500).json({ success: false, message: 'Failed to get user info' });
        }
        
        if (!user) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Get all vendor stock items for this university
        getDatabaseFromRequest(req).all(
          'SELECT vs.*, v.name as vendorName FROM vendor_stock vs LEFT JOIN vendors v ON vs.vendorId = v.id WHERE v.university_id = ? ORDER BY vs.id DESC',
          [user.university_id],
          (err, stockItems) => {
            if (err) {
              console.error('Get vendor stock error:', err);
              return res.status(500).json({ success: false, message: 'Failed to load vendor stock' });
            }

            console.log('Vendor stock loaded:', stockItems.length);
            res.status(200).json({ success: true, data: stockItems });
          }
        );
      }
    );
  } catch (error) {
    console.error('Get vendor stock error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
