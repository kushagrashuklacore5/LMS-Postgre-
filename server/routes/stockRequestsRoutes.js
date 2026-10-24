const express = require('express');
const router = express.Router();
const db = require('../config/database-switch');
const authMiddleware = require('../middleware/authMiddleware');

// Helper function to generate unique request number
const generateRequestNumber = (universityId) => {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `SR-${year}-${random}`;
};

// Helper function to calculate request total
const calculateRequestTotal = (requestId, callback) => {
  db.get(
    'SELECT COALESCE(SUM(total_price), 0) as total FROM stock_request_items WHERE request_id = ?',
    [requestId],
    (err, result) => {
      if (err) callback(err, 0);
      else callback(null, result.total);
    }
  );
};

/**
 * GET /api/stock-requests
 * Get all stock requests with filtering and pagination
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    const { status, urgency, page = 1, limit = 20, search } = req.query;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Get user's university_id
    db.get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      let query = `
        SELECT sr.*, u.name as storekeeper_name,
               COUNT(sri.id) as item_count
        FROM stock_requests sr
        LEFT JOIN users u ON sr.storekeeper_id = u.id
        LEFT JOIN stock_request_items sri ON sr.id = sri.request_id
        WHERE sr.university_id = ?
      `;
      
      const params = [user.university_id];

      // Add filters
      if (status) {
        query += ' AND sr.status = ?';
        params.push(status);
      }
      
      if (urgency) {
        query += ' AND sr.urgency_level = ?';
        params.push(urgency);
      }
      
      if (search) {
        query += ' AND (sr.title ILIKE ? OR sr.description ILIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ' GROUP BY sr.id, u.name ORDER BY sr.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

      db.all(query, params, (err, requests) => {
        if (err) {
          console.error('Get stock requests error:', err);
          return res.status(500).json({ success: false, message: 'Failed to fetch requests' });
        }

        // Get total count for pagination
        const countQuery = `
          SELECT COUNT(DISTINCT sr.id) as total 
          FROM stock_requests sr 
          WHERE sr.university_id = ?
          ${status ? 'AND sr.status = ?' : ''}
          ${urgency ? 'AND sr.urgency_level = ?' : ''}
          ${search ? 'AND (sr.title ILIKE ? OR sr.description ILIKE ?)' : ''}
        `;
        
        const countParams = [user.university_id];
        if (status) countParams.push(status);
        if (urgency) countParams.push(urgency);
        if (search) countParams.push(`%${search}%`, `%${search}%`);

        db.get(countQuery, countParams, (err, countResult) => {
          if (err) {
            console.error('Count error:', err);
            return res.status(500).json({ success: false, message: 'Failed to count requests' });
          }

          res.status(200).json({
            success: true,
            data: requests || [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: countResult.total,
              pages: Math.ceil(countResult.total / parseInt(limit))
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('Get stock requests error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/stock-requests/:id
 * Get specific stock request with items
 */
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Get user's university_id
    db.get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Get request details
      db.get(
        `SELECT sr.*, u.name as storekeeper_name, 
                approver.name as approved_by_name
         FROM stock_requests sr
         LEFT JOIN users u ON sr.storekeeper_id = u.id
         LEFT JOIN users approver ON sr.approved_by = approver.id
         WHERE sr.id = ? AND sr.university_id = ?`,
        [id, user.university_id],
        (err, request) => {
          if (err) {
            console.error('Get request error:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch request' });
          }

          if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
          }

          // Get request items
          db.all(
            `SELECT sri.*, v.name as vendor_name
             FROM stock_request_items sri
             LEFT JOIN vendors v ON sri.vendor_id = v.id
             WHERE sri.request_id = ?
             ORDER BY sri.created_at`,
            [id],
            (err, items) => {
              if (err) {
                console.error('Get items error:', err);
                return res.status(500).json({ success: false, message: 'Failed to fetch items' });
              }

              // Get quotes for this request
              db.all(
                `SELECT vq.*, v.name as vendor_name
                 FROM vendor_quotes vq
                 LEFT JOIN vendors v ON vq.vendor_id = v.id
                 WHERE vq.request_id = ?
                 ORDER BY vq.created_at DESC`,
                [id],
                (err, quotes) => {
                  if (err) {
                    console.error('Get quotes error:', err);
                    return res.status(500).json({ success: false, message: 'Failed to fetch quotes' });
                  }

                  res.status(200).json({
                    success: true,
                    data: {
                      ...request,
                      items: items || [],
                      quotes: quotes || []
                    }
                  });
                }
              );
            }
          );
        }
      );
    });
  } catch (error) {
    console.error('Get stock request error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/stock-requests
 * Create new stock request
 */
router.post('/', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    const { 
      title, description, urgency_level = 'normal', 
      expected_delivery_date, budget_code, department, requested_by,
      items 
    } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!title || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Title and at least one item are required' });
    }

    // Get user's university_id
    db.get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const requestNumber = generateRequestNumber(user.university_id);

      // Create stock request
      db.run(
        `INSERT INTO stock_requests (
          request_number, storekeeper_id, university_id, title, description, 
          urgency_level, expected_delivery_date, budget_code, department, requested_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          requestNumber, userId, user.university_id, title, description,
          urgency_level, expected_delivery_date, budget_code, department, requested_by
        ],
        function(err) {
          if (err) {
            console.error('Create request error:', err);
            return res.status(500).json({ success: false, message: 'Failed to create request' });
          }

          const requestId = this.lastID;

          // Insert request items
          const itemPromises = items.map(item => {
            return new Promise((resolve, reject) => {
              const totalPrice = (item.quantity_requested || 1) * (item.unit_price || 0);
              
              db.run(
                `INSERT INTO stock_request_items (
                  request_id, vendor_id, item_name, item_code, category, 
                  quantity_requested, unit_price, total_price, specifications,
                  preferred_brand, alternatives_allowed
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  requestId, item.vendor_id || null, item.item_name, item.item_code,
                  item.category, item.quantity_requested, item.unit_price,
                  totalPrice, item.specifications, item.preferred_brand,
                  item.alternatives_allowed !== false
                ],
                function(err) {
                  if (err) reject(err);
                  else resolve(this.lastID);
                }
              );
            });
          });

          Promise.all(itemPromises)
            .then(() => {
              // Calculate and update total amount
              calculateRequestTotal(requestId, (err, total) => {
                if (!err) {
                  db.run(
                    'UPDATE stock_requests SET total_amount = ? WHERE id = ?',
                    [total, requestId]
                  );
                }
              });

              // Create notification
              db.run(
                `INSERT INTO request_notifications (request_id, user_id, type, message)
                 VALUES (?, ?, 'created', ?)`,
                [requestId, userId, `New stock request ${requestNumber} created`]
              );

              res.status(201).json({
                success: true,
                message: 'Stock request created successfully',
                data: { id: requestId, request_number: requestNumber }
              });
            })
            .catch(err => {
              console.error('Insert items error:', err);
              res.status(500).json({ success: false, message: 'Failed to add items to request' });
            });
        }
      );
    });
  } catch (error) {
    console.error('Create stock request error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/stock-requests/:id
 * Update stock request
 */
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { 
      title, description, urgency_level, expected_delivery_date, 
      budget_code, department, requested_by, status 
    } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Get user's university_id
    db.get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Update request
      db.run(
        `UPDATE stock_requests SET 
          title = ?, description = ?, urgency_level = ?, 
          expected_delivery_date = ?, budget_code = ?, department = ?, 
          requested_by = ?, status = ?
        WHERE id = ? AND university_id = ?`,
        [
          title, description, urgency_level, expected_delivery_date,
          budget_code, department, requested_by, status, id, user.university_id
        ],
        function(err) {
          if (err) {
            console.error('Update request error:', err);
            return res.status(500).json({ success: false, message: 'Failed to update request' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Request not found' });
          }

          res.status(200).json({
            success: true,
            message: 'Stock request updated successfully'
          });
        }
      );
    });
  } catch (error) {
    console.error('Update stock request error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/stock-requests/:id
 * Delete stock request
 */
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Get user's university_id
    db.get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Delete request (cascade will delete items and notifications)
      db.run(
        'DELETE FROM stock_requests WHERE id = ? AND university_id = ?',
        [id, user.university_id],
        function(err) {
          if (err) {
            console.error('Delete request error:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete request' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Request not found' });
          }

          res.status(200).json({
            success: true,
            message: 'Stock request deleted successfully'
          });
        }
      );
    });
  } catch (error) {
    console.error('Delete stock request error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/stock-requests/dashboard/stats
 * Get dashboard statistics
 */
router.get('/dashboard/stats', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Get user's university_id
    db.get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const stats = {
        total: 0,
        draft: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        delivered: 0,
        totalValue: 0
      };

      // Get request statistics
      db.all(
        'SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as value FROM stock_requests WHERE university_id = ? GROUP BY status',
        [user.university_id],
        (err, results) => {
          if (err) {
            console.error('Get stats error:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
          }

          results.forEach(result => {
            stats[result.status] = result.count;
            stats.total += result.count;
            stats.totalValue += result.value;
          });

          // Get recent activity
          db.all(
            `SELECT sr.id, sr.request_number, sr.title, sr.status, sr.created_at,
                    u.name as storekeeper_name
             FROM stock_requests sr
             LEFT JOIN users u ON sr.storekeeper_id = u.id
             WHERE sr.university_id = ?
             ORDER BY sr.created_at DESC
             LIMIT 5`,
            [user.university_id],
            (err, recent) => {
              if (err) {
                console.error('Get recent error:', err);
                return res.status(500).json({ success: false, message: 'Failed to fetch recent activity' });
              }

              res.status(200).json({
                success: true,
                data: {
                  stats,
                  recent: recent || []
                }
              });
            }
          );
        }
      );
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
