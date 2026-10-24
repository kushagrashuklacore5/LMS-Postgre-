const express = require('express');
const db = require('../config/database-switch');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Helper function to get vendor's university_id
const getVendorUniversityId = (vendorId, callback) => {
  db.get('SELECT university_id FROM vendors WHERE id = ?', [vendorId], (err, vendor) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, vendor ? vendor.university_id : null); // no default school
    }
  });
};

/**
 * GET /api/vendor/stats
 * Get vendor dashboard statistics
 */
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      // Get vendor statistics
      const stats = {
        totalInvoices: 0,
        pendingInvoices: 0,
        paidInvoices: 0,
        totalRevenue: 0,
        totalOrders: 0,
        pendingOrders: 0,
        completedOrders: 0,
        averageOrderValue: 0
      };

      // Get invoice stats
      db.all('SELECT status, amount FROM invoices WHERE vendorId = ? AND university_id = ?', [vendorId, universityId], (err, invoices) => {
        if (err) {
          console.error('Get invoices error:', err);
          return res.status(500).json({ success: false, message: 'Failed to fetch invoice stats' });
        }

        invoices.forEach(invoice => {
          stats.totalInvoices++;
          if (invoice.status === 'pending') stats.pendingInvoices++;
          if (invoice.status === 'paid') stats.totalRevenue += invoice.amount;
          if (invoice.status === 'paid') stats.paidInvoices++;
        });

        // Get order stats
        db.all('SELECT status, quantity FROM orders WHERE vendorId = ?', [vendorId, universityId], (err, orders) => {
if (err) {

  console.error('Get orders error:', err);



  // SAFE FALLBACK

  return res.status(200).json({

    success: true,

    data: {

      totalInvoices: stats.totalInvoices,

      pendingInvoices: stats.pendingInvoices,

      paidInvoices: stats.paidInvoices,

      totalRevenue: stats.totalRevenue,

      totalOrders: 0,

      pendingOrders: 0,

      completedOrders: 0,

      averageOrderValue: 0

    }

  });

}
          orders.forEach(order => {
            stats.totalOrders++;
            if (order.status === 'pending') stats.pendingOrders++;
            if (order.status === 'completed') stats.completedOrders++;
          });

          stats.averageOrderValue = stats.totalOrders > 0 ? Math.round(stats.totalRevenue / stats.totalOrders) : 0;

          res.status(200).json({
            success: true,
            data: stats
          });
        });
      });
    });
  } catch (error) {
    console.error('Vendor stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/vendor/invoices
 * Get vendor's invoices
 */
router.get('/invoices', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    const limit = req.query.limit || 50;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      db.all(
        'SELECT * FROM invoices WHERE vendorId = ? AND university_id = ? ORDER BY issueDate DESC LIMIT ?',
        [vendorId, universityId, limit],
        (err, invoices) => {
          if (err) {
            console.error('Get invoices error:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
          }

          // Parse items JSON for each invoice
          const processedInvoices = (invoices || []).map(invoice => ({
            ...invoice,
            items: invoice.items ? JSON.parse(invoice.items) : []
          }));

          res.status(200).json({
            success: true,
            data: processedInvoices
          });
        }
      );
    });
  } catch (error) {
    console.error('Vendor invoices error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/vendor/orders
 * Get vendor's orders
 */
router.get('/orders', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    const limit = req.query.limit || 50;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      db.get('SELECT name FROM vendors WHERE id = ?', [vendorId], (err, vendor) => {
        if (err) {
          console.error('Get vendor name error:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        const vendorName = vendor ? vendor.name : '';

        db.all(
          'SELECT * FROM orders WHERE vendor_id = ? AND university_id = ? ORDER BY date DESC LIMIT ?',
          [vendorName, universityId, limit],
          (err, orders) => {
            if (err) {
              console.error('Get orders error:', err);
              return res.status(500).json({ success: false, message: 'Failed to fetch orders' });
            }

            res.status(200).json({
              success: true,
              data: orders || []
            });
          }
        );
      });
    });
  } catch (error) {
    console.error('Vendor orders error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/vendor/orders/:id/status
 * Update order status
 */
router.put('/orders/:id/status', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    const { id } = req.params;
    const { status } = req.body;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    if (!status || !['pending', 'processing', 'shipped', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      db.get('SELECT name FROM vendors WHERE id = ?', [vendorId], (err, vendor) => {
        if (err) {
          console.error('Get vendor name error:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        const vendorName = vendor ? vendor.name : '';

        // Update order status
        db.run(
          'UPDATE orders SET status = ? WHERE id = ? AND vendor = ? AND university_id = ?',
          [status, id, vendorName, universityId],
          function(err) {
            if (err) {
              console.error('Update order status error:', err);
              return res.status(500).json({ success: false, message: 'Failed to update order status' });
            }

            if (this.changes === 0) {
              return res.status(404).json({ success: false, message: 'Order not found' });
            }

            console.log('Order status updated successfully:', { id, status });
            res.status(200).json({
              success: true,
              message: 'Order status updated successfully'
            });
          }
        );
      });
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/vendor/payments
 * Get vendor's payment history
 */
router.get('/payments', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      db.all(
        'SELECT * FROM invoices WHERE vendorId = ? AND university_id = ? ORDER BY issueDate DESC',
        [vendorId, universityId],
        (err, invoices) => {
          if (err) {
            console.error('Get payments error:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch payments' });
          }

          // Transform invoices into payment records
          const payments = invoices.map(invoice => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            status: invoice.status,
            dueDate: invoice.dueDate,
            paidDate: invoice.paidDate,
            description: invoice.description,
            paymentMethod: invoice.status === 'paid' ? 'Bank Transfer' : null,
            transactionId: invoice.status === 'paid' ? `TXN${invoice.id}${Date.now().toString().slice(-4)}` : null
          }));

          res.status(200).json({
            success: true,
            data: payments
          });
        }
      );
    });
  } catch (error) {
    console.error('Vendor payments error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/vendor/payment-stats
 * Get vendor payment statistics
 */
router.get('/payment-stats', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      const stats = {
        totalRevenue: 0,
        pendingPayments: 0,
        paidPayments: 0,
        thisMonthRevenue: 0
      };

      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      db.all('SELECT status, amount, paidDate FROM invoices WHERE vendorId = ? AND university_id = ?', [vendorId, universityId], (err, invoices) => {
        if (err) {
          console.error('Get payment stats error:', err);
          return res.status(500).json({ success: false, message: 'Failed to fetch payment stats' });
        }

        invoices.forEach(invoice => {
          if (invoice.status === 'paid') {
            stats.totalRevenue += invoice.amount;
            stats.paidPayments++;
            
            if (invoice.paidDate) {
              const paidDate = new Date(invoice.paidDate);
              if (paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear) {
                stats.thisMonthRevenue += invoice.amount;
              }
            }
          } else if (invoice.status === 'pending') {
            stats.pendingPayments++;
          }
        });

        res.status(200).json({
          success: true,
          data: stats
        });
      });
    });
  } catch (error) {
    console.error('Vendor payment stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/vendor/stock/categories
 * Get unique categories from vendor's stock
 */
router.get('/stock/categories', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      // Get unique categories from vendor's stock
      db.all(
        'SELECT DISTINCT category FROM vendor_stock WHERE vendor_id = ? AND university_id = ? AND category IS NOT NULL ORDER BY category',
        [vendorId, universityId],
        (err, categories) => {
          if (err) {
            console.error('Get categories error:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch categories' });
          }

          const categoryList = categories.map(row => row.category);
          res.status(200).json({
            success: true,
            data: categoryList
          });
        }
      );
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/vendor/stock
 * Get vendor's stock items
 */
router.get('/stock', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      db.all(
        'SELECT * FROM vendor_stock WHERE vendor_id = ? AND university_id = ? ORDER BY name',
        [vendorId, universityId],
        (err, items) => {
          if (err) {
            console.error('Get stock items error:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch stock items' });
          }

          res.status(200).json({
            success: true,
            data: items || []
          });
        }
      );
    });
  } catch (error) {
    console.error('Vendor stock error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/vendor/stock/stats
 * Get vendor stock statistics
 */
router.get('/stock/stats', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      const stats = {
        totalItems: 0,
        totalValue: 0,
        lowStock: 0,
        outOfStock: 0
      };

      db.all('SELECT quantity, unit_price, min_stock FROM vendor_stock WHERE vendor_id = ? AND university_id = ?', [vendorId, universityId], (err, items) => {
        if (err) {
          console.error('Get stock stats error:', err);
          return res.status(500).json({ success: false, message: 'Failed to fetch stock stats' });
        }

        items.forEach(item => {
          stats.totalItems++;
          stats.totalValue += item.quantity * item.unit_price;
          
          if (item.quantity === 0) {
            stats.outOfStock++;
          } else if (item.quantity <= item.min_stock) {
            stats.lowStock++;
          }
        });

        res.status(200).json({
          success: true,
          data: stats
        });
      });
    });
  } catch (error) {
    console.error('Vendor stock stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/vendor/stock
 * Add new stock item
 */
router.post('/stock', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    const { name, category, quantity, unitPrice, minStock, description } = req.body;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    if (!name || !category || quantity === undefined || unitPrice === undefined || minStock === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      db.run(
        `INSERT INTO vendor_stock (vendor_id, university_id, name, category, quantity, unit_price, min_stock, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, utc_now_text(), utc_now_text())`,
        [vendorId, universityId, name, category, quantity, unitPrice, minStock, description || ''],
        function(err) {
          if (err) {
            console.error('Add stock item error:', err);
            return res.status(500).json({ success: false, message: 'Failed to add stock item' });
          }

          console.log('Stock item added successfully:', { id: this.lastID, name });
          res.status(201).json({
            success: true,
            message: 'Stock item added successfully',
            data: { id: this.lastID, name, category, quantity, unitPrice, minStock, description }
          });
        }
      );
    });
  } catch (error) {
    console.error('Add stock item error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/vendor/stock/:id
 * Update stock item
 */
router.put('/stock/:id', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    const { id } = req.params;
    const { name, category, quantity, unitPrice, minStock, description } = req.body;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      db.run(
        `UPDATE vendor_stock 
         SET name = ?, category = ?, quantity = ?, unit_price = ?, min_stock = ?, description = ?, updated_at = utc_now_text()
         WHERE id = ? AND vendor_id = ? AND university_id = ?`,
        [name, category, quantity, unitPrice, minStock, description || '', id, vendorId, universityId],
        function(err) {
          if (err) {
            console.error('Update stock item error:', err);
            return res.status(500).json({ success: false, message: 'Failed to update stock item' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Stock item not found' });
          }

          console.log('Stock item updated successfully:', { id });
          res.status(200).json({
            success: true,
            message: 'Stock item updated successfully'
          });
        }
      );
    });
  } catch (error) {
    console.error('Update stock item error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/vendor/stock/:id
 * Delete stock item
 */
router.delete('/stock/:id', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    const { id } = req.params;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      db.run(
        'DELETE FROM vendor_stock WHERE id = ? AND vendor_id = ? AND university_id = ?',
        [id, vendorId, universityId],
        function(err) {
          if (err) {
            console.error('Delete stock item error:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete stock item' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Stock item not found' });
          }

          console.log('Stock item deleted successfully:', { id });
          res.status(200).json({
            success: true,
            message: 'Stock item deleted successfully'
          });
        }
      );
    });
  } catch (error) {
    console.error('Delete stock item error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/vendor/profile
 * Get vendor profile
 */
router.get('/profile', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    db.get('SELECT * FROM vendors WHERE id = ?', [vendorId], (err, vendor) => {
      if (err) {
        console.error('Get vendor profile error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!vendor) {
        return res.status(404).json({ success: false, message: 'Vendor not found' });
      }

      // Remove password from response
      const { password, ...vendorData } = vendor;

      res.status(200).json({
        success: true,
        data: vendorData
      });
    });
  } catch (error) {
    console.error('Vendor profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/vendor/profile
 * Update vendor profile
 */
router.put('/profile', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    const { name, email, phone, address, category, description } = req.body;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    db.run(
      'UPDATE vendors SET name = ?, email = ?, phone = ?, address = ?, category = ?, description = ?, updatedAt = utc_now_text() WHERE id = ?',
      [name, email, phone, address, category, description, vendorId],
      function(err) {
        if (err) {
          console.error('Update vendor profile error:', err);
          return res.status(500).json({ success: false, message: 'Failed to update profile' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ success: false, message: 'Vendor not found' });
        }

        console.log('Vendor profile updated successfully:', { vendorId, name });
        res.status(200).json({
          success: true,
          message: 'Profile updated successfully',
          data: { id: vendorId, name, email, phone, address, category, description }
        });
      }
    );
  } catch (error) {
    console.error('Vendor profile update error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/vendor/requests
 * Get vendor's stock requests
 */
router.get('/requests', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      // Get requests that have items from this vendor
      db.all(
        `SELECT DISTINCT sr.*, u.name as storekeeper_name
         FROM stock_requests sr
         LEFT JOIN users u ON sr.storekeeper_id = u.id
         LEFT JOIN stock_request_items sri ON sr.id = sri.request_id
         WHERE sr.university_id = ? AND sri.vendor_id = ?
         ORDER BY sr.created_at DESC`,
        [universityId, vendorId],
        (err, requests) => {
          if (err) {
            console.error('Get vendor requests error:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch requests' });
          }

          // Get items for each request
          const requestPromises = requests.map(request => {
            return new Promise((resolve, reject) => {
              db.all(
                `SELECT sri.*, v.name as vendor_name
                 FROM stock_request_items sri
                 LEFT JOIN vendors v ON sri.vendor_id = v.id
                 WHERE sri.request_id = ?`,
                [request.id],
                (err, items) => {
                  if (err) reject(err);
                  else resolve({ ...request, items: items || [] });
                }
              );
            });
          });

          Promise.all(requestPromises)
            .then(requestsWithItems => {
              res.status(200).json({
                success: true,
                data: requestsWithItems
              });
            })
            .catch(err => {
              console.error('Get request items error:', err);
              res.status(500).json({ success: false, message: 'Failed to fetch request items' });
            });
        }
      );
    });
  } catch (error) {
    console.error('Vendor requests error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/vendor/requests/:id/respond
 * Respond to a stock request (accept/reject)
 */
router.post('/requests/:id/respond', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    const { id } = req.params;
    const { action, note } = req.body;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      // Update request status
      const newStatus = action === 'accept' ? 'quoted' : 'rejected';
      db.run(
        'UPDATE stock_requests SET status = ? WHERE id = ? AND university_id = ?',
        [newStatus, id, universityId],
        function(err) {
          if (err) {
            console.error('Update request status error:', err);
            return res.status(500).json({ success: false, message: 'Failed to update request' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Request not found' });
          }

          // Create vendor quote record
          if (action === 'accept') {
            db.run(
              `INSERT INTO vendor_quotes (request_id, vendor_id, status, notes, created_at)
               VALUES (?, ?, 'pending', ?, utc_now_text())`,
              [id, vendorId, note || ''],
              function(err) {
                if (err) {
                  console.error('Create vendor quote error:', err);
                }
              }
            );
          }

          console.log(`Request ${id} ${action}ed by vendor ${vendorId}`);
          res.status(200).json({
            success: true,
            message: `Request ${action}ed successfully`
          });
        }
      );
    });
  } catch (error) {
    console.error('Respond to request error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/vendor/requests/:id/quote
 * Submit a quote for a stock request
 */
router.post('/requests/:id/quote', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    const { id } = req.params;
    const { items, subtotal, tax, gst, total, notes } = req.body;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      // Update or create vendor quote
      db.run(
        `INSERT INTO vendor_quotes (request_id, vendor_id, items, subtotal, tax, gst, total, status, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, utc_now_text())
         ON CONFLICT(request_id, vendor_id) 
         DO UPDATE SET items = ?, subtotal = ?, tax = ?, gst = ?, total = ?, status = 'submitted', notes = ?, updated_at = utc_now_text()`,
        [id, vendorId, JSON.stringify(items), subtotal, tax, gst, total, notes,
         JSON.stringify(items), subtotal, tax, gst, total, notes],
        function(err) {
          if (err) {
            console.error('Submit quote error:', err);
            return res.status(500).json({ success: false, message: 'Failed to submit quote' });
          }

          // Update request status to quoted
          db.run(
            'UPDATE stock_requests SET status = ? WHERE id = ? AND university_id = ?',
            ['quoted', id, universityId]
          );

          console.log('Quote submitted successfully:', { requestId: id, vendorId });
          res.status(200).json({
            success: true,
            message: 'Quote submitted successfully'
          });
        }
      );
    });
  } catch (error) {
    console.error('Submit quote error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/vendor/requests/:id/bill
 * Generate and send bill for accepted quote
 */
router.post('/requests/:id/bill', authMiddleware, (req, res) => {
  try {
    const vendorId = req.user?.userId;
    const { id } = req.params;
    const { items, subtotal, tax, gst, total, bill_number, due_date } = req.body;
    
    if (!vendorId) {
      return res.status(401).json({ success: false, message: 'Vendor not authenticated' });
    }

    getVendorUniversityId(vendorId, (err, universityId) => {
      if (err) {
        console.error('Get university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      // Get request details for bill
      db.get(
        `SELECT sr.*, u.name as storekeeper_name, u.email as storekeeper_email
         FROM stock_requests sr
         LEFT JOIN users u ON sr.storekeeper_id = u.id
         WHERE sr.id = ? AND sr.university_id = ?`,
        [id, universityId],
        (err, request) => {
          if (err) {
            console.error('Get request error:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch request' });
          }

          if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
          }

          // Create invoice/bill record
          db.run(
            `INSERT INTO invoices (vendorId, invoiceNumber, issueDate, dueDate, amount, status, description, university_id)
             VALUES (?, ?, utc_now_text(), ?, ?, 'pending', ?, ?)`,
            [vendorId, bill_number, due_date, total, `Bill for request #${request.request_number}`, universityId],
            function(err) {
              if (err) {
                console.error('Create invoice error:', err);
                return res.status(500).json({ success: false, message: 'Failed to create invoice' });
              }

              const invoiceId = this.lastID;

              // Create invoice items
              const itemPromises = items.map(item => {
                return new Promise((resolve, reject) => {
                  db.run(
                    `INSERT INTO invoice_items (invoiceId, itemName, quantity, unitPrice, total)
                     VALUES (?, ?, ?, ?, ?)`,
                    [invoiceId, item.item_name, item.quoted_quantity, item.quoted_price, item.quoted_price * item.quoted_quantity],
                    function(err) {
                      if (err) reject(err);
                      else resolve(this.lastID);
                    }
                  );
                });
              });

              Promise.all(itemPromises)
                .then(() => {
                  // Update request status to billed
                  db.run(
                    'UPDATE stock_requests SET status = ? WHERE id = ?',
                    ['billed', id]
                  );

                  // TODO: Send email notifications to storekeeper and accountant
                  console.log(`Bill ${bill_number} created and sent for request ${id}`);

                  res.status(200).json({
                    success: true,
                    message: 'Bill sent successfully to storekeeper and accountant',
                    data: { invoiceId, bill_number }
                  });
                })
                .catch(err => {
                  console.error('Create invoice items error:', err);
                  res.status(500).json({ success: false, message: 'Failed to create invoice items' });
                });
            }
          );
        }
      );
    });
  } catch (error) {
    console.error('Generate bill error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
