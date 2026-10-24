const express = require('express');
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams } = require("../helpers/schoolScope");
guardParams(router, { studentId: "user" });
const { requirePaymentAuth, requireRoles, resolveStudentScope, STAFF_ROLES } = require('../middleware/paymentAuth');
const { parseRupeesToPaise, MAX_PAYMENT_PAISE } = require('../services/money');

const TRANSACTION_ROLES = ['student', ...STAFF_ROLES];


// Helper function to get database from request context or fallback to master
function getDatabaseFromRequest(req) {
  return req.tenant?.database || require('../config/database-switch');
}


// Get all transactions
exports.getAllTransactions = (req, res) => {
  const query = `
    SELECT 
      p.id,
      p.studentId,
      p.amount,
      p.type as paymentOption,
      p.status,
      p.transactionId,
      p.razorpay_payment_id,
      p.description,
      p.createdAt,
      u.name as studentName,
      u.email as studentEmail,
      s.studentId as studentDbId,
      s.grade,
      s.feesPaid,
      s.totalFees
    FROM payments p
    LEFT JOIN users u ON p.studentId = u.id
    LEFT JOIN students s ON p.studentId = s.userId
    ORDER BY p.createdAt DESC
  `;

  getDatabaseFromRequest(req).all(query, (err, rows) => {
    if (err) {
      console.error('Error fetching transactions:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
    }
    
    return res.status(200).json({ 
      success: true, 
      transactions: rows.map(row => ({
        ...row,
        paymentDate: new Date(row.createdAt).toLocaleDateString(),
        paymentTime: new Date(row.createdAt).toLocaleTimeString(),
        timestamp: row.createdAt
      }))
    });
  });
};

// Create new transaction
exports.createTransaction = (req, res) => {
  const { studentId, amount, type, status, transactionId, razorpay_payment_id, razorpay_order_id, razorpay_signature, description } = req.body;

  const query = `
    INSERT INTO payments (studentId, amount, type, status, transactionId, razorpay_payment_id, razorpay_order_id, razorpay_signature, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  getDatabaseFromRequest(req).run(query, [studentId, amount, type, status || 'success', transactionId, razorpay_payment_id, razorpay_order_id, razorpay_signature, description], function(err) {
    if (err) {
      console.error('Error creating transaction:', err);
      return res.status(500).json({ success: false, message: 'Failed to create transaction' });
    }

    // Update student's paid fees
    const updateStudentQuery = `
      UPDATE students 
      SET feesPaid = feesPaid + ?, 
          pendingFees = totalFees - (feesPaid + ?),
          updatedAt = utc_now_text()
      WHERE userId = ?
    `;

    getDatabaseFromRequest(req).run(updateStudentQuery, [amount, amount, studentId], function(err) {
      if (err) {
        console.error('Error updating student fees:', err);
      }
    });

    // Emit real-time event
    if (req.io) {
      req.io.emit('payment', {
        id: transactionId,
        amount: amount,
        paymentOption: type,
        studentName: req.body.studentName || 'Student',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(201).json({ 
      success: true, 
      message: 'Transaction created successfully',
      transactionId: this.lastID
    });
  });
};

// Get transactions by student
exports.getStudentTransactions = (req, res) => {
  const { studentId } = req.params;
  
  const query = `
    SELECT 
      p.*,
      u.name as studentName,
      u.email as studentEmail
    FROM payments p
    LEFT JOIN users u ON p.studentId = u.id
    WHERE p.studentId = ?
    ORDER BY p.createdAt DESC
  `;

  getDatabaseFromRequest(req).all(query, [studentId], (err, rows) => {
    if (err) {
      console.error('Error fetching student transactions:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch student transactions' });
    }
    
    return res.status(200).json({ 
      success: true, 
      transactions: rows.map(row => ({
        ...row,
        paymentDate: new Date(row.createdAt).toLocaleDateString(),
        paymentTime: new Date(row.createdAt).toLocaleTimeString()
      }))
    });
  });
};

// Get payment statistics
exports.getPaymentStats = (req, res) => {
  const query = `
    SELECT 
      COUNT(DISTINCT p.studentId) as totalStudents,
      COUNT(CASE WHEN p.status = 'success' THEN 1 END) as successfulPayments,
      SUM(CASE WHEN p.status = 'success' THEN p.amount ELSE 0 END) as totalRevenue,
      COUNT(CASE WHEN DATE(p.createdAt) = DATE('now') THEN 1 END) as todayPayments
    FROM payments p
    JOIN users u ON u.id = p.studentId
    WHERE u.university_id = ?
  `;

  getDatabaseFromRequest(req).get(query, [req.user.universityId], (err, row) => {
    if (err) {
      console.error('Error fetching payment stats:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch payment stats' });
    }
    
    return res.status(200).json({ 
      success: true, 
      stats: row
    });
  });
};

// Generate invoice
exports.generateInvoice = (req, res) => {
  const { transaction, student, paymentOption, totalFees } = req.body;
  const path = require('path');
  const fs = require('fs');


  
  // Load logo as base64
  let logoBase64 = '';
  try {
    const logoPath = path.join(__dirname, '../../White Logo.png');
    const logoBuffer = fs.readFileSync(logoPath);
    logoBase64 = logoBuffer.toString('base64');
  } catch (logoError) {
    console.log('Logo not found, continuing without logo');
  }
  
  // Here you would generate the invoice PDF/HTML
  // For now, return a simple HTML invoice
  const invoiceHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fee Receipt - ${transaction.paymentId}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
        .details { margin: 10px 0; }
        .total { font-weight: bold; font-size: 18px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Fee Receipt</h1>
        <p>Receipt #: ${transaction.paymentId}</p>
        <p>Date: ${new Date().toLocaleDateString()}</p>
      </div>
      <div class="details">
        <p><strong>Student:</strong> ${student.name}</p>
        <p><strong>Amount:</strong> ₹${transaction.amount.toLocaleString('en-IN')}</p>
        <p><strong>Payment Type:</strong> ${paymentOption}</p>
        <p><strong>Status:</strong> ${transaction.status}</p>
      </div>
      <div class="total">
        Total: ₹${transaction.amount.toLocaleString('en-IN')}
      </div>
    </body>
    </html>
  `;

  // Convert HTML to base64 for frontend
  const base64Invoice = Buffer.from(invoiceHtml).toString('base64');
  
  return res.status(200).json({
    success: true,
    invoice: base64Invoice,
    type: 'html'
  });
};

// Define routes
router.get('/', requirePaymentAuth, requireRoles(STAFF_ROLES), (req, res) => {
  const query = `
    SELECT 
      p.id,
      p.studentId,
      p.amount,
      p.type as paymentOption,
      p.status,
      p.transactionId,
      p.razorpay_payment_id,
      p.description,
      p.createdAt,
      u.name as studentName,
      u.email as studentEmail,
      s.studentId as studentDbId,
      s.grade,
      s.feesPaid,
      s.totalFees
    FROM payments p
    JOIN users u ON p.studentId = u.id
    LEFT JOIN students s ON p.studentId = s.userId
    WHERE u.university_id = ?
    ORDER BY p.createdAt DESC
  `;

  // Payments belong to the school of the student who made them
  getDatabaseFromRequest(req).all(query, [req.user.universityId], (err, rows) => {
    if (err) {
      console.error('Error fetching transactions:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
    }
    
    return res.status(200).json({ 
      success: true, 
      transactions: rows.map(row => ({
        ...row,
        paymentDate: new Date(row.createdAt).toLocaleDateString(),
        paymentTime: new Date(row.createdAt).toLocaleTimeString(),
        timestamp: row.createdAt
      }))
    });
  });
});

/**
 * POST /api/transactions
 * Records a payment CLAIM reported by a client. The caller cannot make it count:
 * status is always 'pending' and the row is unallocated, so it never increases
 * paid totals or fee balances until a server-side verification marks it successful.
 */
router.post('/', requirePaymentAuth, requireRoles(TRANSACTION_ROLES), (req, res) => {
  const { type, transactionId, description } = req.body || {};

  const studentId = resolveStudentScope(req, res, req.body?.studentId);
  if (studentId === null) return;

  const amountPaise = parseRupeesToPaise(req.body?.amount);
  if (amountPaise === null || amountPaise > MAX_PAYMENT_PAISE) {
    return res.status(400).json({ success: false, message: 'Invalid payment amount' });
  }

  const text = (value, max) => (typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : null);
  const db = getDatabaseFromRequest(req);

  db.get(`SELECT id FROM users WHERE id = ? AND role = 'student'`, [studentId], (lookupErr, student) => {
    if (lookupErr) {
      console.error('Error validating student for transaction:', lookupErr);
      return res.status(500).json({ success: false, message: 'Failed to create transaction' });
    }
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Client-supplied gateway IDs are kept only as a reference (transactionId); the
    // razorpay_* columns are reserved for values the server has verified with the gateway.
    const query = `
      INSERT INTO payments (studentId, amount, amountPaise, type, status, transactionId, description, allocationStatus, recordedBy)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, 'unallocated', ?)
    `;

    db.run(query, [studentId, amountPaise / 100, amountPaise, text(type, 100) || 'online', text(transactionId, 100), text(description, 500), req.user.userId], function(err) {
      if (err) {
        console.error('Error creating transaction:', err);
        return res.status(500).json({ success: false, message: 'Failed to create transaction' });
      }

      // Emit real-time event
      if (req.io) {
        req.io.emit('payment', {
          id: transactionId,
          amount: amountPaise / 100,
          paymentOption: type,
          status: 'pending',
          studentName: req.body.studentName || 'Student',
          timestamp: new Date().toISOString()
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Transaction recorded and awaiting verification',
        status: 'pending',
        transactionId: this.lastID
      });
    });
  });
});

router.get('/student/:studentId', requirePaymentAuth, requireRoles(TRANSACTION_ROLES), (req, res) => {
  const studentId = resolveStudentScope(req, res, req.params.studentId);
  if (studentId === null) return;
  
  const query = `
    SELECT 
      p.*,
      u.name as studentName,
      u.email as studentEmail
    FROM payments p
    LEFT JOIN users u ON p.studentId = u.id
    WHERE p.studentId = ?
    ORDER BY p.createdAt DESC
  `;

  getDatabaseFromRequest(req).all(query, [studentId], (err, rows) => {
    // The gateway's signature is a server-side verification value, never sent to a browser
    (rows || []).forEach((row) => { delete row.razorpay_signature; });
    if (err) {
      console.error('Error fetching student transactions:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch student transactions' });
    }
    
    return res.status(200).json({ 
      success: true, 
      transactions: rows.map(row => ({
        ...row,
        paymentDate: new Date(row.createdAt).toLocaleDateString(),
        paymentTime: new Date(row.createdAt).toLocaleTimeString()
      }))
    });
  });
});

router.get('/stats', requirePaymentAuth, requireRoles(STAFF_ROLES), (req, res) => {
  const query = `
    SELECT 
      COUNT(DISTINCT p.studentId) as totalStudents,
      COUNT(CASE WHEN p.status = 'success' THEN 1 END) as successfulPayments,
      SUM(CASE WHEN p.status = 'success' THEN p.amount ELSE 0 END) as totalRevenue,
      COUNT(CASE WHEN DATE(p.createdAt) = DATE('now') THEN 1 END) as todayPayments
    FROM payments p
  `;

  getDatabaseFromRequest(req).get(query, (err, row) => {
    if (err) {
      console.error('Error fetching payment stats:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch payment stats' });
    }
    
    return res.status(200).json({ 
      success: true, 
      stats: row
    });
  });
});

router.post('/generate-invoice', (req, res) => {
  const { transaction, student, paymentOption, totalFees } = req.body;
  
  // Professional HTML invoice template
  const invoiceHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fee Receipt - ${transaction.transactionId}</title>
      <style>
        body { 
          font-family: 'Arial', sans-serif; 
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
          border-bottom: 3px solid #2563eb;
          padding-bottom: 20px;
          margin-bottom: 30px;
          text-align: center;
        }
        .school-info {
          text-align: center;
          margin-bottom: 20px;
        }
        .school-name {
          font-size: 28px;
          font-weight: bold;
          color: #1e40af;
          margin-bottom: 5px;
        }
        .school-address {
          color: #6b7280;
          margin-bottom: 5px;
        }
        .receipt-title {
          font-size: 24px;
          font-weight: bold;
          color: #1f2937;
          margin-bottom: 10px;
        }
        .receipt-number {
          font-size: 16px;
          color: #6b7280;
        }
        .details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin: 30px 0;
        }
        .student-info, .payment-info {
          background: #f9fafb;
          padding: 20px;
          border-radius: 8px;
          border-left: 4px solid #2563eb;
        }
        .info-title {
          font-weight: bold;
          color: #1f2937;
          margin-bottom: 15px;
          font-size: 18px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin: 8px 0;
          padding: 5px 0;
        }
        .info-label {
          color: #6b7280;
          font-weight: 500;
        }
        .info-value {
          color: #1f2937;
          font-weight: 600;
        }
        .total-section {
          background: #eff6ff;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
          border: 2px solid #2563eb;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 20px;
          font-weight: bold;
        }
        .total-amount {
          color: #2563eb;
          font-size: 24px;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          color: #6b7280;
          font-size: 14px;
        }
        .stamp {
          margin-top: 20px;
          text-align: right;
        }
        .stamp-text {
          color: #dc2626;
          font-weight: bold;
          font-size: 16px;
          border: 2px solid #dc2626;
          padding: 10px 20px;
          border-radius: 5px;
          display: inline-block;
        }
        .watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-45deg);
          font-size: 100px;
          color: #e5e7eb;
          opacity: 0.3;
          z-index: 0;
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="watermark">PAID</div>
        
        <div class="school-info">
          <div style="text-align: center; margin-bottom: 30px;">
            ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Core5 Academy" style="height: 120px; margin-bottom: 15px;" />` : ''}
          </div>
          <div class="school-address">9th floor, A Wing, KAILASH BUSINESS PARK</div>
          <div class="school-address">901/902, Park Site Rd, Vikhroli (W), Mumbai, Maharashtra 400079</div>
          <div class="school-address">Phone: +91 9876543210 | Email: accounts@core5academy.edu</div>
        </div>
        
        <div class="header">
          <div class="receipt-title">FEE RECEIPT</div>
          <div class="receipt-number">Receipt #: ${transaction.transactionId}</div>
          <div class="receipt-number">Date: ${new Date().toLocaleDateString()}</div>
        </div>
        
        <div class="details">
          <div class="student-info">
            <div class="info-title">Student Information</div>
            <div class="info-row">
              <span class="info-label">Student Name:</span>
              <span class="info-value">${student.name}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Student ID:</span>
              <span class="info-value">${student.id}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Payment Type:</span>
              <span class="info-value">${paymentOption.charAt(0).toUpperCase() + paymentOption.slice(1)}</span>
            </div>
          </div>
          
          <div class="payment-info">
            <div class="info-title">Payment Details</div>
            <div class="info-row">
              <span class="info-label">Amount Paid:</span>
              <span class="info-value">₹${transaction.amount.toLocaleString('en-IN')}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Payment Status:</span>
              <span class="info-value" style="color: #059669;">SUCCESS</span>
            </div>
            <div class="info-row">
              <span class="info-label">Payment Date:</span>
              <span class="info-value">${new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        
        <div class="total-section">
          <div class="total-row">
            <span>Total Amount Paid:</span>
            <span class="total-amount">₹${transaction.amount.toLocaleString('en-IN')}</span>
          </div>
        </div>
        
        <div class="stamp">
          <div class="stamp-text">PAID</div>
        </div>
        
        <div class="footer">
          <p>This is a computer-generated receipt and does not require a signature.</p>
          <p>Thank you for choosing Core5 Academy for your educational needs!</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Convert HTML to base64 for frontend
  const base64Invoice = Buffer.from(invoiceHtml).toString('base64');
  
  return res.status(200).json({
    success: true,
    invoice: base64Invoice,
    type: 'html'
  });
});

module.exports = router;
