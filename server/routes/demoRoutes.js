const express = require('express');
const router = express.Router();
const db = require('../config/database-switch');
const emailService = require('../services/emailService');

// @route   POST /api/demo-requests
// @desc    Submit a new demo request (Public)
router.post('/', async (req, res) => {
  try {
    const {
      fullName,
      workEmail,
      institutionName,
      role = 'Dean / Director',
      studentCount = '1,000 - 5,000',
      preferredDate,
      preferredTime = '10:00 AM',
      notes = ''
    } = req.body;

    // Validation
    if (!fullName || !workEmail || !institutionName) {
      return res.status(400).json({
        success: false,
        message: 'Please provide full name, work email, and institution name.'
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(workEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid work email address.'
      });
    }

    const demoData = {
      fullName: fullName.trim(),
      workEmail: workEmail.trim().toLowerCase(),
      institutionName: institutionName.trim(),
      role: role.trim(),
      studentCount: studentCount.trim(),
      preferredDate: preferredDate || new Date().toISOString().split('T')[0],
      preferredTime: preferredTime || '10:00 AM',
      status: 'Pending',
      notes: notes ? notes.trim() : null
    };

    // SQL Insert
    const insertSql = `
      INSERT INTO demo_requests (
        fullName, workEmail, institutionName, role, studentCount, preferredDate, preferredTime, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
      insertSql,
      [
        demoData.fullName,
        demoData.workEmail,
        demoData.institutionName,
        demoData.role,
        demoData.studentCount,
        demoData.preferredDate,
        demoData.preferredTime,
        demoData.status,
        demoData.notes
      ],
      function (err) {
        if (err) {
          console.error('❌ Database error saving demo request:', err);
          return res.status(500).json({
            success: false,
            message: 'Failed to save demo request to database.',
            error: err.message
          });
        }

        const newId = this.lastID;
        console.log(`✅ [Demo Booking] Lead #${newId} saved for ${demoData.institutionName} (${demoData.workEmail})`);

        // Trigger emails in background (non-blocking)
        Promise.allSettled([
          emailService.sendDemoNotificationEmail(demoData),
          emailService.sendDemoConfirmationToClient(demoData)
        ]).then((results) => {
          results.forEach((r, idx) => {
            if (r.status === 'rejected') {
              console.error(`⚠️ Email ${idx === 0 ? 'Admin Alert' : 'Client Confirmation'} failed:`, r.reason);
            }
          });
        }).catch(err => {
          console.error('⚠️ Unexpected email dispatch error:', err);
        });

        return res.status(201).json({
          success: true,
          message: 'Your live demo request has been successfully submitted.',
          requestId: newId,
          data: {
            id: newId,
            fullName: demoData.fullName,
            workEmail: demoData.workEmail,
            institutionName: demoData.institutionName,
            preferredDate: demoData.preferredDate,
            preferredTime: demoData.preferredTime
          }
        });
      }
    );
  } catch (error) {
    console.error('❌ Error handling demo request:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while processing demo request.',
      error: error.message
    });
  }
});

// @route   GET /api/demo-requests
// @desc    Get all demo requests (for SuperAdmin Leads view)
router.get('/', (req, res) => {
  try {
    const query = `
      SELECT * FROM demo_requests 
      ORDER BY id DESC
    `;

    db.all(query, [], (err, rows) => {
      if (err) {
        console.error('❌ Error fetching demo requests:', err);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch demo requests.',
          error: err.message
        });
      }

      return res.json({
        success: true,
        count: rows ? rows.length : 0,
        data: rows || []
      });
    });
  } catch (error) {
    console.error('❌ Error fetching demo leads:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
      error: error.message
    });
  }
});

// @route   PATCH /api/demo-requests/:id/status
// @desc    Update status of a demo lead (Pending, Contacted, Scheduled, Completed, Rejected)
router.patch('/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, message: 'Status is required.' });
  }

  const updateSql = `
    UPDATE demo_requests 
    SET status = ?, notes = COALESCE(?, notes), updatedAt = utc_now_text() 
    WHERE id = ?
  `;

  db.run(updateSql, [status, notes || null, id], function (err) {
    if (err) {
      console.error('❌ Error updating demo request status:', err);
      return res.status(500).json({ success: false, message: 'Failed to update status.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: 'Demo request not found.' });
    }

    return res.json({
      success: true,
      message: `Status updated to ${status} successfully.`,
      updatedId: id
    });
  });
});

// @route   DELETE /api/demo-requests/:id
// @desc    Delete a demo lead
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  db.run(`DELETE FROM demo_requests WHERE id = ?`, [id], function (err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Failed to delete lead.' });
    }
    return res.json({ success: true, message: 'Demo request deleted.' });
  });
});

module.exports = router;
