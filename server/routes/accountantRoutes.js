const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { requirePaymentAuth, requireRoles, requireTenant, toTenantId, resolveStudentScope, STAFF_ROLES } = require('../middleware/paymentAuth');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { getCurrentConfig } = require('../config/razorpay-config');




// Helper function to get database from request context or fallback to master
function getDatabaseFromRequest(req) {
  return req.tenant?.database || require('../config/database-switch');
}


/**
 * GET /api/accountant/dashboard
 * Get accountant dashboard data for their university
 */
router.get('/dashboard', requirePaymentAuth, requireRoles(STAFF_ROLES), (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Accountant not authenticated' });
    }

    // Get accountant's university_id from users table
    getDatabaseFromRequest(req).get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get accountant university error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'Accountant not found' });
      }

      const universityId = toTenantId(user.university_id);
      if (universityId === null) {
        return res.status(403).json({ success: false, message: 'Access denied: Tenant association missing or invalid' });
      }
      console.log(' Accountant Dashboard - User ID:', userId, 'University ID:', universityId);

      // Get real dashboard stats from database
      const stats = {
        totalRevenue: 0,
        totalPayments: 0,
        pendingPayments: 0,
        totalExpenses: 0,
        universityName: '',
        universityId: universityId,
      };

      // Get revenue from payments table
      getDatabaseFromRequest(req).all(`SELECT SUM(p.amount) as totalRevenue FROM payments p JOIN users u ON u.id = p.studentId WHERE p.status IN ('paid', 'success') AND u.university_id = ?`, [universityId], (err, revenueResult) => {
        if (err) {
          console.error('Get revenue error:', err);
        } else {
          stats.totalRevenue = revenueResult[0]?.totalRevenue || 0;
        }

        // Get payment stats
        getDatabaseFromRequest(req).all('SELECT p.status as status, COUNT(*) as count FROM payments p JOIN users u ON u.id = p.studentId WHERE u.university_id = ? GROUP BY p.status', [universityId], (err, paymentResults) => {
          if (err) {
            console.error('Get payment stats error:', err);
          } else {
            paymentResults.forEach(row => {
              stats.totalPayments += row.count;
              if (row.status === 'pending') stats.pendingPayments += row.count;
            });
          }

          // Get expense stats
          getDatabaseFromRequest(req).all('SELECT SUM(amount) as totalExpenses FROM expenses WHERE university_id = ?', [universityId], (err, expenseResult) => {
            if (err) {
              console.error('Get expenses error:', err);
            } else {
              stats.totalExpenses = expenseResult[0]?.totalExpenses || 0;
            }

            // Get university name
            getDatabaseFromRequest(req).get('SELECT name FROM universities WHERE id = ?', [universityId], (err, universityResult) => {
              if (err) {
                console.error('Get university name error:', err);
                stats.universityName = 'University';
              } else {
                stats.universityName = universityResult?.name || 'University';
              }

              console.log(' Accountant Dashboard Stats:', stats);

              res.status(200).json({ 
                success: true, 
                data: stats
              });
            });
          });
        });
      });
    });
  } catch (error) {
    console.error('Accountant dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/accountant/payments
 * Get all payments for accountant's university
 */
router.get('/payments', requirePaymentAuth, requireRoles(STAFF_ROLES), requireTenant, (req, res) => {
  try {
    const universityId = req.user.universityId;

    const query = `
      SELECT 
        p.id,
        p.studentId,
        u.name AS studentName,
        u.email AS studentEmail,
        p.amount,
        p.type,
        p.paymentMethod,
        p.status,
        p.transactionId,
        p.receiptNo,
        p.description,
        p.createdAt
      FROM payments p
      JOIN users u ON u.id = p.studentId
      WHERE u.university_id = ?
      ORDER BY p.createdAt DESC
    `;

    getDatabaseFromRequest(req).all(query, [universityId], (err, rows) => {
      if (err) {
        console.error('Error fetching accountant payments:', err);
        return res.status(500).json({ success: false, message: 'Failed to load payments' });
      }

      const formatDate = (r) => {
        if (!r.createdAt) return null; // unknown date stays unknown; never shown as today
        try {
          const d = new Date(r.createdAt);
          return isNaN(d.getTime()) ? String(r.createdAt) : d.toISOString().split('T')[0];
        } catch {
          return String(r.createdAt);
        }
      };

      const formatStatus = (s) => {
        if (!s) return 'Pending';
        const lower = String(s).toLowerCase();
        if (lower === 'paid' || lower === 'success') return 'Paid';
        if (lower === 'pending') return 'Pending';
        if (lower === 'failed') return 'Failed';
        return s.charAt(0).toUpperCase() + s.slice(1);
      };

      const formattedPayments = (rows || []).map(r => ({
        id: r.id,
        studentId: r.studentId,
        studentName: r.studentName || 'Student',
        studentEmail: r.studentEmail || '',
        amount: r.amount,
        date: formatDate(r),
        status: formatStatus(r.status),
        rawStatus: r.status,
        type: r.type,
        paymentMethod: r.paymentMethod,
        transactionId: r.transactionId || r.receiptNo || String(r.id),
        description: r.description,
        createdAt: r.createdAt
      }));

      res.status(200).json({ success: true, data: formattedPayments });
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ success: false, message: 'Failed to load payments' });
  }
});

/**
 * GET /api/accountant/expenses
 * Not implemented. This route used to return hard-coded sample expenses, which must never be
 * shown as real financial data. It is kept (not deleted) so any caller gets an explicit answer
 * instead of a 404; no frontend page calls it. Real data: /api/accountant/vendor-invoices and /api/expenses.
 */
router.get('/expenses', requirePaymentAuth, requireRoles(STAFF_ROLES), requireTenant, (req, res) => {
  res.status(501).json({
    success: false,
    code: 'NOT_IMPLEMENTED',
    message: 'Accountant expense records are not available from this endpoint. Use /api/accountant/vendor-invoices or /api/expenses.'
  });
});

/**
 * GET /api/accountant/vendor-invoices
 * Get all vendor invoices for accountant's university
 */
router.get('/vendor-invoices', authMiddleware, (req, res) => {
  // Set response timeout for this specific route
  res.setTimeout(60000, () => {
    console.log('Vendor invoices request timeout');
    if (!res.headersSent) {
      res.status(408).json({ success: false, message: 'Request timeout' });
    }
  });

  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Accountant not authenticated' });
    }

    // Get accountant's university_id from users table
    getDatabaseFromRequest(req).get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Get accountant university error:', err);
        if (!res.headersSent) {
          return res.status(500).json({ success: false, message: 'Database error' });
        }
      }

      if (!user) {
        if (!res.headersSent) {
          return res.status(404).json({ success: false, message: 'Accountant not found' });
        }
      }

      const universityId = toTenantId(user.university_id);
      if (universityId === null) {
        if (!res.headersSent) {
          res.status(403).json({ success: false, message: 'Access denied: Tenant association missing or invalid' });
        }
        return;
      }
      console.log(' Accountant Vendor Invoices - User ID:', userId, 'University ID:', universityId);

      // Get all invoices from database filtered by university with timeout
      getDatabaseFromRequest(req).all('SELECT * FROM invoices WHERE university_id = ? ORDER BY issueDate DESC', [universityId], (err, invoices) => {
        if (err) {
          console.error('Get vendor invoices error:', err);
          if (!res.headersSent) {
            return res.status(500).json({ success: false, message: 'Failed to load invoices' });
          }
        }

        console.log(' Accountant - Found invoices:', invoices.length);
        if (!res.headersSent) {
          res.status(200).json({ success: true, data: invoices });
        }
      });
    });
  } catch (error) {
    console.error('Accountant vendor invoices error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
});

