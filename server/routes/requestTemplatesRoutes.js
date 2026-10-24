const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');




// Helper function to get database from request context or fallback to master
function getDatabaseFromRequest(req) {
  return req.tenant?.database || require('../config/database-switch');
}


/**
 * GET /api/stock-requests/templates
 * Get all request templates
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    const { category, search } = req.query;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Get user's university_id
    getDatabaseFromRequest(req).get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      let query = `
        SELECT rt.*, u.name as created_by_name
        FROM request_templates rt
        LEFT JOIN users u ON rt.created_by = u.id
        WHERE rt.university_id = ? AND (rt.is_public = 1 OR rt.created_by = ?)
      `;
      
      const params = [user.university_id, userId];

      // Add filters
      if (category) {
        query += ' AND rt.category = ?';
        params.push(category);
      }
      
      if (search) {
        query += ' AND (rt.name ILIKE ? OR rt.description ILIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY rt.usage_count DESC, rt.created_at DESC';

      getDatabaseFromRequest(req).all(query, params, (err, templates) => {
        if (err) {
          console.error('Get templates error:', err);
          return res.status(500).json({ success: false, message: 'Failed to fetch templates' });
        }

        // Parse items JSON for each template
        const processedTemplates = (templates || []).map(template => ({
          ...template,
          items: template.items ? JSON.parse(template.items) : []
        }));

        res.status(200).json({
          success: true,
          data: processedTemplates
        });
      });
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/stock-requests/templates/:id
 * Get specific template
 */
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Get user's university_id
    getDatabaseFromRequest(req).get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      getDatabaseFromRequest(req).get(
        `SELECT rt.*, u.name as created_by_name
         FROM request_templates rt
         LEFT JOIN users u ON rt.created_by = u.id
         WHERE rt.id = ? AND rt.university_id = ? AND (rt.is_public = 1 OR rt.created_by = ?)`,
        [id, user.university_id, userId],
        (err, template) => {
          if (err) {
            console.error('Get template error:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch template' });
          }

          if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
          }

          // Parse items JSON
          const processedTemplate = {
            ...template,
            items: template.items ? JSON.parse(template.items) : []
          };

          // Increment usage count
          getDatabaseFromRequest(req).run(
            'UPDATE request_templates SET usage_count = usage_count + 1 WHERE id = ?',
            [id]
          );

          res.status(200).json({
            success: true,
            data: processedTemplate
          });
        }
      );
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/stock-requests/templates
 * Create new template
 */
router.post('/', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    const { name, description, category, items, is_public = false } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!name || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Name and at least one item are required' });
    }

    // Get user's university_id
    getDatabaseFromRequest(req).get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Create template
      getDatabaseFromRequest(req).run(
        `INSERT INTO request_templates (
          university_id, name, description, category, items, created_by, is_public
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          user.university_id, name, description, category,
          JSON.stringify(items), userId, is_public
        ],
        function(err) {
          if (err) {
            console.error('Create template error:', err);
            return res.status(500).json({ success: false, message: 'Failed to create template' });
          }

          res.status(201).json({
            success: true,
            message: 'Template created successfully',
            data: { id: this.lastID, name }
          });
        }
      );
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/stock-requests/templates/:id
 * Update template
 */
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { name, description, category, items, is_public } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Get user's university_id
    getDatabaseFromRequest(req).get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Update template (only creator can update)
      getDatabaseFromRequest(req).run(
        `UPDATE request_templates SET 
          name = ?, description = ?, category = ?, items = ?, is_public = ?
        WHERE id = ? AND university_id = ? AND created_by = ?`,
        [
          name, description, category, JSON.stringify(items), is_public,
          id, user.university_id, userId
        ],
        function(err) {
          if (err) {
            console.error('Update template error:', err);
            return res.status(500).json({ success: false, message: 'Failed to update template' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Template not found or no permission' });
          }

          res.status(200).json({
            success: true,
            message: 'Template updated successfully'
          });
        }
      );
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/stock-requests/templates/:id
 * Delete template
 */
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Get user's university_id
    getDatabaseFromRequest(req).get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get user error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Delete template (only creator can delete)
      getDatabaseFromRequest(req).run(
        'DELETE FROM request_templates WHERE id = ? AND university_id = ? AND created_by = ?',
        [id, user.university_id, userId],
        function(err) {
          if (err) {
            console.error('Delete template error:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete template' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Template not found or no permission' });
          }

          res.status(200).json({
            success: true,
            message: 'Template deleted successfully'
          });
        }
      );
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