/**
 * POST /api/accountant/pay-invoice/:invoiceId
 * Process payment for a vendor invoice
 */
router.post('/pay-invoice/:invoiceId', requirePaymentAuth, requireRoles(STAFF_ROLES), requireTenant, (req, res) => {
  try {
    const { invoiceId } = req.params;
    const userId = req.user.userId;
    const universityId = req.user.universityId;
    
    if (!invoiceId) {
      return res.status(400).json({ success: false, message: 'Invoice ID is required' });
    }

    // First check if invoice exists for this university and is pending
    getDatabaseFromRequest(req).get('SELECT * FROM invoices WHERE id = ? AND university_id = ?', [invoiceId, universityId], (err, invoice) => {
      if (err) {
        console.error('Check invoice error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      if (!invoice || String(invoice.university_id) !== String(req.user.universityId)) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      if (invoice.status !== 'pending') {
        return res.status(400).json({ success: false, message: 'Invoice is already paid or processed' });
      }

      // Update invoice status to paid for this university
      const paidDate = new Date().toISOString();
      const db = getDatabaseFromRequest(req);
      db.all("PRAGMA table_info('invoices')", (pragmaErr, cols) => {
        const hasPaidDate = !pragmaErr && Array.isArray(cols) && cols.some(c => c.name === 'paidDate');
        const updateSql = hasPaidDate
          ? 'UPDATE invoices SET status = ?, paidDate = ?, updatedAt = ? WHERE id = ? AND university_id = ?'
          : 'UPDATE invoices SET status = ?, updatedAt = ? WHERE id = ? AND university_id = ?';
        const params = hasPaidDate
          ? ['paid', paidDate, paidDate, invoiceId, universityId]
          : ['paid', paidDate, invoiceId, universityId];

        db.run(updateSql, params, function(err) {
          if (err) {
            console.error('Update invoice error:', err);
            return res.status(500).json({ success: false, message: 'Failed to process payment' });
          }

          // Log the payment transaction with verified userId
          db.run(
            'INSERT INTO payment_transactions (invoice_id, user_id, amount, payment_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [invoiceId, userId, invoice.amount, paidDate, 'completed', paidDate],
            function(logErr) {
              if (logErr) {
                console.error('Log payment transaction error:', logErr);
                // Don't fail the whole operation if logging fails
              }
            }
          );

          console.log(`Invoice ${invoiceId} paid by accountant ${userId} (university ${universityId}) on ${paidDate}`);
          
          res.status(200).json({ 
            success: true, 
            message: 'Payment processed successfully',
            data: {
              invoiceId: invoiceId,
              status: 'paid',
              paidDate: paidDate,
              amount: invoice.amount
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to process payment' });
  }
});

/**
 * POST /api/accountant/download-invoice
 * Download invoice for a fee payment transaction
 */
router.post('/download-invoice', authMiddleware, async (req, res) => {
  try {
    console.log('🧾 Invoice download request received');
    console.log('👤 User ID:', req.user?.userId);
    
    const escapeHtml = (value) =>
      String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const [paymentId, studentName, amount, paymentDate, paymentMethod] = [
      req.body.paymentId, req.body.studentName, req.body.amount, req.body.paymentDate, req.body.paymentMethod
    ].map((value) => (value === undefined || value === null || value === '' ? value : escapeHtml(value)));
    const userId = req.user?.userId;
    
    if (!userId) {
      console.log('❌ Accountant not authenticated');
      return res.status(401).json({ success: false, message: 'Accountant not authenticated' });
    }

    if (!paymentId || !studentName || !amount) {
      console.log('❌ Missing required payment details');
      console.log('  - paymentId:', paymentId);
      console.log('  - studentName:', studentName);
      console.log('  - amount:', amount);
      return res.status(400).json({ success: false, message: 'Missing required payment details' });
    }

    console.log('✅ Validation passed, generating invoice...');

    // Generate simple HTML invoice directly (avoiding dependency issues)
    try {
      console.log('🔄 Starting invoice HTML generation...');
      
      const invoiceHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Fee Receipt - ${studentName}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: #f5f5f5;
        }
        .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #007bff;
            padding-bottom: 20px;
        }
        .header h1 {
            color: #007bff;
            margin: 0;
            font-size: 28px;
        }
        .invoice-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        .invoice-info div {
            flex: 1;
        }
        .invoice-info h3 {
            margin: 0 0 10px 0;
            color: #333;
        }
        .student-details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .payment-details {
            background: #e9ecef;
            padding: 20px;
            border-radius: 8px;
        }
        .amount {
            font-size: 24px;
            font-weight: bold;
            color: #28a745;
            text-align: center;
            margin: 20px 0;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 14px;
        }
        .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 120px;
            color: rgba(0, 128, 0, 0.1);
            font-weight: bold;
            z-index: -1;
        }
    </style>
</head>
<body>
    <div class="watermark">PAID</div>
    <div class="invoice-container">
        <div class="header">
            <h1>Fee Receipt</h1>
            <p>Official Payment Confirmation</p>
        </div>
        
        <div class="invoice-info">
            <div>
                <h3>Receipt Details</h3>
                <p><strong>Receipt No:</strong> ${paymentId}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                <p><strong>Status:</strong> <span style="color: #28a745;">Completed</span></p>
            </div>
            <div style="text-align: right;">
                <h3>Payment Method</h3>
                <p><strong>Method:</strong> ${paymentMethod || 'Online'}</p>
                <p><strong>Transaction ID:</strong> ${paymentId}</p>
            </div>
        </div>
        
        <div class="student-details">
            <h3>Student Information</h3>
            <p><strong>Name:</strong> ${studentName}</p>
            <p><strong>Email:</strong> student@university.edu</p>
            <p><strong>Payment Date:</strong> ${paymentDate ? new Date(paymentDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
        </div>
        
        <div class="payment-details">
            <h3>Payment Details</h3>
            <p><strong>Description:</strong> Academic Fee Payment</p>
            <p><strong>Payment Date:</strong> ${paymentDate ? new Date(paymentDate).toLocaleDateString() : new Date().toLocaleDateString()}</p>
        </div>
        
        <div class="amount">
            Total Amount Paid: ₹${Number(amount).toLocaleString('en-IN')}
        </div>
        
        <div class="footer">
            <p>This is a computer-generated receipt and does not require a signature.</p>
            <p>For any queries, please contact the accounts department.</p>
            <p>Thank you for your payment!</p>
        </div>
    </div>
</body>
</html>`;

      console.log('✅ Invoice HTML generated successfully, length:', invoiceHTML.length);

      // Convert HTML to base64 for download
      const base64Invoice = Buffer.from(invoiceHTML).toString('base64');
      
      console.log('✅ Base64 conversion successful, length:', base64Invoice.length);
      console.log('📤 Sending invoice response...');

      // Send response
      const responseData = {
        success: true,
        invoice: base64Invoice,
        type: 'html'
      };
      
      console.log('📊 Response data keys:', Object.keys(responseData));
      console.log('📊 Response success:', responseData.success);
      console.log('📊 Response invoice length:', responseData.invoice ? responseData.invoice.length : 'null');
      
      res.status(200).json(responseData);
      console.log('✅ Response sent successfully');

    } catch (invoiceError) {
      console.error('❌ Error generating invoice:', invoiceError);
      console.error('❌ Error stack:', invoiceError.stack);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate invoice'
      });
    }

  } catch (error) {
    console.error('❌ Download invoice error:', error);
    console.error('❌ Error stack:', error.stack);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate invoice' });
    }
  }
});

/**
 * GET /api/accountant/fees-stats
 * Get fee collection statistics
 */
router.get('/fees-stats', requirePaymentAuth, requireRoles(STAFF_ROLES), requireTenant, async (req, res) => {
  try {
    const db = getDatabaseFromRequest(req);
    const universityId = req.user.universityId;
    const query = (sql, params) =>
      new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
      });

    // payments.studentId is the student's users.id, which carries the school
    const paidInSchool = "FROM payments p JOIN users u ON u.id = p.studentId WHERE p.status IN ('paid', 'success') AND u.university_id = ?";

    const [fees] = await query(`SELECT SUM(p.amount) AS totalFeesCollected ${paidInSchool}`, [universityId]);
    const [students] = await query(
      "SELECT COUNT(*) AS totalStudents FROM users WHERE role = 'student' AND university_id = ?",
      [universityId]
    );
    const recent = await query(
      `SELECT p.amount, p.createdAt, p.type, p.transactionId, p.id, u.name AS studentName
       ${paidInSchool} ORDER BY p.createdAt DESC LIMIT 10`,
      [universityId]
    );

    const totalFeesCollected = fees?.totalFeesCollected || 0;
    const totalStudents = students?.totalStudents || 0;

    res.status(200).json({
      success: true,
      data: {
        totalFeesCollected,
        totalStudents,
        averageFeesPerStudent: totalStudents > 0 ? Math.round(totalFeesCollected / totalStudents) : 0,
        recentPayments: recent.map((payment) => ({
          studentName: payment.studentName || 'Unknown Student',
          amount: payment.amount || 0,
          paymentDate: payment.createdAt,
          paymentMethod: payment.type || 'Online',
          transactionId: payment.transactionId || payment.id
        }))
      }
    });
  } catch (error) {
    console.error('Accountant fees stats error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load fee statistics' });
  }
});

/**
 * GET /api/accountant/students
 * Fetch all students for offline fee collection dropdown and fee management
 */
router.get('/students', requirePaymentAuth, requireRoles(STAFF_ROLES), requireTenant, (req, res) => {
  try {
    getDatabaseFromRequest(req).all(
      `SELECT * FROM (
         -- one row per student: the class of their first class assignment
         SELECT DISTINCT ON (u.id) u.id, u.name, u.email, u.role, c.grade, c.name as className,
                COALESCE(c.grade, '1') as studentGrade
         FROM users u
         LEFT JOIN student_classroom_assignment sca ON u.id = sca.studentId
         LEFT JOIN classrooms c ON sca.classroomId = c.id
         WHERE u.role = 'student' AND u.university_id = ?
         ORDER BY u.id, sca.id
       ) students
       ORDER BY name ASC`,
      [req.user.universityId],
      (err, rows) => {
        if (err) {
          console.error('Error fetching students list:', err);
          return res.status(500).json({ success: false, message: 'Database query failed' });
        }
        res.status(200).json({ success: true, students: rows || [] });
      }
    );
  } catch (error) {
    console.error('Error in /api/accountant/students:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/accountant/unallocated-payments
 * Phase 2C Step 1: Read-only endpoint to list successful historical payments with missing schedule/stage linkage.
 * Strictly read-only: no allocation mutations, no automatic academic-session inference.
 * Scoped to the authenticated user's university.
 */
router.get('/unallocated-payments', requirePaymentAuth, requireRoles(STAFF_ROLES), (req, res) => {
  try {
    const db = getDatabaseFromRequest(req);
    const userId = req.user?.userId;

    if (!/^\d+$/.test(String(userId))) {
      return res.status(403).json({ success: false, message: 'Access denied: Invalid user context' });
    }

    db.get('SELECT university_id FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Error fetching accountant university:', err);
        return res.status(500).json({ success: false, message: 'Database query failed' });
      }

      if (!user || user.university_id === null || user.university_id === undefined) {
        return res.status(403).json({ success: false, message: 'Access denied: Tenant association missing or invalid' });
      }

      const universityId = user.university_id;

      const sql = `
        SELECT 
          p.id AS paymentId,
          p.studentId,
          u.name AS studentName,
          u.email AS studentEmail,
          u.university_id AS studentUniversityId,
          p.amount,
          p.amountPaise,
          p.type AS paymentType,
          p.paymentMethod,
          p.status,
          p.transactionId,
          p.razorpay_payment_id,
          p.razorpay_order_id,
          p.receiptNo,
          p.referenceNo,
          p.description,
          p.createdAt,
          p.scheduleId,
          p.installmentStage,
          p.feeStructureId AS paymentFeeStructureId,
          p.allocationStatus,
          curr_class.classroomId,
          curr_class.classroomName,
          curr_class.studentGrade,
          sfs_agg.activeScheduleCount,
          sfs_agg.singleScheduleId,
          sfs_agg.singlePlanName,
          fs_curr.id AS currentFeeStructureId,
          fs_curr.category AS currentFeeStructureCategory,
          fs_curr.totalFee AS currentFeeStructureTotalFee
        FROM payments p
        JOIN users u ON u.id = p.studentId
        LEFT JOIN (
          SELECT sca.studentId, c.id AS classroomId, c.name AS classroomName, c.grade AS studentGrade
          FROM student_classroom_assignment sca
          JOIN classrooms c ON sca.classroomId = c.id
          WHERE sca.id = (
            SELECT MAX(sca2.id) 
            FROM student_classroom_assignment sca2 
            WHERE sca2.studentId = sca.studentId
          )
        ) curr_class ON curr_class.studentId = u.id
        LEFT JOIN (
          SELECT 
            studentId,
            COUNT(*) AS activeScheduleCount,
            MIN(id) AS singleScheduleId,
            MIN(planName) AS singlePlanName,
            MIN(feeStructureId) AS singleFeeStructureId
          FROM student_fee_schedules
          WHERE status = 'active'
          GROUP BY studentId
        ) sfs_agg ON sfs_agg.studentId = u.id
        LEFT JOIN feeStructures fs_curr ON (
          sfs_agg.activeScheduleCount = 1 
          AND fs_curr.id = sfs_agg.singleFeeStructureId
          AND fs_curr.university_id = u.university_id
        )
        WHERE u.university_id = ?
          AND p.status IN ('success', 'paid')
          AND (p.scheduleId IS NULL OR p.installmentStage IS NULL)
        ORDER BY p.createdAt DESC, p.id DESC
      `;

      db.all(sql, [universityId], (err, rows) => {
        if (err) {
          console.error('Error fetching unallocated payments:', err);
          return res.status(500).json({ success: false, message: 'Database query failed' });
        }

        const unallocatedPayments = (rows || []).map(r => {
          const activeScheduleCount = Number(r.activeScheduleCount || 0);
          const hasSingleActiveSchedule = activeScheduleCount === 1;
          const isMultipleActiveSchedules = activeScheduleCount > 1;
          const hasActiveFeeStructure = hasSingleActiveSchedule && Boolean(r.currentFeeStructureId);

          return {
            paymentId: r.paymentId,
            studentId: r.studentId,
            studentName: r.studentName || `Student #${r.studentId}`,
            studentEmail: r.studentEmail || '',
            universityId: r.studentUniversityId,
            amount: Number(r.amount || 0),
            amountPaise: r.amountPaise !== null && r.amountPaise !== undefined ? Number(r.amountPaise) : Math.round(Number(r.amount || 0) * 100),
            paymentType: r.paymentType || 'full',
            paymentMethod: r.paymentMethod || (r.razorpay_payment_id ? 'online_razorpay' : 'offline_manual'),
            status: r.status,
            transactionId: r.transactionId || r.razorpay_payment_id || `PAY-${r.paymentId}`,
            razorpayPaymentId: r.razorpay_payment_id || null,
            razorpayOrderId: r.razorpay_order_id || null,
            receiptNo: r.receiptNo || null,
            referenceNo: r.referenceNo || null,
            description: r.description || null,
            createdAt: r.createdAt,
            paymentDate: r.createdAt ? new Date(r.createdAt).toISOString() : null,
            scheduleId: r.scheduleId || null,
            installmentStage: r.installmentStage || null,
            allocationStatus: 'unallocated',
            currentAcademicContext: {
              classroomId: r.classroomId || null,
              classroomName: r.classroomName || null,
              grade: r.studentGrade || null,
              activeScheduleId: hasSingleActiveSchedule ? r.singleScheduleId : null,
              activePlanName: hasSingleActiveSchedule ? r.singlePlanName : null,
              currentFeeStructureId: hasSingleActiveSchedule ? r.currentFeeStructureId : null,
              currentFeeStructureCategory: hasSingleActiveSchedule ? r.currentFeeStructureCategory : null,
              currentAnnualFee: hasSingleActiveSchedule && r.currentFeeStructureTotalFee ? Number(r.currentFeeStructureTotalFee) : null,
              isStructureDeterminedSafely: hasActiveFeeStructure,
              scheduleAmbiguity: isMultipleActiveSchedules 
                ? 'MULTIPLE_ACTIVE_SCHEDULES' 
                : (!hasSingleActiveSchedule ? 'NO_ACTIVE_SCHEDULE' : null),
              ambiguityNotice: isMultipleActiveSchedules
                ? 'Multiple active installment schedules detected. Fee context cannot be determined safely.'
                : null
            },
            reconciliationRequirement: {
              status: 'ACADEMIC_SESSION_UNCONFIRMED',
              academicSessionConfirmed: false,
              readOnlyNotice: 'Academic-session confirmation is required before this historical payment can be allocated. Automatic inference from current grade is disabled for financial safety.'
            }
          };
        });

        const totalUnallocatedAmount = unallocatedPayments.reduce((sum, item) => sum + item.amount, 0);
        const uniqueStudentIds = new Set(unallocatedPayments.map(item => item.studentId));

        res.status(200).json({
          success: true,
          data: unallocatedPayments,
          summary: {
            totalUnallocatedCount: unallocatedPayments.length,
            totalUnallocatedAmount,
            affectedStudentsCount: uniqueStudentIds.size,
            reconciliationMode: 'READ_ONLY_REVIEW',
            academicSessionConfirmationRequired: true
          }
        });
      });
    });
  } catch (error) {
    console.error('Error in /api/accountant/unallocated-payments:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching unallocated payments' });
  }
});

const {
  PaymentError,
  calculateStudentInstallmentSummary,
  recordOfflineInstallmentPayment
} = require('../services/installmentService');

const FEE_VIEW_ROLES = ['student', ...STAFF_ROLES];

// Known payment errors carry their own status; anything else is a generic 500 (no raw DB errors to clients)
function sendPaymentError(res, error, fallbackMessage) {
  if (error instanceof PaymentError) {
    return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ success: false, message: fallbackMessage });
}

/**
 * Staff may only read fee records of students in their own university, checked
 * against the users table. Students are already limited to themselves by
 * resolveStudentScope. Resolves true when allowed; otherwise sends the error and resolves false.
 */
function authorizeStudentAccess(req, res, studentId) {
  return new Promise((resolve) => {
    if (req.user.role === 'student') return resolve(true);

    const deny = () => {
      res.status(403).json({ success: false, message: 'Access denied: This student does not belong to your university.' });
      resolve(false);
    };
    const staffUniversityId = toTenantId(req.user.universityId);
    if (staffUniversityId === null) {
      res.status(403).json({ success: false, message: 'Access denied: Tenant association missing or invalid' });
      return resolve(false);
    }

    getDatabaseFromRequest(req).get('SELECT university_id FROM users WHERE id = ?', [studentId], (err, target) => {
      if (err) {
        console.error('Student tenant check failed:', err.message);
        res.status(500).json({ success: false, message: 'Authorization check failed.' });
        return resolve(false);
      }
      // An unknown id is left to the caller's own not-found handling; a known user must be same-university
      if (target && toTenantId(target.university_id) !== staffUniversityId) return deny();
      resolve(true);
    });
  });
}

/**
 * GET /api/accountant/student-installment-status
 * Fetch detailed installment summary, schedule snapshot, and stage balances for a student.
 * Students always get their own record; staff must pass ?studentId= of a student in their own university. Read-only.
 */
router.get('/student-installment-status', requirePaymentAuth, requireRoles(FEE_VIEW_ROLES), async (req, res) => {
  try {
    const studentId = resolveStudentScope(req, res, req.query.studentId);
    if (studentId === null) return;
    if (!(await authorizeStudentAccess(req, res, studentId))) return;

    const db = getDatabaseFromRequest(req);
    const summary = await calculateStudentInstallmentSummary(db, studentId);
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    sendPaymentError(res, error, 'Failed to calculate student installment status.');
  }
});

/**
 * POST /api/accountant/collect-offline-fee
 * Record an offline fee collection (Cash, Cheque, DD, Bank Transfer, UPI)
 * with strict atomic stage validation, partial payment support, and idempotency protection.
 */
router.post('/collect-offline-fee', requirePaymentAuth, requireRoles(STAFF_ROLES), requireTenant, async (req, res) => {
  try {
    const db = getDatabaseFromRequest(req);
    const result = await recordOfflineInstallmentPayment(db, req.body, { userId: req.user.userId, universityId: req.user.universityId });

    res.status(result.isDuplicate ? 200 : 201).json({
      success: true,
      message: result.message,
      isDuplicate: result.isDuplicate,
      payment: result.payment,
      stageUpdated: result.stageUpdated
    });
  } catch (error) {
    sendPaymentError(res, error, 'Server error while recording offline payment.');
  }
});

/**
 * GET /api/accountant/student-payments-history
 * Fetch all payments (online + offline) for a student.
 * Students always get their own history; staff must pass ?studentId= of a student in their own university.
 */
router.get('/student-payments-history', requirePaymentAuth, requireRoles(FEE_VIEW_ROLES), async (req, res) => {
  try {
    const studentId = resolveStudentScope(req, res, req.query.studentId);
    if (studentId === null) return;
    if (!(await authorizeStudentAccess(req, res, studentId))) return;

    getDatabaseFromRequest(req).all(
      `SELECT * FROM payments WHERE studentId = ? ORDER BY createdAt DESC`,
      [studentId],
      (err, rows) => {
        if (err) {
          console.error('Error fetching student payments:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
        }
        const formatDate = (r) => r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
        const formatTime = (r) => r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const allRows = rows || [];

        res.json({
          success: true,
          data: allRows.map(r => ({
            id: r.transactionId || r.id,
            studentId: r.studentId,
            amount: r.amount,
            type: r.type,
            status: r.status,
            transactionId: r.transactionId || r.id,
            description: r.description,
            paymentDate: formatDate(r),
            paymentTime: formatTime(r)
          })),
          // Shape consumed by the Student Portal fee page: confirmed offline collections only (online rows reach it via /api/transactions)
          payments: allRows
            .filter(r => (r.status === 'success' || r.status === 'paid') && /^offline/i.test(r.type || ''))
            .map(r => ({
              id: r.id,
              transaction_id: String(r.transactionId || r.receiptNo || `TXN_${r.id}`),
              amount: r.amount,
              status: r.status,
              payment_mode: r.type,
              term_type: r.installmentStage ? `Installment Stage ${r.installmentStage}` : (r.type || 'Payment'),
              payment_date: formatDate(r),
              payment_time: formatTime(r),
              created_at: r.createdAt,
              installment_stage: r.installmentStage,
              receipt_no: r.receiptNo
            }))
        });
      }
    );
  } catch (error) {
    console.error('Error in student-payments-history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

